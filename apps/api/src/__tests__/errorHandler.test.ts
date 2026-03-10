import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { ZodError, ZodIssueCode } from 'zod';
import {
  errorHandler,
  notFoundHandler,
  requireJsonContentType,
} from '../middleware/errorHandler';
import {
  AppError,
  BadRequestError,
  NotFoundError,
  TooManyRequestsError,
  InternalServerError,
} from '../utils/errors';

// Mock logger to suppress test output
vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    http: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    method: 'GET',
    path: '/test',
    ip: '127.0.0.1',
    user: undefined,
    ...overrides,
  } as unknown as Request;
}

function createRes(): Response & { _status: number; _json: unknown; _headers: Record<string, string> } {
  const res = {
    _status: 200,
    _json: null as unknown,
    _headers: {} as Record<string, string>,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(body: unknown) {
      res._json = body;
      return res;
    },
    setHeader(name: string, value: string) {
      res._headers[name] = value;
      return res;
    },
  };
  return res as unknown as Response & { _status: number; _json: unknown; _headers: Record<string, string> };
}

const noop: NextFunction = () => {
  /* no-op */
};

// ---------------------------------------------------------------------------
// errorHandler
// ---------------------------------------------------------------------------

describe('errorHandler', () => {
  describe('AppError handling', () => {
    it('returns the correct status code and JSON body', () => {
      const err = new BadRequestError('Invalid input', { field: 'name' });
      const req = createReq();
      const res = createRes();

      errorHandler(err, req, res, noop);

      expect(res._status).toBe(400);
      expect(res._json).toEqual({
        error: {
          message: 'Invalid input',
          code: 'BAD_REQUEST',
          details: { field: 'name' },
        },
      });
    });

    it('includes requestId when present', () => {
      const err = new NotFoundError('Project');
      const req = createReq({
        headers: { 'x-request-id': 'req-123' },
      });
      const res = createRes();

      errorHandler(err, req, res, noop);

      expect(res._status).toBe(404);
      const body = res._json as { error: Record<string, unknown> };
      expect(body.error['requestId']).toBe('req-123');
    });

    it('sets Retry-After header for 429 errors', () => {
      const err = new TooManyRequestsError('Slow down', 60);
      const req = createReq();
      const res = createRes();

      errorHandler(err, req, res, noop);

      expect(res._status).toBe(429);
      expect(res._headers['Retry-After']).toBe('60');
    });

    it('handles 500-level AppErrors', () => {
      const err = new InternalServerError('Crash', { cause: 'OOM' });
      const req = createReq();
      const res = createRes();

      errorHandler(err, req, res, noop);

      expect(res._status).toBe(500);
      const body = res._json as { error: Record<string, unknown> };
      expect(body.error['code']).toBe('INTERNAL_ERROR');
    });
  });

  describe('ZodError handling', () => {
    it('returns 400 with validation error details', () => {
      const zodErr = new ZodError([
        {
          code: ZodIssueCode.too_small,
          minimum: 1,
          type: 'string',
          inclusive: true,
          exact: false,
          message: 'String must contain at least 1 character(s)',
          path: ['name'],
        },
      ]);
      const req = createReq();
      const res = createRes();

      errorHandler(zodErr, req, res, noop);

      expect(res._status).toBe(400);
      const body = res._json as { error: { code: string; details: unknown[] } };
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details).toHaveLength(1);
    });
  });

  describe('body-parser entity.too.large', () => {
    it('returns 413 for payload too large', () => {
      const err = new Error('entity too large') as Error & { type: string };
      (err as unknown as Record<string, unknown>)['type'] = 'entity.too.large';

      const req = createReq();
      const res = createRes();

      errorHandler(err, req, res, noop);

      expect(res._status).toBe(413);
      const body = res._json as { error: { code: string } };
      expect(body.error.code).toBe('PAYLOAD_TOO_LARGE');
    });
  });

  describe('malformed JSON', () => {
    it('returns 400 for parse failed SyntaxError', () => {
      const err = new SyntaxError('Unexpected token') as SyntaxError & { type: string };
      (err as unknown as Record<string, unknown>)['type'] = 'entity.parse.failed';

      const req = createReq();
      const res = createRes();

      errorHandler(err, req, res, noop);

      expect(res._status).toBe(400);
      const body = res._json as { error: { code: string } };
      expect(body.error.code).toBe('BAD_REQUEST');
    });
  });

  describe('Prisma-like errors', () => {
    it('maps P2002 to 409 conflict', () => {
      const err = new Error('Unique constraint') as Error & { code: string; meta: object };
      (err as unknown as Record<string, unknown>)['code'] = 'P2002';
      (err as unknown as Record<string, unknown>)['meta'] = { target: ['email'] };

      const req = createReq();
      const res = createRes();

      errorHandler(err, req, res, noop);

      expect(res._status).toBe(409);
    });

    it('maps P2025 to 404', () => {
      const err = new Error('Record not found') as Error & { code: string };
      (err as unknown as Record<string, unknown>)['code'] = 'P2025';

      const req = createReq();
      const res = createRes();

      errorHandler(err, req, res, noop);

      expect(res._status).toBe(404);
    });

    it('maps unrecognized Prisma codes to 500', () => {
      const err = new Error('Unknown Prisma error') as Error & { code: string };
      (err as unknown as Record<string, unknown>)['code'] = 'P9999';

      const req = createReq();
      const res = createRes();

      errorHandler(err, req, res, noop);

      expect(res._status).toBe(500);
    });
  });

  describe('JWT errors', () => {
    it('returns 401 for JsonWebTokenError', () => {
      const err = new Error('jwt malformed');
      err.name = 'JsonWebTokenError';

      const req = createReq();
      const res = createRes();

      errorHandler(err, req, res, noop);

      expect(res._status).toBe(401);
      const body = res._json as { error: { code: string } };
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 for TokenExpiredError', () => {
      const err = new Error('jwt expired');
      err.name = 'TokenExpiredError';

      const req = createReq();
      const res = createRes();

      errorHandler(err, req, res, noop);

      expect(res._status).toBe(401);
    });
  });

  describe('unknown errors', () => {
    it('returns 500 for unhandled errors in production', () => {
      const originalEnv = process.env['NODE_ENV'];
      process.env['NODE_ENV'] = 'production';

      const err = new Error('Unexpected crash');
      const req = createReq();
      const res = createRes();

      errorHandler(err, req, res, noop);

      expect(res._status).toBe(500);
      const body = res._json as { error: { message: string } };
      expect(body.error.message).toBe('Internal server error');

      process.env['NODE_ENV'] = originalEnv;
    });

    it('exposes error message in non-production', () => {
      const originalEnv = process.env['NODE_ENV'];
      process.env['NODE_ENV'] = 'development';

      const err = new Error('Debug info');
      const req = createReq();
      const res = createRes();

      errorHandler(err, req, res, noop);

      expect(res._status).toBe(500);
      const body = res._json as { error: { message: string } };
      expect(body.error.message).toBe('Debug info');

      process.env['NODE_ENV'] = originalEnv;
    });
  });
});

