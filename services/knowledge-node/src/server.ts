/**
 * @module server
 *
 * Express + WebSocket server for the knowledge-node service. Exposes
 * REST endpoints for health checks and mesh operations, and handles
 * inbound WebSocket connections for mesh peer communication.
 *
 * The server can run in two modes:
 * 1. **Standalone** — default, provides health/status endpoints only.
 * 2. **Mesh** — when a {@link MeshService} is attached, enables
 *    mesh-related endpoints and peer WebSocket handling.
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { SERVICE_NAME, SERVICE_VERSION } from './index.js';
import type { MeshService } from './mesh/MeshService.js';
import type { SearchQuery } from './mesh/ScatterGatherSearch.js';

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
  readonly maxWsClients: number;
  readonly authToken: string | undefined;
}

function validateEnv(): EnvConfig {
  const port = Number(process.env['PORT']) || 4200;
  if (port < 1 || port > 65535) {
    throw new Error(`Invalid PORT value: ${process.env['PORT']}. Must be between 1 and 65535.`);
  }

  return {
    port,
    corsOrigin: process.env['CORS_ORIGIN'] || '*',
    rateLimitWindowMs: Number(process.env['RATE_LIMIT_WINDOW_MS']) || 60_000,
    rateLimitMaxRequests: Number(process.env['RATE_LIMIT_MAX_REQUESTS']) || 100,
    maxWsClients: Number(process.env['MAX_WS_CLIENTS']) || 50,
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
// Express app
// ---------------------------------------------------------------------------

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json({ limit: '1mb' }));

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

// ---------------------------------------------------------------------------
// Mesh service reference — set via `attachMeshService()`.
// ---------------------------------------------------------------------------
let meshService: MeshService | null = null;

/**
 * Attach a running MeshService to the HTTP/WS server.
 *
 * This enables mesh-related API endpoints and routes incoming WebSocket
 * connections through the mesh peer discovery layer.
 *
 * @param mesh - The MeshService instance to attach.
 */
export function attachMeshService(mesh: MeshService): void {
  meshService = mesh;
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    uptime: process.uptime(),
    mesh: meshService ? 'attached' : 'detached',
  });
});

// ---------------------------------------------------------------------------
// Mesh status — node info + peer list
// ---------------------------------------------------------------------------
app.get('/mesh/status', (_req: Request, res: Response) => {
  if (!meshService) {
    res.status(503).json({ error: 'Mesh service not attached' });
    return;
  }

  const nodeInfo = meshService.getNodeInfo();
  const peers = meshService.getPeers();

  res.json({
    node: nodeInfo,
    peers,
    conflicts: meshService.conflictHandler.getUnresolved(),
  });
});

// ---------------------------------------------------------------------------
// Mesh peers — list connected peers
// ---------------------------------------------------------------------------
app.get('/mesh/peers', (_req: Request, res: Response) => {
  if (!meshService) {
    res.status(503).json({ error: 'Mesh service not attached' });
    return;
  }

  res.json({
    peers: meshService.getPeers(),
  });
});

// ---------------------------------------------------------------------------
// Mesh shards — list local shards with lease info
// ---------------------------------------------------------------------------
app.get('/mesh/shards', (_req: Request, res: Response) => {
  if (!meshService) {
    res.status(503).json({ error: 'Mesh service not attached' });
    return;
  }

  const nodeInfo = meshService.getNodeInfo();
  const shards = nodeInfo.shardIds.map((shardId) => {
    const lease = meshService!.leaseManager.getLease(shardId);
    return {
      shardId,
      lease: lease ?? null,
      isLeaseHolder: lease
        ? meshService!.leaseManager.isLeaseHolder(shardId, nodeInfo.nodeId)
        : false,
    };
  });

  res.json({ shards });
});

