/**
 * @module server
 * @description Express + WebSocket server for the Agent Orchestrator.
 *
 * Provides REST endpoints for plan lifecycle management and a WebSocket
 * connection that emits real-time plan status updates to connected clients.
 *
 * ## REST API
 *
 * | Method | Path                               | Description                    |
 * |--------|------------------------------------|--------------------------------|
 * | GET    | /health                            | Service health check           |
 * | POST   | /intent                            | Process a user intent          |
 * | GET    | /plans                             | List all active plans          |
 * | GET    | /plans/:id                         | Get a specific plan            |
 * | POST   | /plans/:id/approve                 | Approve a plan                 |
 * | POST   | /plans/:id/reject                  | Reject a plan                  |
 * | POST   | /plans/:id/cancel                  | Cancel a plan                  |
 * | POST   | /plans/:id/compensate              | Compensate (undo) a plan       |
 * | POST   | /plans/:id/steps/:stepId/approve   | Approve a single step          |
 * | GET    | /analytics                         | Get analytics entries          |
 * | GET    | /tools                             | List registered tools          |
 *
 * ## WebSocket
 *
 * Emits `plan-update` messages whenever a plan's status changes:
 * ```json
 * { "type": "plan-update", "plan": { ... } }
 * ```
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { SERVICE_NAME, SERVICE_VERSION } from './index';
import { OrchestratorService } from './OrchestratorService';
import type { AgentContext } from './types';
import type { AnalyticsFilter, AnalyticsEventType } from './logging/AnalyticsLogger';

// ---------------------------------------------------------------------------
// Structured logger
// ---------------------------------------------------------------------------

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly service: string;
  readonly message: string;
  readonly [key: string]: unknown;
}

function log(level: LogLevel, message: string, meta: Record<string, unknown> = {}): void {
  const entry: LogEntry = {
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
  readonly requestTimeoutMs: number;
  readonly maxWsClients: number;
  readonly geminiApiKey: string | undefined;
  readonly geminiModel: string | undefined;
  readonly authToken: string | undefined;
}

function validateEnv(): EnvConfig {
  const port = Number(process.env['PORT']) || 4100;
  if (port < 1 || port > 65535) {
    throw new Error(`Invalid PORT value: ${process.env['PORT']}. Must be between 1 and 65535.`);
  }

  const rateLimitWindowMs = Number(process.env['RATE_LIMIT_WINDOW_MS']) || 60_000;
  const rateLimitMaxRequests = Number(process.env['RATE_LIMIT_MAX_REQUESTS']) || 100;
  const requestTimeoutMs = Number(process.env['REQUEST_TIMEOUT_MS']) || 30_000;
  const maxWsClients = Number(process.env['MAX_WS_CLIENTS']) || 100;

  return {
    port,
    corsOrigin: process.env['CORS_ORIGIN'] || '*',
    rateLimitWindowMs,
    rateLimitMaxRequests,
    requestTimeoutMs,
    maxWsClients,
    geminiApiKey: process.env['GEMINI_API_KEY'],
    geminiModel: process.env['GEMINI_MODEL'],
    authToken: process.env['AUTH_TOKEN'],
  };
}

const config = validateEnv();

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

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
    // Periodically clean up stale entries to prevent memory leaks
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

    // Refill tokens based on elapsed time
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

const rateLimiter = new RateLimiter(config.rateLimitWindowMs, config.rateLimitMaxRequests);

// ---------------------------------------------------------------------------
// Input sanitization
// ---------------------------------------------------------------------------

/** Strip control characters and null bytes from untrusted string input. */
function sanitizeString(input: string): string {
  // eslint-disable-next-line no-control-regex
  return input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

// ---------------------------------------------------------------------------
// Service instance
// ---------------------------------------------------------------------------

const orchestrator = new OrchestratorService({
  geminiApiKey: config.geminiApiKey,
  geminiModel: config.geminiModel,
});

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json({ limit: '1mb' }));