// ---------------------------------------------------------------------------
// notFoundHandler
// ---------------------------------------------------------------------------

describe('notFoundHandler', () => {
  it('returns 404 with route info', () => {
    const req = createReq({ method: 'GET', path: '/api/v1/nonexistent' });
    const res = createRes();

    notFoundHandler(req, res);

    expect(res._status).toBe(404);
    const body = res._json as { error: { message: string; code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toContain('GET');
    expect(body.error.message).toContain('/api/v1/nonexistent');
  });

  it('includes requestId when present', () => {
    const req = createReq({
      method: 'POST',
      path: '/missing',
      headers: { 'x-request-id': 'abc-123' },
    });
    const res = createRes();

    notFoundHandler(req, res);

    const body = res._json as { error: { requestId?: string } };
    expect(body.error.requestId).toBe('abc-123');
  });
});

// ---------------------------------------------------------------------------
// requireJsonContentType
// ---------------------------------------------------------------------------

describe('requireJsonContentType', () => {
  it('allows GET requests through', () => {
    const req = createReq({ method: 'GET' });
    const res = createRes();
    const next = vi.fn();

    requireJsonContentType(req, res as unknown as Response, next);

    expect(next).toHaveBeenCalled();
  });

  it('allows POST with application/json', () => {
    const req = createReq({
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': '10' },
    });
    const res = createRes();
    const next = vi.fn();

    requireJsonContentType(req, res as unknown as Response, next);

    expect(next).toHaveBeenCalled();
  });

  it('allows POST with multipart/form-data', () => {
    const req = createReq({
      method: 'POST',
      headers: {
        'content-type': 'multipart/form-data; boundary=----abc',
        'content-length': '500',
      },
    });
    const res = createRes();
    const next = vi.fn();

    requireJsonContentType(req, res as unknown as Response, next);

    expect(next).toHaveBeenCalled();
  });

  it('allows POST with no body (content-length=0)', () => {
    const req = createReq({
      method: 'POST',
      headers: { 'content-length': '0' },
    });
    const res = createRes();
    const next = vi.fn();

    requireJsonContentType(req, res as unknown as Response, next);

    expect(next).toHaveBeenCalled();
  });

  it('rejects POST with unsupported content type', () => {
    const req = createReq({
      method: 'POST',
      headers: { 'content-type': 'text/plain', 'content-length': '10' },
    });
    const res = createRes();
    const next = vi.fn();

    requireJsonContentType(req, res as unknown as Response, next);

    expect(res._status).toBe(415);
  });
});
