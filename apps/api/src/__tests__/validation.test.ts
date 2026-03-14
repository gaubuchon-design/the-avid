import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  validate,
  validateAll,
  sanitizeString,
  sanitizedString,
  uuidParam,
  paginationQuery,
  paginate,
  cursorPaginate,
  schemas,
} from '../utils/validation';

// ---------------------------------------------------------------------------
// sanitizeString
// ---------------------------------------------------------------------------

describe('sanitizeString', () => {
  it('trims whitespace', () => {
    expect(sanitizeString('  hello  ')).toBe('hello');
  });

  it('replaces < with &lt;', () => {
    expect(sanitizeString('<script>')).toBe('&lt;script&gt;');
  });

  it('replaces > with &gt;', () => {
    expect(sanitizeString('a > b')).toBe('a &gt; b');
  });

  it('replaces double quotes with &quot;', () => {
    expect(sanitizeString('say "hello"')).toBe('say &quot;hello&quot;');
  });

  it("replaces single quotes with &#x27;", () => {
    expect(sanitizeString("it's")).toBe("it&#x27;s");
  });

  it('handles a string with multiple dangerous characters', () => {
    const input = '  <img onerror="alert(\'xss\')" />  ';
    const output = sanitizeString(input);
    expect(output).not.toContain('<');
    expect(output).not.toContain('>');
    expect(output).not.toContain('"');
    expect(output).not.toContain("'");
  });

  it('handles an empty string', () => {
    expect(sanitizeString('')).toBe('');
  });

  it('handles a string with only whitespace', () => {
    expect(sanitizeString('   ')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// sanitizedString Zod transform
// ---------------------------------------------------------------------------

describe('sanitizedString', () => {
  it('parses and sanitizes a string', () => {
    const result = sanitizedString.parse('  <hello>  ');
    expect(result).toBe('&lt;hello&gt;');
  });

  it('rejects non-string values', () => {
    const result = sanitizedString.safeParse(123);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validate middleware
// ---------------------------------------------------------------------------

describe('validate', () => {
  const testSchema = z.object({
    name: z.string().min(1),
    age: z.number().min(0),
  });

  function createMocks(body: unknown = {}, query: unknown = {}, params: unknown = {}) {
    const req = {
      body,
      query,
      params,
    } as unknown as Request;
    const res = {} as Response;
    const next = vi.fn() as NextFunction;
    return { req, res, next };
  }

  it('passes valid body data to next()', () => {
    const middleware = validate(testSchema);
    const { req, res, next } = createMocks({ name: 'Alice', age: 30 });

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.body).toEqual({ name: 'Alice', age: 30 });
  });

  it('calls next with BadRequestError on invalid data', () => {
    const middleware = validate(testSchema);
    const { req, res, next } = createMocks({ name: '', age: -1 });

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Validation failed',
      statusCode: 400,
    }));
  });

  it('validates query params when target is query', () => {
    const querySchema = z.object({ search: z.string().min(1) });
    const middleware = validate(querySchema, 'query');
    const { req, res, next } = createMocks({}, { search: 'test' });

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('validates route params when target is params', () => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const middleware = validate(paramsSchema, 'params');
    const { req, res, next } = createMocks(
      {},
      {},
      { id: '550e8400-e29b-41d4-a716-446655440000' },
    );

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('includes path details in validation errors', () => {
    const middleware = validate(testSchema);
    const { req, res, next } = createMocks({ name: 123, age: 'not-a-number' });

    middleware(req, res, next);

    const error = (next as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(error).toBeDefined();
    expect(error.details).toBeDefined();
    expect(Array.isArray(error.details)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateAll
// ---------------------------------------------------------------------------

describe('validateAll', () => {
  it('validates multiple targets', () => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const bodySchema = z.object({ name: z.string().min(1) });

    const middleware = validateAll({ params: paramsSchema, body: bodySchema });
    const req = {
      params: { id: '550e8400-e29b-41d4-a716-446655440000' },
      body: { name: 'Test' },
      query: {},
    } as unknown as Request;
    const res = {} as Response;
    const next = vi.fn() as NextFunction;

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('collects errors from multiple targets', () => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const bodySchema = z.object({ name: z.string().min(1) });

    const middleware = validateAll({ params: paramsSchema, body: bodySchema });
    const req = {
      params: { id: 'not-a-uuid' },
      body: { name: '' },
      query: {},
    } as unknown as Request;
    const res = {} as Response;
    const next = vi.fn() as NextFunction;

    middleware(req, res, next);

    const error = (next as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(error.statusCode).toBe(400);
    expect(error.details.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Common param schemas
// ---------------------------------------------------------------------------

describe('uuidParam schema', () => {
  it('accepts a valid UUID', () => {
    const result = uuidParam.safeParse({ id: '550e8400-e29b-41d4-a716-446655440000' });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid UUID', () => {
    const result = uuidParam.safeParse({ id: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects missing id', () => {
    const result = uuidParam.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Pagination helpers
// ---------------------------------------------------------------------------

describe('paginationQuery schema', () => {
  it('parses with defaults', () => {
    const result = paginationQuery.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.sortOrder).toBe('desc');
  });

  it('parses string numbers (coercion)', () => {
    const result = paginationQuery.parse({ page: '3', limit: '50' });
    expect(result.page).toBe(3);
    expect(result.limit).toBe(50);
  });

  it('rejects page below 1', () => {
    const result = paginationQuery.safeParse({ page: '0' });
    expect(result.success).toBe(false);
  });

  it('rejects limit above 100', () => {
    const result = paginationQuery.safeParse({ limit: '101' });
    expect(result.success).toBe(false);
  });
});

describe('paginate', () => {
  it('calculates pagination metadata correctly', () => {
    const meta = paginate(100, 1, 20);
    expect(meta.total).toBe(100);
    expect(meta.page).toBe(1);
    expect(meta.limit).toBe(20);
    expect(meta.totalPages).toBe(5);
    expect(meta.hasMore).toBe(true);
  });

  it('returns hasMore=false on last page', () => {
    const meta = paginate(100, 5, 20);
    expect(meta.hasMore).toBe(false);
  });

  it('handles single page', () => {
    const meta = paginate(5, 1, 20);
    expect(meta.totalPages).toBe(1);
    expect(meta.hasMore).toBe(false);
  });

  it('handles zero total', () => {
    const meta = paginate(0, 1, 20);
    expect(meta.totalPages).toBe(0);
    expect(meta.hasMore).toBe(false);
  });
});

describe('render farm shared schemas', () => {
  it('accepts canonical render worker registration payloads', () => {
    const result = schemas.registerRenderWorker.safeParse({
      hostname: 'render-01',
      ip: '10.0.0.21',
      port: 4010,
      workerTypes: ['render', 'probe'],
      capabilities: {
        gpuVendor: 'NVIDIA',
        gpuName: 'RTX 4090',
        vramMB: 24576,
        cpuCores: 24,
        memoryGB: 64,
        availableCodecs: ['h264', 'prores'],
        ffmpegVersion: '7.1',
        maxConcurrentJobs: 4,
        hwAccel: ['nvenc'],
      },
    });

    expect(result.success).toBe(true);
  });

  it('accepts string render priorities and rejects legacy numeric priorities', () => {
    const valid = schemas.submitRenderJob.safeParse({
      name: 'Deliver Master',
      presetId: 'stream-h264-1080p',
      sourceTimelineId: 'timeline-main',
      totalFrames: 1500,
      priority: 'high',
    });
    const invalid = schemas.submitRenderJob.safeParse({
      name: 'Deliver Master',
      presetId: 'stream-h264-1080p',
      sourceTimelineId: 'timeline-main',
      totalFrames: 1500,
      priority: 7,
    });

    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
  });
});

describe('cursorPaginate', () => {
  it('returns correct pagination when there are more items', () => {
    const items = Array.from({ length: 6 }, (_, i) => ({ id: `id-${i}` }));
    const { data, pagination } = cursorPaginate(items, 5, 20);

    expect(data).toHaveLength(5);
    expect(pagination.hasMore).toBe(true);
    expect(pagination.nextCursor).toBe('id-4');
    expect(pagination.total).toBe(20);
  });

  it('returns correct pagination when there are no more items', () => {
    const items = [{ id: 'a' }, { id: 'b' }];
    const { data, pagination } = cursorPaginate(items, 5, 2);

    expect(data).toHaveLength(2);
    expect(pagination.hasMore).toBe(false);
    expect(pagination.nextCursor).toBeNull();
  });

  it('handles empty items', () => {
    const { data, pagination } = cursorPaginate([], 5, 0);
    expect(data).toHaveLength(0);
    expect(pagination.hasMore).toBe(false);
    expect(pagination.nextCursor).toBeNull();
    expect(pagination.prevCursor).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// schemas – selected schemas
// ---------------------------------------------------------------------------

describe('schemas', () => {
  describe('register', () => {
    it('accepts valid registration data', () => {
      const result = schemas.register.safeParse({
        email: 'user@example.com',
        password: '12345678',
        displayName: 'John',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid email', () => {
      const result = schemas.register.safeParse({
        email: 'not-an-email',
        password: '12345678',
        displayName: 'John',
      });
      expect(result.success).toBe(false);
    });

    it('rejects short password', () => {
      const result = schemas.register.safeParse({
        email: 'user@example.com',
        password: '1234567',
        displayName: 'John',
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty displayName', () => {
      const result = schemas.register.safeParse({
        email: 'user@example.com',
        password: '12345678',
        displayName: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('login', () => {
    it('accepts valid login data', () => {
      const result = schemas.login.safeParse({
        email: 'user@example.com',
        password: 'password123',
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty password', () => {
      const result = schemas.login.safeParse({
        email: 'user@example.com',
        password: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('createProject', () => {
    it('accepts valid project data with defaults', () => {
      const result = schemas.createProject.safeParse({ name: 'My Project' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.frameRate).toBe(23.976);
        expect(result.data.width).toBe(1920);
        expect(result.data.height).toBe(1080);
        expect(result.data.sampleRate).toBe(48000);
        expect(result.data.tags).toEqual([]);
      }
    });

    it('rejects empty name', () => {
      const result = schemas.createProject.safeParse({ name: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('createClip', () => {
    it('rejects endTime <= startTime', () => {
      const result = schemas.createClip.safeParse({
        trackId: '550e8400-e29b-41d4-a716-446655440000',
        startTime: 10,
        endTime: 5,
      });
      expect(result.success).toBe(false);
    });

    it('accepts valid clip data', () => {
      const result = schemas.createClip.safeParse({
        trackId: '550e8400-e29b-41d4-a716-446655440000',
        startTime: 0,
        endTime: 10,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('createBin', () => {
    it('uses default color', () => {
      const result = schemas.createBin.safeParse({ name: 'Footage' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.color).toBe('#6366f1');
      }
    });

    it('rejects invalid hex color', () => {
      const result = schemas.createBin.safeParse({
        name: 'Footage',
        color: 'red',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('createMarketplaceItem', () => {
    it('rejects invalid slug', () => {
      const result = schemas.createMarketplaceItem.safeParse({
        type: 'EFFECT_PLUGIN',
        name: 'Test',
        slug: 'Invalid Slug!',
      });
      expect(result.success).toBe(false);
    });

    it('accepts valid slug', () => {
      const result = schemas.createMarketplaceItem.safeParse({
        type: 'EFFECT_PLUGIN',
        name: 'Test',
        slug: 'my-valid-slug',
      });
      expect(result.success).toBe(true);
    });
  });
});