// CORS middleware — configurable via CORS_ORIGIN env var
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Access-Control-Allow-Origin', config.corsOrigin);
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
  // Skip rate limiting for health checks
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

// Request timeout middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  // Skip timeout for health checks
  if (req.path === '/health') {
    next();
    return;
  }

  req.setTimeout(config.requestTimeoutMs, () => {
    if (!res.headersSent) {
      log('warn', 'Request timeout', { path: req.path, method: req.method });
      res.status(408).json({ error: 'Request timeout.' });
    }
  });
  next();
});

// Authentication middleware — optional, enabled when AUTH_TOKEN is set
function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!config.authToken) {
    next();
    return;
  }

  // Health check is always public
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
  if (token !== config.authToken) {
    res.status(403).json({ error: 'Invalid authentication token.' });
    return;
  }

  next();
}

app.use(authMiddleware);

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    uptime: process.uptime(),
    activePlans: orchestrator.getActivePlans().length,
    registeredTools: orchestrator.getTools().length,
  });
});

// ---------------------------------------------------------------------------
// POST /intent — Process user intent
// ---------------------------------------------------------------------------

app.post('/intent', async (req: Request, res: Response) => {
  try {
    const { intent, context, sessionId } = req.body as {
      intent?: string;
      context?: AgentContext;
      sessionId?: string;
    };

    if (!intent || typeof intent !== 'string') {
      throw new ValidationError('Missing or invalid "intent" field.');
    }

    const sanitizedIntent = sanitizeString(intent);

    if (sanitizedIntent.length > 10_000) {
      throw new ValidationError('Intent exceeds maximum length of 10,000 characters.');
    }

    if (sanitizedIntent.length === 0) {
      throw new ValidationError('"intent" field must not be empty after sanitization.');
    }

    if (sessionId !== undefined && typeof sessionId !== 'string') {
      throw new ValidationError('Invalid "sessionId" field: must be a string.');
    }

    if (sessionId !== undefined && sessionId.length > 256) {
      throw new ValidationError('"sessionId" exceeds maximum length of 256 characters.');
    }

    const resolvedContext: AgentContext = context ?? { projectId: 'default' };
    const resolvedSessionId = sessionId ?? uuidv4();

    const plan = await orchestrator.processIntent(sanitizedIntent, resolvedContext, resolvedSessionId);
    res.status(201).json({ plan });
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message, code: error.code });
      return;
    }
    log('error', 'POST /intent error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// GET /plans — List all active plans
// ---------------------------------------------------------------------------

app.get('/plans', (_req: Request, res: Response) => {
  const active = orchestrator.getActivePlans();
  const history = orchestrator.getHistory();
  res.json({ active, history });
});

// ---------------------------------------------------------------------------
// GET /plans/:id — Get specific plan
// ---------------------------------------------------------------------------

app.get('/plans/:id', (req: Request, res: Response) => {
  const planId = req.params['id'] as string;
  const plan = orchestrator.getPlan(planId);
  if (!plan) {
    res.status(404).json({ error: `Plan not found.`, code: 'NOT_FOUND' });
    return;
  }
  res.json({ plan });
});

// ---------------------------------------------------------------------------
// POST /plans/:id/approve — Approve a plan
// ---------------------------------------------------------------------------

app.post('/plans/:id/approve', async (req: Request, res: Response) => {
  try {
    const planId = req.params['id'] as string;
    const plan = await orchestrator.approvePlan(planId);
    res.json({ plan });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({ error: error.message, code: 'NOT_FOUND' });
      return;
    }
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to approve plan.',
      code: 'BAD_REQUEST',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /plans/:id/reject — Reject a plan
// ---------------------------------------------------------------------------

app.post('/plans/:id/reject', async (req: Request, res: Response) => {
  try {
    const planId = req.params['id'] as string;
    const { reason } = req.body as { reason?: string };

    const sanitizedReason = reason ? sanitizeString(reason).slice(0, 2000) : undefined;

    await orchestrator.rejectPlan(planId, sanitizedReason);
    res.json({ status: 'rejected', planId });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({ error: error.message, code: 'NOT_FOUND' });
      return;
    }
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to reject plan.',
      code: 'BAD_REQUEST',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /plans/:id/cancel — Cancel a plan
// ---------------------------------------------------------------------------

app.post('/plans/:id/cancel', async (req: Request, res: Response) => {
  try {
    const planId = req.params['id'] as string;
    await orchestrator.cancelPlan(planId);
    res.json({ status: 'cancelled', planId });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({ error: error.message, code: 'NOT_FOUND' });
      return;
    }
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to cancel plan.',
      code: 'BAD_REQUEST',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /plans/:id/compensate — Compensate (undo) a plan
// ---------------------------------------------------------------------------

app.post('/plans/:id/compensate', async (req: Request, res: Response) => {
  try {
    const planId = req.params['id'] as string;
    const result = await orchestrator.compensatePlan(planId);
    res.json({ planId, ...result });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({ error: error.message, code: 'NOT_FOUND' });
      return;
    }
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to compensate plan.',
      code: 'BAD_REQUEST',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /plans/:id/steps/:stepId/approve — Approve a single step
// ---------------------------------------------------------------------------

app.post('/plans/:id/steps/:stepId/approve', async (req: Request, res: Response) => {
  try {
    const planId = req.params['id'] as string;
    const stepId = req.params['stepId'] as string;
    const step = await orchestrator.approveStep(planId, stepId);
    res.json({ step });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({ error: error.message, code: 'NOT_FOUND' });
      return;
    }
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to approve step.',
      code: 'BAD_REQUEST',
    });
  }
});

// ---------------------------------------------------------------------------
// GET /analytics — Get analytics entries
// ---------------------------------------------------------------------------

const VALID_ANALYTICS_TYPES: readonly string[] = [
  'prompt', 'plan', 'approval', 'override', 'execution', 'token-usage',
];

app.get('/analytics', (req: Request, res: Response) => {
  const sessionId = req.query['sessionId'] as string | undefined;
  const planId = req.query['planId'] as string | undefined;
  const type = req.query['type'] as string | undefined;

  // Validate the type filter
  if (type && !VALID_ANALYTICS_TYPES.includes(type)) {
    res.status(400).json({
      error: `Invalid analytics type "${type}". Must be one of: ${VALID_ANALYTICS_TYPES.join(', ')}`,
      code: 'VALIDATION_ERROR',
    });
    return;
  }

  const filter: AnalyticsFilter = {};
  if (sessionId) (filter as Record<string, string>)['sessionId'] = sessionId;
  if (planId) (filter as Record<string, string>)['planId'] = planId;
  if (type) (filter as Record<string, string>)['type'] = type as AnalyticsEventType;

  const hasFilter = sessionId || planId || type;
  const entries = orchestrator.getAnalytics().getEntries(
    hasFilter ? filter : undefined,
  );

  res.json({ entries, count: entries.length });
});

// ---------------------------------------------------------------------------
// GET /tools — List registered tools
// ---------------------------------------------------------------------------

app.get('/tools', (_req: Request, res: Response) => {
  const tools = orchestrator.getTools();
  res.json({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      adapter: t.adapter,
      requiresConfirmation: t.requiresConfirmation,
      tokenCost: t.tokenCost,
    })),
    count: tools.length,
  });
});

// ---------------------------------------------------------------------------
// Global error handler
// ---------------------------------------------------------------------------

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message, code: err.code });
    return;
  }

  log('error', 'Unhandled express error', {
    error: err.message,
    stack: err.stack,
  });

  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