// ---------------------------------------------------------------------------
// Mesh search — scatter/gather search across the mesh
// ---------------------------------------------------------------------------
app.post('/mesh/search', async (req: Request, res: Response) => {
  if (!meshService) {
    res.status(503).json({ error: 'Mesh service not attached' });
    return;
  }

  const rawText = req.body.text;
  if (!rawText || typeof rawText !== 'string') {
    res.status(400).json({ error: 'Missing required field: text (must be a string)' });
    return;
  }

  const sanitizedText = sanitizeString(rawText);

  if (sanitizedText.length === 0) {
    res.status(400).json({ error: 'Search text must not be empty after sanitization.' });
    return;
  }

  if (sanitizedText.length > 10_000) {
    res.status(400).json({ error: 'Search text exceeds maximum length of 10,000 characters' });
    return;
  }

  const topK = req.body.topK ?? 10;
  if (typeof topK !== 'number' || topK < 1 || topK > 1000 || !Number.isInteger(topK)) {
    res.status(400).json({ error: 'topK must be an integer between 1 and 1000' });
    return;
  }

  if (req.body.threshold !== undefined) {
    if (typeof req.body.threshold !== 'number' || req.body.threshold < 0 || req.body.threshold > 1) {
      res.status(400).json({ error: 'threshold must be a number between 0 and 1' });
      return;
    }
  }

  const query: SearchQuery = {
    text: sanitizedText,
    topK,
    modalities: req.body.modalities,
    threshold: req.body.threshold,
    includeProvenance: req.body.includeProvenance,
  };

  try {
    const results = await meshService.search(query);
    res.json(results);
  } catch (err) {
    log('error', 'Mesh search failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({
      error: 'Search failed',
    });
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
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// WebSocket handling — mesh protocol peers connect here
// ---------------------------------------------------------------------------

/** Track connected WebSocket clients for the standalone (non-mesh) mode. */
const standaloneWsClients: Set<WebSocket> = new Set();

wss.on('connection', (ws: WebSocket) => {
  if (meshService) {
    // Route through the mesh peer discovery layer.
    meshService.peerDiscovery.acceptConnection(ws);
  } else {
    // Enforce max connections in standalone mode
    if (standaloneWsClients.size >= envConfig.maxWsClients) {
      log('warn', 'Max WebSocket clients reached, rejecting connection', {
        current: standaloneWsClients.size,
        max: envConfig.maxWsClients,
      });
      ws.close(1013, 'Maximum connections reached');
      return;
    }

    log('info', 'Peer connected (no mesh service)', { clients: standaloneWsClients.size + 1 });
    standaloneWsClients.add(ws);

    ws.on('message', (data) => {
      try {
        const rawMessage = data.toString();
        if (rawMessage.length > 65_536) {
          ws.send(JSON.stringify({ type: 'error', message: 'Message too large' }));
          return;
        }

        const message = JSON.parse(rawMessage) as { type?: string; id?: string };
        log('debug', 'WebSocket message received', { type: message.type ?? 'unknown' });
        ws.send(JSON.stringify({ type: 'ack', id: message.id }));
      } catch {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      }
    });

    ws.on('close', () => {
      log('info', 'Peer disconnected', { clients: standaloneWsClients.size - 1 });
      standaloneWsClients.delete(ws);
    });

    ws.on('error', (error) => {
      log('error', 'WebSocket error', { error: error.message });
      standaloneWsClients.delete(ws);
    });
  }
});

// ---------------------------------------------------------------------------
// WebSocket heartbeat — detect dead connections
// ---------------------------------------------------------------------------

const WS_PING_INTERVAL_MS = 30_000;
const wsAlive = new WeakMap<WebSocket, boolean>();

const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (wsAlive.get(ws) === false) {
      log('info', 'Terminating unresponsive WebSocket client');
      ws.terminate();
      return;
    }
    wsAlive.set(ws, false);
    ws.ping();
  });
}, WS_PING_INTERVAL_MS);

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

  // Stop the mesh service if attached
  if (meshService) {
    try {
      await meshService.stop();
      log('info', 'Mesh service stopped');
    } catch (err) {
      log('error', 'Error stopping mesh service', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Close all WebSocket connections
  wss.clients.forEach((ws) => {
    try {
      ws.close(1001, 'Server shutting down');
    } catch {
      // Ignore errors during shutdown
    }
  });
  standaloneWsClients.clear();

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

server.listen(envConfig.port, () => {
  log('info', 'Service started', {
    version: SERVICE_VERSION,
    port: envConfig.port,
    corsOrigin: envConfig.corsOrigin,
    authEnabled: !!envConfig.authToken,
  });
});

export { app, server, wss };
