import winston from 'winston';
import path from 'path';
import { config } from '../config';

const { combine, timestamp, errors, json, colorize, simple, printf } = winston.format;

const devFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${timestamp} [${level}]: ${stack || message}${metaStr}`;
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
    })
  );
}

export const logger = winston.createLogger({
  level: config.logging.level,
  transports,
  exitOnError: false,
});

export function requestLogger() {
  return (req: any, res: any, next: any) => {
    const start = Date.now();
    res.on('finish', () => {
      const ms = Date.now() - start;
      logger.http(`${req.method} ${req.path}`, {
        status: res.statusCode,
        ms,
        ip: req.ip,
        userId: req.user?.id,
      });
    });
    next();
  };
}
