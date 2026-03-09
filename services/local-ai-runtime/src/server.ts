/**
 * @module server
 *
 * Express HTTP server for the local AI runtime.  Exposes REST endpoints for
 * model inference, health monitoring, and benchmarking.
 *
 * Start with:
 *   PORT=4300 npx tsx src/server.ts
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import { SERVICE_NAME, SERVICE_VERSION } from './index';
import { ModelRegistry } from './ModelRegistry';
import { createSeededRegistry } from './registry-seed';
import { MockBackend } from './backends/MockBackend';
import { ONNXBackend } from './backends/ONNXBackend';
import { TensorRTBackend } from './backends/TensorRTBackend';
import { LlamaCppBackend } from './backends/LlamaCppBackend';
import { MLXBackend } from './backends/MLXBackend';
import { CTranslate2Backend } from './backends/CTranslate2Backend';
import { getHealthInfo, runBenchmark } from './health';
import { generateEmbeddings } from './capabilities/embedding';
import { transcribe } from './capabilities/stt';
import { translate } from './capabilities/translation';
import type { IModelBackend, ModelCapability, ModelRequest } from './ModelRunner';

// ---------------------------------------------------------------------------
// Structured logger
// ---------------------------------------------------------------------------

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

function log(level: LogLevel, message: string, meta: Record<string, unknown> = {}): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: SERVICE_NAME,
    message,
    ...meta,
  };
  const output = JSON.stringify(entry);
  if (level === 'error') {
    process.stderr.write(output + '\n');
  } else {
    process.stdout.write(output + '\n');
  }
}

// ---------------------------------------------------------------------------
// Environment variable validation
// ---------------------------------------------------------------------------

interface EnvConfig {
  readonly port: number;
  readonly corsOrigin: string;
  readonly rateLimitWindowMs: number;
  readonly rateLimitMaxRequests: number;
  readonly inferenceTimeoutMs: number;
  readonly authToken: string | undefined;
}

function validateEnv(): EnvConfig {
  const port = Number(process.env['PORT']) || 4300;
  if (port < 1 || port > 65535) {
    throw new Error(`Invalid PORT value: ${process.env['PORT']}. Must be between 1 and 65535.`);
  }

  return {
    port,
    corsOrigin: process.env['CORS_ORIGIN'] || '*',
    rateLimitWindowMs: Number(process.env['RATE_LIMIT_WINDOW_MS']) || 60_000,
    rateLimitMaxRequests: Number(process.env['RATE_LIMIT_MAX_REQUESTS']) || 60,
    inferenceTimeoutMs: Number(process.env['INFERENCE_TIMEOUT_MS']) || 120_000,
    authToken: process.env['AUTH_TOKEN'],
  };
}

const envConfig = validateEnv();

// ---------------------------------------------------------------------------
// Rate limiter (in-memory, token-bucket style)
// ---------------------------------------------------------------------------

interface RateLimitBucket {
  tokens: number;
  lastRefill: number;
}

class RateLimiter {
  private readonly buckets = new Map<string, RateLimitBucket>();
  private readonly windowMs: number;
  private readonly maxTokens: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(windowMs: number, maxTokens: number) {
    this.windowMs = windowMs;
    this.maxTokens = maxTokens;
    this.cleanupTimer = setInterval(() => this.cleanup(), windowMs * 2);
    this.cleanupTimer.unref();
  }

  consume(key: string): boolean {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = { tokens: this.maxTokens - 1, lastRefill: now };
      this.buckets.set(key, bucket);
      return true;
    }

    const elapsed = now - bucket.lastRefill;
    if (elapsed >= this.windowMs) {
      bucket.tokens = this.maxTokens;
      bucket.lastRefill = now;
    }

    if (bucket.tokens <= 0) {
      return false;
    }

    bucket.tokens--;
    return true;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.lastRefill > this.windowMs * 2) {
        this.buckets.delete(key);
      }
    }
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.buckets.clear();
  }
}

const rateLimiter = new RateLimiter(envConfig.rateLimitWindowMs, envConfig.rateLimitMaxRequests);

// ---------------------------------------------------------------------------
// Input sanitization
// ---------------------------------------------------------------------------

/** Strip control characters and null bytes from untrusted string input. */
function sanitizeString(input: string): string {
  // eslint-disable-next-line no-control-regex
  return input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

// ---------------------------------------------------------------------------
// Inference timeout wrapper
// ---------------------------------------------------------------------------

/** Execute a backend operation with a timeout. */
async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });

  try {
    const result = await Promise.race([operation, timeoutPromise]);
    return result;
  } finally {
    if (timer !== null) {
      clearTimeout(timer);
    }
  }
}

