import 'express-async-errors';
import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import { config } from './config';
import { logger, requestLogger } from './utils/logger';
import { connectDb, disconnectDb, checkDbHealth, getQueryMetrics } from './db/client';
import { errorHandler, notFoundHandler, requireJsonContentType, requestDuration } from './middleware/errorHandler';
import { initWebSocket } from './websocket';
import exportRoutes from './routes/export';

// ─── Route Imports ─────────────────────────────────────────────────────────────
import authRoutes from './routes/auth';
import projectRoutes from './routes/projects';
import mediaRoutes from './routes/media';
import timelineRouter from './routes/timeline';
import aiRoutes from './routes/ai';
import { collabRouter, publishRouter, socialRouter } from './routes/collaboration';
import marketplaceRoutes from './routes/marketplace';
import newsRoutes from './routes/news';
import sportsRoutes from './routes/sports';
import brandRoutes from './routes/brand';
import protoolsRoutes from './routes/protools';
import nexisRoutes from './routes/nexis';
import creatorRoutes from './routes/creator';
import renderRoutes from './routes/render';

// ─── App Setup ─────────────────────────────────────────────────────────────────
const app = express();
const httpServer = http.createServer(app);

// ─── Request ID injection ──────────────────────────────────────────────────────
app.use((req, _res, next) => {
  req.headers['x-request-id'] = req.headers['x-request-id'] || uuidv4();
  next();
});

// ─── Request Logging ───────────────────────────────────────────────────────────
app.use(requestLogger());

// ─── Security & Parsing ────────────────────────────────────────────────────────
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],
      scriptSrc: ["'none'"],
      styleSrc: ["'none'"],
      imgSrc: ["'none'"],
      connectSrc: ["'self'"],
      fontSrc: ["'none'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      baseUri: ["'self'"],
    },
  },
  hsts: config.isProd ? { maxAge: 63072000, includeSubDomains: true, preload: true } : false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// ─── Permissions Policy ────────────────────────────────────────────────────
app.use((_req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  next();
});

// ─── HTTPS enforcement in production ───────────────────────────────────────
if (config.isProd) {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, `https://${req.headers['host'] ?? ''}${req.url}`);
    }
    next();
  });
}

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || config.cors.origins.includes(origin) || config.isDev) {
      callback(null, true);
    } else {
      logger.warn(`CORS rejection: origin=${origin}`);
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  exposedHeaders: ['X-Request-ID', 'X-RateLimit-Remaining'],
}));

// ─── Response Compression ────────────────────────────────────────────────────
// Configure compression with threshold and level tuning:
// - threshold: minimum response size to compress (1KB avoids overhead on tiny responses)
// - level: zlib compression level (6 = good balance of speed/ratio for API JSON)
// - filter: skip compression for already-compressed formats and event-stream
app.use(compression({
  threshold: 1024,
  level: 6,
  filter: (req, res) => {
    const contentType = res.getHeader('Content-Type');
    if (typeof contentType === 'string' && contentType.includes('text/event-stream')) {
      return false;
    }
    return compression.filter(req, res);
  },
}));
app.use(requestDuration);
app.use(requireJsonContentType);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ─── Rate Limiting ─────────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many requests', code: 'RATE_LIMITED' } },
  keyGenerator: (req) => req.ip ?? req.headers['x-forwarded-for']?.toString() ?? 'unknown',
});
app.use(limiter);

// Stricter limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many auth attempts', code: 'RATE_LIMITED' } },
});

// Upload-specific limiter (more generous for large media uploads)
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 200,
  message: { error: { message: 'Too many upload requests', code: 'RATE_LIMITED' } },
});

// ─── Health Check ──────────────────────────────────────────────────────────────

