import { describe, it, expect } from 'vitest';
import {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  GoneError,
  UnprocessableError,
  TooManyRequestsError,
  InsufficientTokensError,
  PayloadTooLargeError,
  UnsupportedMediaTypeError,
  InternalServerError,
  MediaProcessingError,
  ExternalServiceError,
  AIServiceError,
  ServiceUnavailableError,
  DatabaseConnectionError,
  assertFound,
  assertValid,
  mapPrismaError,
} from '../utils/errors';

// ---------------------------------------------------------------------------
// AppError base class
// ---------------------------------------------------------------------------

describe('AppError', () => {
  it('creates error with default values', () => {
    const err = new AppError('Something went wrong');
    expect(err.message).toBe('Something went wrong');
    expect(err.statusCode).toBe(500);
    expect(err.code).toBeUndefined();
    expect(err.details).toBeUndefined();
    expect(err.isOperational).toBe(true);
    expect(err.name).toBe('AppError');
    expect(err).toBeInstanceOf(Error);
  });

  it('creates error with custom values', () => {
    const details = { field: 'email' };
    const err = new AppError('Custom error', 418, 'TEAPOT', details, false);
    expect(err.message).toBe('Custom error');
    expect(err.statusCode).toBe(418);
    expect(err.code).toBe('TEAPOT');
    expect(err.details).toEqual(details);
    expect(err.isOperational).toBe(false);
  });

  it('serializes to JSON correctly', () => {
    const err = new AppError('Test', 400, 'TEST_CODE', { x: 1 });
    const json = err.toJSON();
    expect(json).toEqual({
      error: {
        message: 'Test',
        code: 'TEST_CODE',
        details: { x: 1 },
      },
    });
  });

  it('uses name as code when code is not provided', () => {
    const err = new AppError('Test');
    const json = err.toJSON();
    expect(json.error.code).toBe('AppError');
  });

  it('omits details from JSON when not provided', () => {
    const err = new AppError('Test', 400, 'CODE');
    const json = err.toJSON();
    expect(json.error).not.toHaveProperty('details');
  });

  it('has a captured stack trace', () => {
    const err = new AppError('Traceable');
    expect(err.stack).toBeDefined();
    expect(err.stack).toContain('Traceable');
  });
});

// ---------------------------------------------------------------------------
// HTTP error subclasses
// ---------------------------------------------------------------------------

