import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import { ZodError } from 'zod';
import multer from 'multer';

type PrismaLikeKnownRequestError = Error & {
  code: string;
  meta?: {
    target?: unknown;
  };
};

/** Express body-parser sets `type` on SyntaxError for malformed JSON */
type BodyParserSyntaxError = SyntaxError & { status?: number; type?: string; body?: string };

function isPrismaKnownRequestError(err: Error): err is PrismaLikeKnownRequestError {
  const maybePrismaError = err as unknown as { code?: unknown };
  return typeof maybePrismaError.code === 'string'
    && /^P\d{4}$/.test(maybePrismaError.code);
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  // Build request context for structured logging
  const requestContext = {
    requestId: req.headers['x-request-id'] as string | undefined,
    userId: req.user?.id,
    method: req.method,
    path: req.path,
  };

  // AppError — known, intentional
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error(`AppError: ${err.message}`, { ...requestContext, code: err.code, stack: err.stack });
    } else if (err.statusCode >= 400) {
      logger.warn(`AppError: ${err.message}`, { ...requestContext, code: err.code });
    }
    return res.status(err.statusCode).json(err.toJSON());
  }

  // Zod validation (shouldn't usually reach here if validate() middleware is used)
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        message: 'Validation failed',
        code: 'BAD_REQUEST',
        details: err.errors.map((e) => ({ path: e.path.join('.'), message: e.message })),
      },
    });
  }

  // Multer errors (file upload)
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
      error: { message: mapped.message, code: err.code },
    });
  }

  // Body-parser payload too large (express.json / express.urlencoded limit exceeded)
  if ((err as any).type === 'entity.too.large') {
    return res.status(413).json({
      error: { message: 'Request payload too large', code: 'PAYLOAD_TOO_LARGE' },
    });
  }

  // Malformed JSON body
  if (err instanceof SyntaxError && (err as BodyParserSyntaxError).type === 'entity.parse.failed') {
    return res.status(400).json({
      error: { message: 'Malformed JSON in request body', code: 'BAD_REQUEST' },
    });
  }

  // Prisma errors
  if (isPrismaKnownRequestError(err)) {
    switch (err.code) {
      case 'P2002': // Unique constraint violation
        logger.warn('Prisma unique constraint violation', { ...requestContext, code: err.code, meta: err.meta });
        return res.status(409).json({
          error: { message: 'Resource already exists', code: 'CONFLICT', fields: err.meta?.target },
        });
      case 'P2025': // Record not found
        return res.status(404).json({
          error: { message: 'Resource not found', code: 'NOT_FOUND' },
        });
      case 'P2003': // Foreign key constraint
        logger.warn('Prisma foreign key constraint', { ...requestContext, code: err.code, meta: err.meta });
        return res.status(400).json({
          error: { message: 'Related resource not found', code: 'BAD_REQUEST' },
        });
      default:
        logger.error('Prisma error', { ...requestContext, code: err.code, meta: err.meta });
    }
  }

  // JWT errors (already handled in middleware but fallthrough safety)
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: { message: 'Invalid or expired token', code: 'UNAUTHORIZED' } });
  }

  // Unknown / unexpected errors
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
      ...(requestContext.requestId ? { requestId: requestContext.requestId } : {}),
    },
  });
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    error: { message: `Route ${req.method} ${req.path} not found`, code: 'NOT_FOUND' },
  });
}
