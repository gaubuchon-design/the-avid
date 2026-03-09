import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import { ZodError } from 'zod';
import { config } from '../config';

// ─── Prisma error type guard ────────────────────────────────────────────────────

type PrismaLikeKnownRequestError = Error & {
  code: string;
  meta?: {
    target?: unknown;
    cause?: string;
  };
};

function isPrismaKnownRequestError(err: Error): err is PrismaLikeKnownRequestError {
  const maybePrismaError = err as unknown as { code?: unknown };
  return typeof maybePrismaError.code === 'string'
    && /^P\d{4}$/.test(maybePrismaError.code);
}

// ─── Multer error type guard ────────────────────────────────────────────────────
function isMulterError(err: Error): boolean {
  return err.constructor?.name === 'MulterError';
}

// ─── Error handler middleware ────────────────────────────────────────────────────

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  const requestId = req.headers['x-request-id'] as string | undefined;

  // AppError -- known, intentional
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error(`AppError: ${err.message}`, {
        code: err.code,
        stack: err.stack,
        path: req.path,
        requestId,
      });
    }
    return res.status(err.statusCode).json({
      ...err.toJSON(),
      ...(requestId ? { requestId } : {}),
    });
  }

  // Zod validation (shouldn't usually reach here if validate() middleware is used)
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: err.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
          code: e.code,
        })),
      },
      ...(requestId ? { requestId } : {}),
    });
  }

  // Prisma errors
  if (isPrismaKnownRequestError(err)) {
    switch (err.code) {
      case 'P2002': // Unique constraint violation
        return res.status(409).json({
          error: { message: 'Resource already exists', code: 'CONFLICT', fields: err.meta?.target },
          ...(requestId ? { requestId } : {}),
        });
      case 'P2025': // Record not found
        return res.status(404).json({
          error: { message: 'Resource not found', code: 'NOT_FOUND' },
          ...(requestId ? { requestId } : {}),
        });
      case 'P2003': // Foreign key constraint
        return res.status(400).json({
          error: { message: 'Related resource not found', code: 'FOREIGN_KEY_ERROR' },
          ...(requestId ? { requestId } : {}),
        });
      case 'P2014': // Required relation violation
        return res.status(400).json({
          error: { message: 'Required relation constraint violation', code: 'RELATION_ERROR' },
          ...(requestId ? { requestId } : {}),
        });
      case 'P2016': // Query interpretation error
        return res.status(400).json({
          error: { message: 'Invalid query parameters', code: 'QUERY_ERROR' },
          ...(requestId ? { requestId } : {}),
        });
      default:
        logger.error('Unhandled Prisma error', {
          code: err.code,
          meta: err.meta,
          path: req.path,
          requestId,
        });
    }
  }

  // JWT errors (already handled in middleware but fallthrough safety)
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: { message: 'Invalid or expired token', code: 'UNAUTHORIZED' },
      ...(requestId ? { requestId } : {}),
    });
  }

  // Multer errors (file upload)
  if (isMulterError(err)) {
    const message = (err as any).code === 'LIMIT_FILE_SIZE'
      ? 'File too large'
      : `Upload error: ${err.message}`;
    return res.status(400).json({
      error: { message, code: 'UPLOAD_ERROR' },
      ...(requestId ? { requestId } : {}),
    });
  }

  // Payload too large
  if ((err as any).type === 'entity.too.large') {
    return res.status(413).json({
      error: { message: 'Request body too large', code: 'PAYLOAD_TOO_LARGE' },
      ...(requestId ? { requestId } : {}),
    });
  }

  // JSON parse errors
  if ((err as any).type === 'entity.parse.failed') {
    return res.status(400).json({
      error: { message: 'Invalid JSON in request body', code: 'INVALID_JSON' },
      ...(requestId ? { requestId } : {}),
    });
  }

  // Unknown / unexpected errors
  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    requestId,
  });

  return res.status(500).json({
    error: {
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
      ...(config.isDev ? { stack: err.stack, debugMessage: err.message } : {}),
    },
    ...(requestId ? { requestId } : {}),
  });
}

// ─── 404 handler ────────────────────────────────────────────────────────────────

export function notFoundHandler(req: Request, res: Response) {
  const requestId = req.headers['x-request-id'] as string | undefined;
  res.status(404).json({
    error: {
      message: `Route ${req.method} ${req.path} not found`,
      code: 'NOT_FOUND',
    },
    ...(requestId ? { requestId } : {}),
  });
}
