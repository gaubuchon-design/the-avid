import { Request, Response, NextFunction } from 'express';
import { AppError, mapPrismaError } from '../utils/errors';
import { logger } from '../utils/logger';
import { ZodError } from 'zod';
import multer from 'multer';

type PrismaLikeKnownRequestError = Error & {
  code: string;
  meta?: {
    target?: unknown;
    cause?: string;
  };
};

/** Express body-parser sets `type` on SyntaxError for malformed JSON */
type BodyParserSyntaxError = SyntaxError & { status?: number; type?: string; body?: string };

function isPrismaKnownRequestError(err: Error): err is PrismaLikeKnownRequestError {
  const maybePrismaError = err as unknown as { code?: unknown };
  return typeof maybePrismaError.code === 'string'
    && /^P\d{4}$/.test(maybePrismaError.code);
}

/**
 * Central error handler middleware.
 *
 * Converts all known error types to structured JSON responses with the format:
 *   { error: { code, message, details?, requestId? } }
 *
 * Unknown errors are logged with full stack traces but only expose safe
 * messages to the client in production.
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  // Build request context for structured logging
  const requestId = req.headers['x-request-id'] as string | undefined;
  const requestContext = {
    requestId,
    userId: req.user?.id,
    method: req.method,
    path: req.path,
    ip: req.ip,
  };

  // ── AppError -- known, intentional ──────────────────────────────────────────
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error(`AppError: ${err.message}`, { ...requestContext, code: err.code, stack: err.stack });
    } else if (err.statusCode >= 400) {
      logger.warn(`AppError: ${err.message}`, { ...requestContext, code: err.code });
    }

    const body = err.toJSON();
    if (requestId) {
      (body.error as Record<string, unknown>)['requestId'] = requestId;
    }

    // Set Retry-After header for 429 responses
    if (err.statusCode === 429 && err.details && typeof err.details === 'object' && 'retryAfter' in err.details) {
      res.setHeader('Retry-After', String((err.details as { retryAfter: number }).retryAfter));
    }

    return res.status(err.statusCode).json(body);
  }

  // ── Zod validation (shouldn't usually reach here if validate() middleware is used) ──
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: err.errors.map((e) => ({ path: e.path.join('.'), message: e.message })),
        ...(requestId ? { requestId } : {}),
      },
    });
  }

  // ── Multer errors (file upload) ────────────────────────────────────────────
  if (err instanceof multer.MulterError) {
    const multerMessages: Record<string, { status: number; message: string }> = {
      LIMIT_FILE_SIZE: { status: 413, message: 'File exceeds maximum allowed size' },
      LIMIT_FILE_COUNT: { status: 400, message: 'Too many files uploaded' },
      LIMIT_FIELD_KEY: { status: 400, message: 'Field name too long' },
      LIMIT_FIELD_VALUE: { status: 400, message: 'Field value too long' },
      LIMIT_FIELD_COUNT: { status: 400, message: 'Too many fields' },
      LIMIT_UNEXPECTED_FILE: { status: 400, message: `Unexpected file field: ${err.field ?? 'unknown'}` },
      LIMIT_PART_COUNT: { status: 400, message: 'Too many parts in multipart upload' },
    };
    const mapped = multerMessages[err.code] ?? { status: 400, message: err.message };
    return res.status(mapped.status).json({
      error: { message: mapped.message, code: err.code, ...(requestId ? { requestId } : {}) },
    });
  }

  // ── Body-parser payload too large (express.json / express.urlencoded limit exceeded) ──
  if ((err as unknown as Record<string, unknown>)['type'] === 'entity.too.large') {
    return res.status(413).json({
      error: { message: 'Request payload too large', code: 'PAYLOAD_TOO_LARGE', ...(requestId ? { requestId } : {}) },
    });
  }

  // ── Malformed JSON body ────────────────────────────────────────────────────
  if (err instanceof SyntaxError && (err as BodyParserSyntaxError).type === 'entity.parse.failed') {
    return res.status(400).json({
      error: { message: 'Malformed JSON in request body', code: 'BAD_REQUEST', ...(requestId ? { requestId } : {}) },
    });
  }

  // ── Prisma errors ──────────────────────────────────────────────────────────
  if (isPrismaKnownRequestError(err)) {
    const mapped = mapPrismaError(err.code, err.meta);

    if (mapped) {
      if (mapped.statusCode >= 500) {
        logger.error('Prisma error', { ...requestContext, code: err.code, meta: err.meta, stack: err.stack });
      } else {
        logger.warn(`Prisma error: ${err.code}`, { ...requestContext, meta: err.meta });
      }

      const body = mapped.toJSON();
      if (requestId) {
        (body.error as Record<string, unknown>)['requestId'] = requestId;
      }
      return res.status(mapped.statusCode).json(body);
    }

    // Unrecognized Prisma error code -- treat as 500
    logger.error('Unhandled Prisma error', { ...requestContext, code: err.code, meta: err.meta, stack: err.stack });
    return res.status(500).json({
      error: {
        message: process.env['NODE_ENV'] === 'production' ? 'Internal server error' : `Prisma error: ${err.code}`,
        code: 'INTERNAL_ERROR',
        ...(requestId ? { requestId } : {}),
      },
    });
  }

  // ── JWT errors (already handled in middleware but fallthrough safety) ──────
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: { message: 'Invalid or expired token', code: 'UNAUTHORIZED', ...(requestId ? { requestId } : {}) },
    });
  }

  // ── CORS error ─────────────────────────────────────────────────────────────
  if (err.message?.startsWith('Origin') && err.message?.includes('not allowed by CORS')) {
    logger.warn('CORS violation', { ...requestContext, error: err.message });
    return res.status(403).json({
      error: { message: 'CORS policy violation', code: 'FORBIDDEN', ...(requestId ? { requestId } : {}) },
    });
  }

  // ── Unknown / unexpected errors ────────────────────────────────────────────
  logger.error('Unhandled error', {
    ...requestContext,
    message: err.message,
    stack: err.stack,
    name: err.name,
  });

  return res.status(500).json({
    error: {
      message: process.env['NODE_ENV'] === 'production'
        ? 'Internal server error'
        : err.message,
      code: 'INTERNAL_ERROR',
      ...(process.env['NODE_ENV'] === 'development' ? { stack: err.stack } : {}),
      ...(requestId ? { requestId } : {}),
    },
  });
}

/**
 * 404 handler for unmatched routes.
 */