describe('HTTP error subclasses', () => {
  it('BadRequestError defaults', () => {
    const err = new BadRequestError();
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('BAD_REQUEST');
    expect(err.message).toBe('Bad request');
    expect(err.name).toBe('BadRequestError');
    expect(err).toBeInstanceOf(AppError);
  });

  it('BadRequestError with custom message and details', () => {
    const err = new BadRequestError('Invalid input', { field: 'name' });
    expect(err.message).toBe('Invalid input');
    expect(err.details).toEqual({ field: 'name' });
  });

  it('UnauthorizedError defaults', () => {
    const err = new UnauthorizedError();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
    expect(err.message).toBe('Unauthorized');
  });

  it('UnauthorizedError with custom message', () => {
    const err = new UnauthorizedError('Token expired');
    expect(err.message).toBe('Token expired');
  });

  it('ForbiddenError defaults', () => {
    const err = new ForbiddenError();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
    expect(err.message).toBe('Forbidden');
  });

  it('NotFoundError with default resource', () => {
    const err = new NotFoundError();
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('Resource not found');
  });

  it('NotFoundError with custom resource', () => {
    const err = new NotFoundError('Project');
    expect(err.message).toBe('Project not found');
  });

  it('ConflictError defaults', () => {
    const err = new ConflictError();
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('CONFLICT');
    expect(err.message).toBe('Conflict');
  });

  it('GoneError defaults', () => {
    const err = new GoneError();
    expect(err.statusCode).toBe(410);
    expect(err.code).toBe('GONE');
  });

  it('UnprocessableError defaults', () => {
    const err = new UnprocessableError();
    expect(err.statusCode).toBe(422);
    expect(err.code).toBe('UNPROCESSABLE');
  });

  it('TooManyRequestsError with retryAfter', () => {
    const err = new TooManyRequestsError('Slow down', 30);
    expect(err.statusCode).toBe(429);
    expect(err.code).toBe('RATE_LIMITED');
    expect(err.retryAfterSeconds).toBe(30);
    expect(err.details).toEqual({ retryAfter: 30 });
  });

  it('TooManyRequestsError without retryAfter', () => {
    const err = new TooManyRequestsError();
    expect(err.retryAfterSeconds).toBeUndefined();
    expect(err.details).toBeUndefined();
  });

  it('InsufficientTokensError includes required and available', () => {
    const err = new InsufficientTokensError(100, 50);
    expect(err.statusCode).toBe(402);
    expect(err.code).toBe('INSUFFICIENT_TOKENS');
    expect(err.message).toContain('100');
    expect(err.message).toContain('50');
    expect(err.details).toEqual({ required: 100, available: 50 });
  });

  it('PayloadTooLargeError with maxSizeBytes', () => {
    const err = new PayloadTooLargeError('Too big', 1024);
    expect(err.statusCode).toBe(413);
    expect(err.code).toBe('PAYLOAD_TOO_LARGE');
    expect(err.details).toEqual({ maxSizeBytes: 1024 });
  });

  it('PayloadTooLargeError without maxSizeBytes', () => {
    const err = new PayloadTooLargeError();
    expect(err.details).toBeUndefined();
  });

  it('UnsupportedMediaTypeError defaults', () => {
    const err = new UnsupportedMediaTypeError();
    expect(err.statusCode).toBe(415);
    expect(err.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('InternalServerError is not operational', () => {
    const err = new InternalServerError();
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err.isOperational).toBe(false);
  });

  it('MediaProcessingError defaults', () => {
    const err = new MediaProcessingError('FFmpeg failed');
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('MEDIA_PROCESSING_ERROR');
    expect(err.message).toBe('FFmpeg failed');
  });

  it('ExternalServiceError with service name', () => {
    const err = new ExternalServiceError('S3');
    expect(err.statusCode).toBe(502);
    expect(err.code).toBe('EXTERNAL_SERVICE_ERROR');
    expect(err.message).toContain('S3');
    expect(err.details).toEqual({ service: 'S3' });
  });

  it('ExternalServiceError with custom message', () => {
    const err = new ExternalServiceError('Redis', 'Connection refused');
    expect(err.message).toBe('Connection refused');
  });

  it('AIServiceError defaults', () => {
    const err = new AIServiceError('Model overloaded');
    expect(err.statusCode).toBe(503);
    expect(err.code).toBe('AI_SERVICE_ERROR');
  });

  it('ServiceUnavailableError defaults', () => {
    const err = new ServiceUnavailableError();
    expect(err.statusCode).toBe(503);
    expect(err.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('DatabaseConnectionError defaults', () => {
    const err = new DatabaseConnectionError();
    expect(err.statusCode).toBe(503);
    expect(err.code).toBe('DATABASE_CONNECTION_ERROR');
  });
});

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

describe('assertFound', () => {
  it('does not throw for a defined value', () => {
    expect(() => assertFound('hello')).not.toThrow();
  });

  it('does not throw for falsy but defined values', () => {
    expect(() => assertFound(0)).not.toThrow();
    expect(() => assertFound('')).not.toThrow();
    expect(() => assertFound(false)).not.toThrow();
  });

  it('throws NotFoundError for null', () => {
    expect(() => assertFound(null)).toThrow(NotFoundError);
  });

  it('throws NotFoundError for undefined', () => {
    expect(() => assertFound(undefined)).toThrow(NotFoundError);
  });

  it('includes the resource name in the error message', () => {
    try {
      assertFound(null, 'Project');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(NotFoundError);
      expect((err as NotFoundError).message).toBe('Project not found');
    }
  });
});

describe('assertValid', () => {
  it('does not throw when condition is true', () => {
    expect(() => assertValid(true, 'All good')).not.toThrow();
  });

  it('throws BadRequestError when condition is false', () => {
    expect(() => assertValid(false, 'Validation failed')).toThrow(
      BadRequestError,
    );
  });

  it('includes custom details in the error', () => {
    try {
      assertValid(false, 'Bad', { field: 'email' });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestError);
      expect((err as BadRequestError).details).toEqual({ field: 'email' });
    }
  });
});

// ---------------------------------------------------------------------------
// mapPrismaError
// ---------------------------------------------------------------------------

describe('mapPrismaError', () => {
  it('maps P2002 to ConflictError', () => {
    const err = mapPrismaError('P2002', { target: ['email'] });
    expect(err).toBeInstanceOf(ConflictError);
    expect(err?.statusCode).toBe(409);
    expect(err?.details).toEqual({ fields: ['email'] });
  });

  it('maps P2003 to BadRequestError', () => {
    const err = mapPrismaError('P2003', { target: ['userId'] });
    expect(err).toBeInstanceOf(BadRequestError);
    expect(err?.statusCode).toBe(400);
  });

  it('maps P2014 to BadRequestError', () => {
    const err = mapPrismaError('P2014', { cause: 'Relation violation' });
    expect(err).toBeInstanceOf(BadRequestError);
    expect(err?.details).toEqual({ cause: 'Relation violation' });
  });

  it('maps P2025 to NotFoundError', () => {
    const err = mapPrismaError('P2025');
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err?.statusCode).toBe(404);
  });

  it('returns null for unknown Prisma codes', () => {
    expect(mapPrismaError('P9999')).toBeNull();
  });

  it('handles missing meta gracefully', () => {
    const err = mapPrismaError('P2002');
    expect(err).toBeInstanceOf(ConflictError);
    expect(err?.details).toEqual({ fields: undefined });
  });
});