// ---------------------------------------------------------------------------
// Valid capabilities
// ---------------------------------------------------------------------------

const VALID_CAPABILITIES: readonly ModelCapability[] = [
  'embedding', 'stt', 'translation', 'text-generation',
  'vision', 'semantic-analysis', 'query-rewrite',
];

function isValidCapability(value: string): value is ModelCapability {
  return (VALID_CAPABILITIES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json({ limit: '10mb' }));

// CORS middleware — configurable via CORS_ORIGIN env var
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Access-Control-Allow-Origin', envConfig.corsOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (_req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

// Rate limiting middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path === '/health') {
    next();
    return;
  }

  const clientKey = req.ip || req.socket.remoteAddress || 'unknown';
  if (!rateLimiter.consume(clientKey)) {
    log('warn', 'Rate limit exceeded', { clientKey, path: req.path });
    res.status(429).json({ error: 'Too many requests. Please try again later.' });
    return;
  }
  next();
});

// Authentication middleware — optional, enabled when AUTH_TOKEN is set
app.use((req: Request, res: Response, next: NextFunction) => {
  if (!envConfig.authToken) {
    next();
    return;
  }

  if (req.path === '/health') {
    next();
    return;
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header.' });
    return;
  }

  const token = authHeader.slice(7);
  if (token !== envConfig.authToken) {
    res.status(403).json({ error: 'Invalid authentication token.' });
    return;
  }

  next();
});

/** Pre-seeded model registry. */
const registry: ModelRegistry = createSeededRegistry();

/** All known backend instances (order = preference). */
const allBackends: IModelBackend[] = [
  new ONNXBackend(),
  new TensorRTBackend(),
  new LlamaCppBackend(),
  new MLXBackend(),
  new CTranslate2Backend(),
  new MockBackend(),
];

/**
 * Resolve the first available backend that supports the requested
 * capability, falling back to MockBackend.
 */
async function resolveBackend(capability: ModelCapability): Promise<IModelBackend> {
  for (const backend of allBackends) {
    if (
      backend.supportedCapabilities.includes(capability) &&
      (await backend.isAvailable())
    ) {
      return backend;
    }
  }
  // MockBackend is always available and supports all capabilities
  const mock = allBackends.find((b) => b.name === 'mock');
  if (mock) return mock;
  throw new Error('No backend available (not even MockBackend).');
}

// ---------------------------------------------------------------------------
// Initialise backends
// ---------------------------------------------------------------------------

