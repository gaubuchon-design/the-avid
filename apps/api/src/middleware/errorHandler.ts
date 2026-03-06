import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  // AppError — known, intentional
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error(`AppError: ${err.message}`, { code: err.code, stack: err.stack });
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

  // Prisma errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002': // Unique constraint violation
        return res.status(409).json({
          error: { message: 'Resource already exists', code: 'CONFLICT', fields: err.meta?.target },
        });
      case 'P2025': // Record not found
        return res.status(404).json({
          error: { message: 'Resource not found', code: 'NOT_FOUND' },
        });
      case 'P2003': // Foreign key constraint
        return res.status(400).json({
          error: { message: 'Related resource not found', code: 'BAD_REQUEST' },
        });
      default:
        logger.error('Prisma error', { code: err.code, meta: err.meta });
    }
  }

  // JWT errors (already handled in middleware but fallthrough safety)
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: { message: 'Invalid or expired token', code: 'UNAUTHORIZED' } });
  }

  // Unknown / unexpected errors
  logger.error('Unhandled error', { message: err.message, stack: err.stack, path: req.path });

  return res.status(500).json({
    error: {
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
      ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {}),
    },
  });
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    error: { message: `Route ${req.method} ${req.path} not found`, code: 'NOT_FOUND' },
  });
}
