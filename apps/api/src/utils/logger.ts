import winston from 'winston';
import path from 'path';
import type { Request, Response, NextFunction } from 'express';
import { config } from '../config';

const { combine, timestamp, errors, json, colorize, printf } = winston.format;

const devFormat = printf(({ level, message, timestamp: ts, stack, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${ts} [${level}]: ${stack || message}${metaStr}`;
});

const transports: winston.transport[] = [
  new winston.transports.Console({
    format: config.isDev
      ? combine(colorize(), timestamp({ format: 'HH:mm:ss' }), errors({ stack: true }), devFormat)
      : combine(timestamp(), errors({ stack: true }), json()),
  }),
];

if (config.isProd) {
  transports.push(
    new winston.transports.File({
      filename: path.resolve(config.logging.file),
      format: combine(timestamp(), errors({ stack: true }), json()),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.resolve(config.logging.file.replace('.log', '.error.log')),
      format: combine(timestamp(), errors({ stack: true }), json()),
      level: 'error',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 10,
    })
  );
}

export const logger = winston.createLogger({
  level: config.logging.level,
  defaultMeta: { service: 'avid-api' },
  transports,
  exitOnError: false,
});

// ─── Request logging middleware ───────────────────────────────────────────────

export function requestLogger() {
  return (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    const requestId = req.headers['x-request-id'];

    // Set response header for request tracing
    res.setHeader('X-Request-ID', requestId ?? '');

    res.on('finish', () => {
      const ms = Date.now() - start;
      const logData = {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms,
        ip: req.ip,
        userId: req.user?.id,
        requestId,
        contentLength: res.getHeader('content-length'),
        userAgent: req.headers['user-agent']?.slice(0, 100),
      };

      // Log at different levels based on status code
      if (res.statusCode >= 500) {
        logger.error(`${req.method} ${req.path} ${res.statusCode}`, logData);
      } else if (res.statusCode >= 400) {
        logger.warn(`${req.method} ${req.path} ${res.statusCode}`, logData);
      } else if (ms > 1000) {
        logger.warn(`Slow request: ${req.method} ${req.path}`, logData);
      } else {
        logger.http(`${req.method} ${req.path} ${res.statusCode}`, logData);
      }
    });

    next();
  };
}

/**
 * Create a child logger with additional context fields.
 * Useful for per-request or per-service logging.
 */
export function createChildLogger(meta: Record<string, unknown>) {
  return logger.child(meta);
}
