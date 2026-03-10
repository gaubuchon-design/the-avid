import { describe, it, expect } from 'vitest';

// We cannot easily test the full express-rate-limit middleware in unit tests
// (it requires a running Express app). Instead, we verify that the exported
// limiters are defined and have the expected types.

// Mock config before importing rateLimit
import { vi } from 'vitest';

vi.mock('../config', () => ({
  config: {
    rateLimit: {
      windowMs: 15 * 60 * 1000,
      max: 1000,
    },
    isDev: false,
    isProd: false,
    logging: {
      level: 'info',
      file: 'logs/api.log',
    },
  },
}));

vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  globalLimiter,
  authLimiter,
  uploadLimiter,
  aiLimiter,
  writeLimiter,
  readLimiter,
} from '../middleware/rateLimit';

describe('rate limiter exports', () => {
  it('exports globalLimiter as a function (Express middleware)', () => {
    expect(typeof globalLimiter).toBe('function');
  });

  it('exports authLimiter as a function', () => {
    expect(typeof authLimiter).toBe('function');
  });

  it('exports uploadLimiter as a function', () => {
    expect(typeof uploadLimiter).toBe('function');
  });

  it('exports aiLimiter as a function', () => {
    expect(typeof aiLimiter).toBe('function');
  });

  it('exports writeLimiter as a function', () => {
    expect(typeof writeLimiter).toBe('function');
  });

  it('exports readLimiter as a function', () => {
    expect(typeof readLimiter).toBe('function');
  });

  it('all limiters are unique instances', () => {
    const limiters = [
      globalLimiter,
      authLimiter,
      uploadLimiter,
      aiLimiter,
      writeLimiter,
      readLimiter,
    ];
    const uniqueSet = new Set(limiters);
    expect(uniqueSet.size).toBe(limiters.length);
  });
});
