import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { config } from '../config';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function createPrismaClient() {
  return new PrismaClient({
    log:
      config.isDev
        ? [
            { emit: 'event', level: 'query' },
            { emit: 'event', level: 'warn' },
            { emit: 'event', level: 'error' },
          ]
        : [{ emit: 'event', level: 'error' }],
  });
}

// Singleton pattern — reuse in dev (hot-reload safe)
export const db: PrismaClient =
  global.__prisma ?? (global.__prisma = createPrismaClient());

if (config.isDev) {
  db.$on('query', (e: any) => {
    if (e.duration > 200) {
      logger.warn('Slow query', { query: e.query, duration: `${e.duration}ms` });
    }
  });
}

db.$on('error', (e: any) => logger.error('Prisma error', e));

export async function connectDb(): Promise<void> {
  await db.$connect();
  logger.info('Database connected');
}

export async function disconnectDb(): Promise<void> {
  await db.$disconnect();
  logger.info('Database disconnected');
}
