import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { config } from '../config';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log:
      config.isDev
        ? [
            { emit: 'event', level: 'query' },
            { emit: 'event', level: 'warn' },
            { emit: 'event', level: 'error' },
          ]
        : [
            { emit: 'event', level: 'warn' },
            { emit: 'event', level: 'error' },
          ],
  });

  return client;
}

// Singleton pattern — reuse in dev (hot-reload safe)
export const db: PrismaClient =
  global.__prisma ?? (global.__prisma = createPrismaClient());

// ─── Query logging (dev only) ────────────────────────────────────────────────
if (config.isDev) {
  const SLOW_QUERY_THRESHOLD_MS = 200;
  db.$on('query' as any, (e: any) => {
    if (e.duration > SLOW_QUERY_THRESHOLD_MS) {
      logger.warn('Slow query detected', {
        query: e.query?.slice(0, 500),
        params: e.params?.slice(0, 200),
        duration: `${e.duration}ms`,
        threshold: `${SLOW_QUERY_THRESHOLD_MS}ms`,
      });
    }
  });
}

// ─── Warning and error logging (all environments) ────────────────────────────
db.$on('warn' as any, (e: any) => {
  logger.warn('Prisma warning', { message: e.message });
});

db.$on('error' as any, (e: any) => {
  logger.error('Prisma error', { message: e.message, target: e.target });
});

/**
 * Connect to the database. Should be called during server startup.
 */
export async function connectDb(): Promise<void> {
  try {
    await db.$connect();
    logger.info('Database connected');
  } catch (err: any) {
    logger.error('Database connection failed', { error: err.message });
    throw err;
  }
}

/**
 * Disconnect from the database. Should be called during graceful shutdown.
 */
export async function disconnectDb(): Promise<void> {
  try {
    await db.$disconnect();
    logger.info('Database disconnected');
  } catch (err: any) {
    logger.error('Database disconnect error', { error: err.message });
  }
}

/**
 * Health check: verify database connectivity with a simple query.
 */
export async function checkDbHealth(): Promise<{ ok: boolean; latencyMs: number }> {
  const start = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    return { ok: true, latencyMs: Date.now() - start };
  } catch {
    return { ok: false, latencyMs: Date.now() - start };
  }
}
