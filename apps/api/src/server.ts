import 'express-async-errors';
import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { logger } from './utils/logger';
import { connectDb, disconnectDb } from './db/client';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { initWebSocket } from './websocket';

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

// ─── App Setup ─────────────────────────────────────────────────────────────────
const app = express();
const httpServer = http.createServer(app);

// ─── Security & Parsing ────────────────────────────────────────────────────────
app.set('trust proxy', 1);

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false, // handled by frontend
}));

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || config.cors.origins.includes(origin) || config.isDev) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
}));

app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ─── Rate Limiting ─────────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many requests', code: 'RATE_LIMITED' } },
});
app.use(limiter);

// Stricter limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 20,
  message: { error: { message: 'Too many auth attempts', code: 'RATE_LIMITED' } },
});

// ─── Health Check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: process.env.npm_package_version ?? '0.1.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    env: config.env,
  });
});

app.get('/health/db', async (_req, res) => {
  try {
    const { db } = await import('./db/client');
    await db.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'connected' });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' });
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

// ─── Start ─────────────────────────────────────────────────────────────────────
async function start() {
  try {
    await connectDb();

    httpServer.listen(config.server.port, () => {
      logger.info(`
╔═══════════════════════════════════════════════════╗
║           The Avid — API Server                   ║
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
  logger.info(`Received ${signal}, shutting down gracefully…`);
  httpServer.close(async () => {
    await disconnectDb();
    logger.info('Server closed');
    process.exit(0);
  });
  setTimeout(() => { logger.error('Forced shutdown'); process.exit(1); }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => { logger.error('Uncaught exception', err); process.exit(1); });
process.on('unhandledRejection', (reason) => { logger.error('Unhandled rejection', reason); });

start();

export { app, httpServer, ws };