// ---------------------------------------------------------------------------
// WebSocket handling
// ---------------------------------------------------------------------------

/** Track connected WebSocket clients. */
const wsClients: Set<WebSocket> = new Set();

wss.on('connection', (ws: WebSocket) => {
  // Enforce maximum WebSocket connections
  if (wsClients.size >= config.maxWsClients) {
    log('warn', 'Max WebSocket clients reached, rejecting connection', {
      current: wsClients.size,
      max: config.maxWsClients,
    });
    ws.close(1013, 'Maximum connections reached');
    return;
  }

  log('info', 'WebSocket client connected', { clients: wsClients.size + 1 });
  wsClients.add(ws);

  ws.on('message', (data) => {
    try {
      // Limit message size to prevent abuse
      const rawMessage = data.toString();
      if (rawMessage.length > 65_536) {
        ws.send(JSON.stringify({ type: 'error', message: 'Message too large' }));
        return;
      }

      const message = JSON.parse(rawMessage) as { type?: string; id?: string };
      log('debug', 'WebSocket message received', { type: message.type ?? 'unknown' });

      // Handle ping/pong
      if (message.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
        return;
      }

      // Acknowledge
      ws.send(JSON.stringify({ type: 'ack', id: message.id }));
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
    }
  });

  ws.on('close', () => {
    log('info', 'WebSocket client disconnected', { clients: wsClients.size - 1 });
    wsClients.delete(ws);
  });

  ws.on('error', (error) => {
    log('error', 'WebSocket error', { error: error.message });
    wsClients.delete(ws);
  });
});

