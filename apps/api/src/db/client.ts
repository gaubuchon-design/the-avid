import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { config } from '../config';
import { DatabaseConnectionError } from '../utils/errors';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

// ─── Connection Pool Configuration ───────────────────────────────────────────
// Prisma connection pool is configured via the DATABASE_URL query params:
//   ?connection_limit=10&pool_timeout=20
// These defaults can be overridden by setting:
//   DATABASE_POOL_SIZE (default: 10 for production, 5 for dev)
//   DATABASE_POOL_TIMEOUT (default: 20 seconds)
//
// Recommended indexes for optimal query performance:
//   CREATE INDEX idx_project_member_user ON "ProjectMember"("userId");
//   CREATE INDEX idx_project_deleted_at ON "Project"("deletedAt") WHERE "deletedAt" IS NULL;
//   CREATE INDEX idx_project_updated_at ON "Project"("updatedAt" DESC);
//   CREATE INDEX idx_media_asset_bin ON "MediaAsset"("binId");
//   CREATE INDEX idx_media_asset_status ON "MediaAsset"("status");
//   CREATE INDEX idx_media_asset_type ON "MediaAsset"("type");
//   CREATE INDEX idx_bin_project ON "Bin"("projectId");
//   CREATE INDEX idx_bin_parent ON "Bin"("parentId");
//   CREATE INDEX idx_clip_media_asset ON "Clip"("mediaAssetId");
//   CREATE INDEX idx_ai_job_status ON "AIJob"("status");
//   CREATE INDEX idx_project_version_project ON "ProjectVersion"("projectId", "createdAt" DESC);
//   CREATE INDEX idx_media_asset_transcript_search ON "MediaAsset" USING gin(to_tsvector('english', "transcript"));

// ─── Query metrics tracking ─────────────────────────────────────────────────
interface QueryMetrics {
  totalQueries: number;
  slowQueries: number;
  totalDurationMs: number;
  avgDurationMs: number;
  lastResetAt: number;
}

const queryMetrics: QueryMetrics = {
  totalQueries: 0,
  slowQueries: 0,
  totalDurationMs: 0,
  avgDurationMs: 0,
  lastResetAt: Date.now(),
};

/** Get a snapshot of query performance metrics. */
export function getQueryMetrics(): Readonly<QueryMetrics> {
  return {
    ...queryMetrics,
    avgDurationMs: queryMetrics.totalQueries > 0
      ? Math.round(queryMetrics.totalDurationMs / queryMetrics.totalQueries)
      : 0,
  };
}

/** Reset query metrics (e.g. after collecting for monitoring). */
export function resetQueryMetrics(): void {
  queryMetrics.totalQueries = 0;
  queryMetrics.slowQueries = 0;
  queryMetrics.totalDurationMs = 0;
  queryMetrics.avgDurationMs = 0;
  queryMetrics.lastResetAt = Date.now();
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
    // Prisma 5 datasource configuration is done via the DATABASE_URL,
    // but we document the recommended pool settings here:
    // datasourceUrl: config.db.url + '?connection_limit=10&pool_timeout=20'
  });

  return client;
}

// Singleton pattern — reuse in dev (hot-reload safe)
export const db: PrismaClient =
  global.__prisma ?? (global.__prisma = createPrismaClient());

// ─── Query logging & metrics (dev only for detailed, all envs for slow) ─────
const SLOW_QUERY_THRESHOLD_MS = config.isDev ? 200 : 500;

/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma event types require runtime string keys */
if (config.isDev) {
  db.$on('query' as any, (e: { duration?: number; query?: string; params?: string }) => {
    queryMetrics.totalQueries++;
    queryMetrics.totalDurationMs += (e.duration ?? 0);

    if ((e.duration ?? 0) > SLOW_QUERY_THRESHOLD_MS) {
      queryMetrics.slowQueries++;
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
db.$on('warn' as any, (e: { message: string }) => {
  logger.warn('Prisma warning', { message: e.message });
});

db.$on('error' as any, (e: { message: string; target?: string }) => {
  logger.error('Prisma error', { message: e.message, target: e.target });
});
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Connect to the database with retry logic. Should be called during server startup.
 */
export async function connectDb(maxRetries = 3, delayMs = 2000): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await db.$connect();
      logger.info('Database connected', { attempt });
      return;
    } catch (err: unknown) {
      const errMsg = (err as Error).message ?? String(err);
      logger.error(`Database connection failed (attempt ${attempt}/${maxRetries})`, {
        error: errMsg,
        attempt,
        maxRetries,
      });

      if (attempt === maxRetries) {
        throw new DatabaseConnectionError(
          `Failed to connect to database after ${maxRetries} attempts: ${errMsg}`
        );
      }

      // Wait before retrying with exponential backoff
      const waitMs = delayMs * Math.pow(2, attempt - 1);
      logger.info(`Retrying database connection in ${waitMs}ms...`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

/**
 * Disconnect from the database. Should be called during graceful shutdown.
 */
export async function disconnectDb(): Promise<void> {
  try {
    await db.$disconnect();
    logger.info('Database disconnected');
  } catch (err: unknown) {
    logger.error('Database disconnect error', { error: (err as Error).message });
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