async function initializeBackends(): Promise<void> {
  for (const backend of allBackends) {
    try {
      if (await backend.isAvailable()) {
        await backend.initialize();
        log('info', `Backend initialized`, { backend: backend.name });
      }
    } catch (err) {
      log('warn', `Backend skipped`, {
        backend: backend.name,
        error: (err as Error).message,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Routes — Health
// ---------------------------------------------------------------------------

/**
 * GET /health
 *
 * Enhanced health endpoint with backend availability, memory stats, and
 * model count.
 */
app.get('/health', async (_req: Request, res: Response) => {
  try {
    const info = await getHealthInfo(SERVICE_NAME, SERVICE_VERSION, allBackends, registry);
    res.json(info);
  } catch (err) {
    log('error', 'Health check failed', { error: (err as Error).message });
    res.status(500).json({ error: 'Health check failed.' });
  }
});

// ---------------------------------------------------------------------------
// Routes — Models
// ---------------------------------------------------------------------------

/**
 * GET /models
 *
 * List all models in the registry, optionally filtered by `?capability=`.
 */
app.get('/models', (req: Request, res: Response) => {
  const capability = req.query['capability'] as string | undefined;

  if (capability && !isValidCapability(capability)) {
    res.status(400).json({
      error: `Invalid capability "${capability}". Must be one of: ${VALID_CAPABILITIES.join(', ')}`,
    });
    return;
  }

  const models = capability
    ? registry.findByCapability(capability as ModelCapability)
    : registry.listAll();
  res.json({ models, count: models.length });
});

/**
 * GET /models/:id
 *
 * Retrieve a specific model by ID.
 */
app.get('/models/:id', (req: Request, res: Response) => {
  const modelId = req.params['id'] as string;
  const model = registry.getModel(modelId);
  if (!model) {
    res.status(404).json({ error: `Model not found.` });
    return;
  }
  res.json(model);
});

// ---------------------------------------------------------------------------
// Routes — Inference
// ---------------------------------------------------------------------------

/**
 * POST /infer
 *
 * Execute a generic model request.  The body must conform to
 * {@link ModelRequest}.
 */
app.post('/infer', async (req: Request, res: Response) => {
  try {
    const request = req.body as ModelRequest;

    if (!request.modelId || typeof request.modelId !== 'string') {
      res.status(400).json({ error: '`modelId` is required and must be a string.' });
      return;
    }

    if (!request.capability || !isValidCapability(request.capability)) {
      res.status(400).json({
        error: `\`capability\` is required and must be one of: ${VALID_CAPABILITIES.join(', ')}`,
      });
      return;
    }

    if (!request.input || typeof request.input !== 'object') {
      res.status(400).json({ error: '`input` is required and must be an object.' });
      return;
    }

    // Validate model exists in the registry
    const model = registry.getModel(request.modelId);
    if (!model) {
      res.status(404).json({ error: `Model not found in registry.` });
      return;
    }

    const backend = await resolveBackend(request.capability);
    const result = await withTimeout(
      backend.execute(request),
      envConfig.inferenceTimeoutMs,
      `Inference (${request.capability})`,
    );
    res.json(result);
  } catch (err) {
    log('error', 'POST /infer error', { error: (err as Error).message });
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * POST /embed
 *
 * Shorthand for embedding generation.
 *
 * Body: `{ texts: string[], modelId?: string }`
 */
app.post('/embed', async (req: Request, res: Response) => {
  try {
    const { texts, modelId } = req.body as {
      texts?: string[];
      modelId?: string;
    };

    if (!texts || !Array.isArray(texts) || texts.length === 0) {
      res.status(400).json({ error: '`texts` must be a non-empty string array.' });
      return;
    }

    if (texts.length > 1000) {
      res.status(400).json({ error: '`texts` array exceeds maximum batch size of 1000.' });
      return;
    }

    if (texts.some((t: unknown) => typeof t !== 'string')) {
      res.status(400).json({ error: 'All entries in `texts` must be strings.' });
      return;
    }

    // Validate individual text lengths
    const maxTextLength = 50_000;
    if (texts.some((t) => t.length > maxTextLength)) {
      res.status(400).json({ error: `Individual text entries must not exceed ${maxTextLength} characters.` });
      return;
    }

    if (modelId !== undefined && typeof modelId !== 'string') {
      res.status(400).json({ error: '`modelId` must be a string.' });
      return;
    }

    const backend = await resolveBackend('embedding');
    const result = await withTimeout(
      generateEmbeddings(texts, registry, backend, { modelId }),
      envConfig.inferenceTimeoutMs,
      'Embedding generation',
    );
    res.json(result);
  } catch (err) {
    log('error', 'POST /embed error', { error: (err as Error).message });
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * POST /transcribe
 *
 * Shorthand for speech-to-text.
 *
 * Body: `{ audioPath: string, language?: string, modelId?: string }`
 */
app.post('/transcribe', async (req: Request, res: Response) => {
  try {
    const { audioPath, language, modelId } = req.body as {
      audioPath?: string;
      language?: string;
      modelId?: string;
    };

    if (!audioPath || typeof audioPath !== 'string') {
      res.status(400).json({ error: '`audioPath` is required and must be a string.' });
      return;
    }

    // Sanitize audioPath — prevent path traversal
    const sanitizedPath = sanitizeString(audioPath);
    if (sanitizedPath.includes('..')) {
      res.status(400).json({ error: '`audioPath` must not contain path traversal sequences.' });
      return;
    }

    if (sanitizedPath.length > 4096) {
      res.status(400).json({ error: '`audioPath` exceeds maximum length of 4096 characters.' });
      return;
    }

    if (language !== undefined && typeof language !== 'string') {
      res.status(400).json({ error: '`language` must be a string.' });
      return;
    }

    const backend = await resolveBackend('stt');
    const result = await withTimeout(
      transcribe(sanitizedPath, registry, backend, { language, modelId }),
      envConfig.inferenceTimeoutMs,
      'Transcription',
    );
    res.json(result);
  } catch (err) {
    log('error', 'POST /transcribe error', { error: (err as Error).message });
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * POST /translate
 *
 * Shorthand for translation.
 *
 * Body: `{ text: string, sourceLanguage: string, targetLanguage: string, modelId?: string }`
 */
app.post('/translate', async (req: Request, res: Response) => {
  try {
    const { text, sourceLanguage, targetLanguage, modelId } = req.body as {
      text?: string;
      sourceLanguage?: string;
      targetLanguage?: string;
      modelId?: string;
    };

    if (!text || typeof text !== 'string') {
      res.status(400).json({ error: '`text` is required and must be a string.' });
      return;
    }

    if (!sourceLanguage || typeof sourceLanguage !== 'string') {
      res.status(400).json({ error: '`sourceLanguage` is required and must be a string.' });
      return;
    }

    if (!targetLanguage || typeof targetLanguage !== 'string') {
      res.status(400).json({ error: '`targetLanguage` is required and must be a string.' });
      return;
    }

    if (text.length > 100_000) {
      res.status(400).json({ error: '`text` exceeds maximum length of 100,000 characters.' });
      return;
    }

    // Validate language codes are reasonable (BCP-47 format)
    const langCodePattern = /^[a-z]{2,3}(-[A-Z]{2,4})?$/;
    if (!langCodePattern.test(sourceLanguage)) {
      res.status(400).json({ error: '`sourceLanguage` must be a valid BCP-47 language code (e.g. "en", "fr-FR").' });
      return;
    }
    if (!langCodePattern.test(targetLanguage)) {
      res.status(400).json({ error: '`targetLanguage` must be a valid BCP-47 language code (e.g. "en", "fr-FR").' });
      return;
    }

    const backend = await resolveBackend('translation');
    const result = await withTimeout(
      translate(text, sourceLanguage, targetLanguage, registry, backend, { modelId }),
      envConfig.inferenceTimeoutMs,
      'Translation',
    );
    res.json(result);
  } catch (err) {
    log('error', 'POST /translate error', { error: (err as Error).message });
    res.status(500).json({ error: (err as Error).message });
  }
});

// ---------------------------------------------------------------------------
// Routes — Benchmark
// ---------------------------------------------------------------------------

/**
 * GET /benchmark/:capability
 *
 * Run a quick latency benchmark for the specified capability.
 */
app.get('/benchmark/:capability', async (req: Request, res: Response) => {
  try {
    const capability = req.params['capability'] as string;

    if (!isValidCapability(capability)) {
      res.status(400).json({
        error: `Invalid capability "${capability}". Must be one of: ${VALID_CAPABILITIES.join(', ')}`,
      });
      return;
    }

    const backend = await resolveBackend(capability);
    const result = await withTimeout(
      runBenchmark(capability, registry, backend),
      envConfig.inferenceTimeoutMs,
      `Benchmark (${capability})`,
    );
    res.json(result);
  } catch (err) {
    log('error', 'GET /benchmark error', { error: (err as Error).message });
    res.status(500).json({ error: (err as Error).message });
  }
});

// ---------------------------------------------------------------------------
// Global error handler
// ---------------------------------------------------------------------------

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  log('error', 'Unhandled express error', {
    error: err.message,
    stack: err.stack,
  });

  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ---------------------------------------------------------------------------
// Unhandled rejection / uncaught exception handlers
// ---------------------------------------------------------------------------

process.on('unhandledRejection', (reason: unknown) => {
  log('error', 'Unhandled promise rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

process.on('uncaughtException', (error: Error) => {
  log('error', 'Uncaught exception', {
    error: error.message,
    stack: error.stack,
  });
  void gracefulShutdown('uncaughtException');
});

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

let httpServer: ReturnType<typeof app.listen> | null = null;
let isShuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  log('info', `Received ${signal}, shutting down gracefully...`);

  rateLimiter.destroy();

  // Shut down all backends (release GPU memory, unload models)
  for (const backend of allBackends) {
    try {
      await backend.shutdown();
      log('info', `Backend shut down`, { backend: backend.name });
    } catch (err) {
      log('error', `Error shutting down backend`, {
        backend: backend.name,
        error: (err as Error).message,
      });
    }
  }

  // Close the HTTP server
  if (httpServer) {
    httpServer.close(() => {
      log('info', 'HTTP server closed');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }

  // Force exit after 10 seconds if graceful shutdown stalls
  setTimeout(() => {
    log('error', 'Forced exit after shutdown timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

initializeBackends()
  .then(() => {
    httpServer = app.listen(envConfig.port, () => {
      log('info', 'Service started', {
        version: SERVICE_VERSION,
        port: envConfig.port,
        corsOrigin: envConfig.corsOrigin,
        registeredModels: registry.listAll().length,
        authEnabled: !!envConfig.authToken,
      });
    });
  })
  .catch((err) => {
    log('error', 'Failed to initialize', { error: (err as Error).message });
    process.exit(1);
  });

export { app, registry, allBackends, resolveBackend };