export function notFoundHandler(req: Request, res: Response) {
  const requestId = req.headers['x-request-id'] as string | undefined;
  // Sanitize path to prevent reflected data injection in JSON responses
  const safePath = req.path.replace(/[<>"'&]/g, '').slice(0, 200);
  res.status(404).json({
    error: {
      message: `Route ${req.method} ${safePath} not found`,
      code: 'NOT_FOUND',
      ...(requestId ? { requestId } : {}),
    },
  });
}

/**
 * Middleware to validate Content-Type for POST/PUT/PATCH requests.
 * Rejects requests with missing or invalid Content-Type headers.
 */
export function requireJsonContentType(req: Request, res: Response, next: NextFunction) {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const contentType = req.headers['content-type'];
    // Allow multipart/form-data for file uploads
    if (contentType && (contentType.includes('application/json') || contentType.includes('multipart/form-data'))) {
      return next();
    }
    // Allow requests with no body (empty POST)
    const contentLength = req.headers['content-length'];
    if (!contentLength || contentLength === '0') {
      return next();
    }
    // If there's a body but wrong content type, reject
    if (contentType && !contentType.includes('application/x-www-form-urlencoded')) {
      return res.status(415).json({
        error: {
          message: 'Content-Type must be application/json or multipart/form-data',
          code: 'UNSUPPORTED_MEDIA_TYPE',
        },
      });
    }
  }
  next();
}

/**
 * Request duration tracking middleware.
 * Sets X-Response-Time header on all responses.
 */
export function requestDuration(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint();

  // Track response time by intercepting res.end
  const originalEnd = res.end.bind(res);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (res as any).end = function (this: Response, ...args: any[]) {
    const durationNs = process.hrtime.bigint() - start;
    const durationMs = Number(durationNs) / 1_000_000;
    // Only set header if headers haven't been sent yet
    if (!res.headersSent) {
      res.setHeader('X-Response-Time', `${durationMs.toFixed(2)}ms`);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (originalEnd as any)(...args);
  };

  next();
}