/**
 * Broadcast a plan update to all connected WebSocket clients.
 */
function broadcastPlanUpdate(plan: unknown): void {
  const message = JSON.stringify({ type: 'plan-update', plan });

  for (const ws of wsClients) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(message);
      } catch (error) {
        log('error', 'Failed to send WebSocket message', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}

// Subscribe the orchestrator to broadcast plan updates
orchestrator.subscribe((plan) => {
  broadcastPlanUpdate(plan);
});

// ---------------------------------------------------------------------------
// WebSocket heartbeat — detect dead connections
// ---------------------------------------------------------------------------

const WS_PING_INTERVAL_MS = 30_000;
const wsAlive = new WeakMap<WebSocket, boolean>();

const heartbeatInterval = setInterval(() => {
  for (const ws of wsClients) {
    if (wsAlive.get(ws) === false) {
      log('info', 'Terminating unresponsive WebSocket client');
      wsClients.delete(ws);
      ws.terminate();
      continue;
    }
    wsAlive.set(ws, false);
    ws.ping();
  }
}, WS_PING_INTERVAL_MS);

// Listen for pong responses to mark connections as alive
wss.on('connection', (ws: WebSocket) => {
  wsAlive.set(ws, true);
  ws.on('pong', () => {
    wsAlive.set(ws, true);
  });
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
  // Exit on uncaught exceptions — the process manager should restart
  void gracefulShutdown('uncaughtException');
});

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

let isShuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  log('info', `Received ${signal}, shutting down gracefully...`);

  clearInterval(heartbeatInterval);
  rateLimiter.destroy();

  // Close all WebSocket connections
  for (const ws of wsClients) {
    try {
      ws.close(1001, 'Server shutting down');
    } catch {
      // Ignore errors during shutdown
    }
  }
  wsClients.clear();

  // Close WebSocket server
  wss.close(() => {
    log('info', 'WebSocket server closed');
  });

  // Close HTTP server (stop accepting new connections)
  server.close(() => {
    log('info', 'HTTP server closed');
    process.exit(0);
  });

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

server.listen(config.port, () => {
  log('info', `Service started`, {
    version: SERVICE_VERSION,
    port: config.port,
    corsOrigin: config.corsOrigin,
    geminiApiKey: config.geminiApiKey ? 'configured' : 'not set (using template fallback)',
    registeredTools: orchestrator.getTools().length,
    authEnabled: !!config.authToken,
  });
});

export { app, server, wss, orchestrator };