/** Liveness probe -- always responds if the process is running */
app.get('/health', (_req, res) => {
  // Cache health response for 5 seconds to avoid per-request overhead
  res.setHeader('Cache-Control', 'no-store');

  // In production, only expose minimal health info to unauthenticated callers
  if (config.isProd) {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const mem = process.memoryUsage();
  res.json({
    status: 'ok',
    version: process.env['npm_package_version'] ?? '0.1.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    env: config.env,
    memoryUsage: {
      rss: Math.round(mem.rss / 1024 / 1024),
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
      external: Math.round(mem.external / 1024 / 1024),
      arrayBuffers: Math.round(mem.arrayBuffers / 1024 / 1024),
    },
    queryMetrics: getQueryMetrics(),
  });
});

/** Database-specific health check */
app.get('/health/db', async (_req, res) => {
  try {
    const dbHealth = await checkDbHealth();
    if (dbHealth.ok) {
      res.json({ status: 'ok', db: 'connected', latencyMs: dbHealth.latencyMs });
    } else {
      res.status(503).json({ status: 'error', db: 'disconnected', latencyMs: dbHealth.latencyMs });
    }
  } catch (err) {
    logger.error('Health check /health/db failed', { error: err instanceof Error ? err.message : String(err) });
    res.status(503).json({ status: 'error', db: 'error', latencyMs: -1 });
  }
});

/** Readiness probe -- checks all critical dependencies */
app.get('/health/ready', async (_req, res) => {
  const checks: Record<string, { ok: boolean; latencyMs?: number; error?: string }> = {};

  // Database check
  try {
    const dbHealth = await checkDbHealth();
    checks['database'] = { ok: dbHealth.ok, latencyMs: dbHealth.latencyMs };
  } catch (err) {
    checks['database'] = { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }

  const allOk = Object.values(checks).every((c) => c.ok);

  const payload = {
    status: allOk ? 'ready' : 'not_ready',
    timestamp: new Date().toISOString(),
    checks,
  };

  if (allOk) {
    res.json(payload);
  } else {
    res.status(503).json(payload);
  }
});

// ─── API Routes ────────────────────────────────────────────────────────────────
const api = express.Router();

api.use('/auth', authLimiter, authRoutes);
api.use('/projects', projectRoutes);
api.use('/', mediaRoutes);  // /projects/:projectId/bins + /media (with mergeParams)
api.use('/ai', aiRoutes);
api.use('/marketplace', marketplaceRoutes);
api.use('/social-connections', socialRouter);
api.use('/', exportRoutes); // /projects/:projectId/export/*, /projects/:projectId/import/*

// Project-scoped nested routes
api.use('/projects/:projectId/timelines', timelineRouter);
api.use('/projects/:projectId', collabRouter);    // comments, approvals, locks
api.use('/projects/:projectId/publish', publishRouter);

// Vertical workflow routes
api.use('/news', newsRoutes);
api.use('/sports', sportsRoutes);
api.use('/brand', brandRoutes);
api.use('/protools', protoolsRoutes);
api.use('/nexis', nexisRoutes);
api.use('/creator', creatorRoutes);
api.use('/render', renderRoutes);

app.use('/api/v1', api);

// ─── API docs redirect ─────────────────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.json({
    name: 'The Avid API',
    version: 'v1',
    docs: '/api/v1/docs',
    health: '/health',
  });
});

// ─── Error Handlers ────────────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ─── WebSocket ─────────────────────────────────────────────────────────────────
const ws = initWebSocket(httpServer);

// ─── Periodic Memory Monitoring ─────────────────────────────────────────────
let memoryLogTimer: ReturnType<typeof setInterval> | null = null;
const MEMORY_LOG_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const HEAP_WARNING_THRESHOLD = 0.85; // 85% of heap limit

function startMemoryMonitoring(): void {
  memoryLogTimer = setInterval(() => {
    const mem = process.memoryUsage();
    const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(mem.heapTotal / 1024 / 1024);
    const rssMB = Math.round(mem.rss / 1024 / 1024);
    const heapRatio = mem.heapUsed / mem.heapTotal;

    if (heapRatio > HEAP_WARNING_THRESHOLD) {
      logger.warn('High heap usage detected', {
        heapUsedMB,
        heapTotalMB,
        rssMB,
        heapPercent: Math.round(heapRatio * 100),
        externalMB: Math.round(mem.external / 1024 / 1024),
      });
    } else {
      logger.debug('Memory usage', {
        heapUsedMB,
        heapTotalMB,
        rssMB,
        heapPercent: Math.round(heapRatio * 100),
      });
    }
  }, MEMORY_LOG_INTERVAL_MS);

  // Don't keep process alive for monitoring
  if (typeof memoryLogTimer === 'object' && 'unref' in memoryLogTimer) {
    memoryLogTimer.unref();
  }
}

function stopMemoryMonitoring(): void {
  if (memoryLogTimer) {
    clearInterval(memoryLogTimer);
    memoryLogTimer = null;
  }
}

// ─── Start ─────────────────────────────────────────────────────────────────────
let isShuttingDown = false;

async function start() {
  try {
    await connectDb();
    startMemoryMonitoring();

    httpServer.listen(config.server.port, () => {
      logger.info(`
╔═══════════════════════════════════════════════════╗
║           The Avid -- API Server                  ║
╠═══════════════════════════════════════════════════╣
║  Port   : ${String(config.server.port).padEnd(38)}║
║  Env    : ${config.env.padEnd(38)}║
║  URL    : ${config.server.baseUrl.padEnd(38)}║
╚═══════════════════════════════════════════════════╝`);
    });
  } catch (err) {
    logger.error('Failed to start server', err);
    process.exit(1);
  }
}

// ─── Graceful Shutdown ─────────────────────────────────────────────────────────
const shutdown = async (signal: string) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`Received ${signal}, shutting down gracefully...`);

  // Stop accepting new connections
  httpServer.close(async () => {
    try {
      // Close WebSocket connections
      ws.io.close();
      // Stop memory monitoring
      stopMemoryMonitoring();
      // Disconnect database
      await disconnectDb();
      logger.info('Server closed cleanly');
      process.exit(0);
    } catch (err) {
      logger.error('Error during shutdown', err);
      process.exit(1);
    }
  });

  // Force shutdown after 15 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 15000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { message: err.message, stack: err.stack, name: err.name });
  // Only exit for non-operational errors; operational errors should be handled by middleware
  if (!('isOperational' in err) || !err.isOperational) {
    process.exit(1);
  }
});
process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error
    ? { message: reason.message, stack: reason.stack, name: reason.name }
    : { reason: String(reason) };
  logger.error('Unhandled rejection', msg);
});

start();

export { app, httpServer, ws };
