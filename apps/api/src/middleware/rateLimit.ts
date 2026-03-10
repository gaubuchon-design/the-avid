import rateLimit from 'express-rate-limit';
import type { Request } from 'express';
import { logger } from '../utils/logger';
import { config } from '../config';

// ─── Rate Limiter Factory ────────────────────────────────────────────────────

function createLimiter(opts: {
  windowMs: number;
  max: number;
  message: string;
  code?: string;
  /** If true, 5xx responses won't count towards the rate limit */
  skipFailedRequests?: boolean;
  keyGenerator?: (req: Request) => string;
}) {
  return rateLimit({
    windowMs: opts.windowMs,
    max: opts.max,
    standardHeaders: true,
    legacyHeaders: false,
    skipFailedRequests: opts.skipFailedRequests ?? false,
    message: {
      error: {
        message: opts.message,
        code: opts.code ?? 'RATE_LIMITED',
      },
    },
    handler: (_req, res, _next, options) => {
      const retryAfterSeconds = Math.ceil(opts.windowMs / 1000);
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(429).json(options.message);
      logger.warn('Rate limit exceeded', {
        code: opts.code ?? 'RATE_LIMITED',
        ip: _req.ip,
        path: _req.path,
        userId: (_req.user?.id as string | undefined),
      });
    },
    keyGenerator:
      opts.keyGenerator ??
      ((req) => {
        // Use userId for authenticated users (more generous), IP for anonymous
        const userId = req.user?.id;
        if (userId) return `user:${userId}`;
        return req.ip ?? req.headers['x-forwarded-for']?.toString() ?? 'unknown';
      }),
  });
}

// ─── Pre-built limiters by endpoint category ─────────────────────────────────

/** Global API limiter: 1000 req / 15 min */
export const globalLimiter = createLimiter({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: 'Too many requests, please try again later',
});

/** Auth endpoints: 20 req / 15 min (by IP only to prevent brute force) */
export const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many authentication attempts, please try again later',
  code: 'AUTH_RATE_LIMITED',
  skipFailedRequests: true,
  keyGenerator: (req) =>
    req.ip ?? req.headers['x-forwarded-for']?.toString() ?? 'unknown',
});

/** Upload endpoints: 200 req / 1 hour */
export const uploadLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 200,
  message: 'Too many upload requests, please try again later',
  code: 'UPLOAD_RATE_LIMITED',
});

/** AI job endpoints: 60 req / 15 min */
export const aiLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: 'Too many AI requests, please try again later',
  code: 'AI_RATE_LIMITED',
});

/** Write operations (POST/PUT/PATCH/DELETE): 300 req / 15 min */
export const writeLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: 'Too many write operations, please try again later',
  code: 'WRITE_RATE_LIMITED',
});

/** Read-heavy endpoints: 2000 req / 15 min */
export const readLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  message: 'Too many read requests, please try again later',
  code: 'READ_RATE_LIMITED',
});
