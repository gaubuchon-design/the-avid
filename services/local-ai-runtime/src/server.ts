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
// Bootstrap
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json({ limit: '10mb' }));

// CORS middleware for development
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (_req.method === 'OPTIONS') {
    res.sendStatus(204);
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
        console.log(`[${SERVICE_NAME}] Backend "${backend.name}" initialized.`);
      }
    } catch (err) {
      console.warn(
        `[${SERVICE_NAME}] Backend "${backend.name}" skipped:`,
        (err as Error).message,
      );
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
    res.status(500).json({ error: (err as Error).message });
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
  const capability = req.query['capability'] as ModelCapability | undefined;
  const models = capability
    ? registry.findByCapability(capability)
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
    res.status(404).json({ error: `Model "${modelId}" not found.` });
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

    if (!request.modelId || !request.capability || !request.input) {
      res.status(400).json({
        error: 'Request body must include modelId, capability, and input.',
      });
      return;
    }

    // Validate model exists in the registry
    const model = registry.getModel(request.modelId);
    if (!model) {
      res.status(404).json({ error: `Model "${request.modelId}" not found in registry.` });
      return;
    }

    const backend = await resolveBackend(request.capability);
    const result = await backend.execute(request);
    res.json(result);
  } catch (err) {
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

    const backend = await resolveBackend('embedding');
    const result = await generateEmbeddings(texts, registry, backend, { modelId });
    res.json(result);
  } catch (err) {
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

    if (!audioPath) {
      res.status(400).json({ error: '`audioPath` is required.' });
      return;
    }

    const backend = await resolveBackend('stt');
    const result = await transcribe(audioPath, registry, backend, {
      language,
      modelId,
    });
    res.json(result);
  } catch (err) {
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

    if (!text || !sourceLanguage || !targetLanguage) {
      res.status(400).json({
        error: '`text`, `sourceLanguage`, and `targetLanguage` are required.',
      });
      return;
    }

    if (text.length > 100_000) {
      res.status(400).json({ error: '`text` exceeds maximum length of 100,000 characters.' });
      return;
    }

    const backend = await resolveBackend('translation');
    const result = await translate(text, sourceLanguage, targetLanguage, registry, backend, {
      modelId,
    });
    res.json(result);
  } catch (err) {
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
    const capability = req.params['capability'] as ModelCapability;

    const validCapabilities: readonly ModelCapability[] = [
      'embedding', 'stt', 'translation', 'text-generation',
      'vision', 'semantic-analysis', 'query-rewrite',
    ];

    if (!validCapabilities.includes(capability)) {
      res.status(400).json({
        error: `Invalid capability "${capability}". Must be one of: ${validCapabilities.join(', ')}`,
      });
      return;
    }

    const backend = await resolveBackend(capability);
    const result = await runBenchmark(capability, registry, backend);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(`[${SERVICE_NAME}] Unhandled error:`, err);
  res.status(500).json({ error: 'Internal server error.' });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

let httpServer: ReturnType<typeof app.listen> | null = null;
let isShuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`[${SERVICE_NAME}] Received ${signal}, shutting down gracefully...`);

  // Shut down all backends (release GPU memory, unload models)
  for (const backend of allBackends) {
    try {
      await backend.shutdown();
      console.log(`[${SERVICE_NAME}] Backend "${backend.name}" shut down.`);
    } catch (err) {
      console.error(
        `[${SERVICE_NAME}] Error shutting down backend "${backend.name}":`,
        (err as Error).message,
      );
    }
  }

  // Close the HTTP server
  if (httpServer) {
    httpServer.close(() => {
      console.log(`[${SERVICE_NAME}] HTTP server closed`);
      process.exit(0);
    });
  } else {
    process.exit(0);
  }

  // Force exit after 10 seconds if graceful shutdown stalls
  setTimeout(() => {
    console.error(`[${SERVICE_NAME}] Forced exit after shutdown timeout`);
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const PORT = Number(process.env['PORT']) || 4300;

initializeBackends()
  .then(() => {
    httpServer = app.listen(PORT, () => {
      console.log(
        `[${SERVICE_NAME}] v${SERVICE_VERSION} listening on http://localhost:${PORT}`,
      );
      console.log(
        `[${SERVICE_NAME}] ${registry.listAll().length} models registered.`,
      );
    });
  })
  .catch((err) => {
    console.error(`[${SERVICE_NAME}] Failed to initialize:`, err);
    process.exit(1);
  });

export { app, registry, allBackends, resolveBackend };
