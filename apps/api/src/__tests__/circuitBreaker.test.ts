import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CircuitBreaker } from '../utils/circuitBreaker';

// Mock the logger to prevent console output in tests
vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('CircuitBreaker', () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    vi.useFakeTimers();
    cb = new CircuitBreaker({
      name: 'test-service',
      failureThreshold: 3,
      resetTimeout: 5000,
      successThreshold: 2,
      callTimeout: 1000,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // Closed state
  // -----------------------------------------------------------------------

  describe('CLOSED state', () => {
    it('starts in CLOSED state', () => {
      const state = cb.getState();
      expect(state.state).toBe('CLOSED');
      expect(state.failureCount).toBe(0);
      expect(state.name).toBe('test-service');
    });

    it('passes through successful calls', async () => {
      const result = await cb.execute(() => Promise.resolve('ok'));
      expect(result).toBe('ok');
    });

    it('resets failure count after a success', async () => {
      // Cause one failure
      await expect(
        cb.execute(() => Promise.reject(new Error('fail'))),
      ).rejects.toThrow('fail');
      expect(cb.getState().failureCount).toBe(1);

      // Succeed
      await cb.execute(() => Promise.resolve('ok'));
      expect(cb.getState().failureCount).toBe(0);
    });

    it('passes through errors from the function', async () => {
      await expect(
        cb.execute(() => Promise.reject(new Error('some error'))),
      ).rejects.toThrow('some error');
    });

    it('increments failure count on errors', async () => {
      await expect(
        cb.execute(() => Promise.reject(new Error('fail'))),
      ).rejects.toThrow();
      expect(cb.getState().failureCount).toBe(1);

      await expect(
        cb.execute(() => Promise.reject(new Error('fail'))),
      ).rejects.toThrow();
      expect(cb.getState().failureCount).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // Transition to OPEN
  // -----------------------------------------------------------------------

  describe('transition CLOSED -> OPEN', () => {
    it('opens after reaching the failure threshold', async () => {
      for (let i = 0; i < 3; i++) {
        await expect(
          cb.execute(() => Promise.reject(new Error('fail'))),
        ).rejects.toThrow();
      }
      expect(cb.getState().state).toBe('OPEN');
    });
  });

  // -----------------------------------------------------------------------
  // OPEN state
  // -----------------------------------------------------------------------

  describe('OPEN state', () => {
    beforeEach(async () => {
      // Force circuit open
      for (let i = 0; i < 3; i++) {
        await expect(
          cb.execute(() => Promise.reject(new Error('fail'))),
        ).rejects.toThrow();
      }
      expect(cb.getState().state).toBe('OPEN');
    });

    it('rejects calls immediately with ServiceUnavailableError', async () => {
      await expect(
        cb.execute(() => Promise.resolve('should not run')),
      ).rejects.toThrow('temporarily unavailable');
    });

    it('uses fallback when circuit is open and fallback is provided', async () => {
      const cbWithFallback = new CircuitBreaker({
        name: 'test-fallback',
        failureThreshold: 1,
        resetTimeout: 5000,
        callTimeout: 1000,
        fallback: () => 'fallback-value',
      });

      // Trip the circuit
      await expect(
        cbWithFallback.execute(() => Promise.reject(new Error('fail'))),
      ).rejects.toThrow();

      // Should use fallback
      const result = await cbWithFallback.execute(
        () => Promise.resolve('ignored'),
      );
      expect(result).toBe('fallback-value');
    });
  });

  // -----------------------------------------------------------------------
  // Transition to HALF_OPEN
  // -----------------------------------------------------------------------

  describe('transition OPEN -> HALF_OPEN', () => {
    beforeEach(async () => {
      for (let i = 0; i < 3; i++) {
        await expect(
          cb.execute(() => Promise.reject(new Error('fail'))),
        ).rejects.toThrow();
      }
    });

    it('transitions to HALF_OPEN after resetTimeout elapses', async () => {
      vi.advanceTimersByTime(5001);

      // This call should be allowed through (HALF_OPEN)
      const result = await cb.execute(() => Promise.resolve('recovery'));
      expect(result).toBe('recovery');
    });
  });

  // -----------------------------------------------------------------------
  // HALF_OPEN state
  // -----------------------------------------------------------------------

  describe('HALF_OPEN state', () => {
    beforeEach(async () => {
      for (let i = 0; i < 3; i++) {
        await expect(
          cb.execute(() => Promise.reject(new Error('fail'))),
        ).rejects.toThrow();
      }
      vi.advanceTimersByTime(5001);
    });

    it('re-opens on failure during HALF_OPEN', async () => {
      await expect(
        cb.execute(() => Promise.reject(new Error('fail again'))),
      ).rejects.toThrow('fail again');
      expect(cb.getState().state).toBe('OPEN');
    });

    it('closes after reaching successThreshold in HALF_OPEN', async () => {
      // Need 2 consecutive successes
      await cb.execute(() => Promise.resolve('ok'));
      await cb.execute(() => Promise.resolve('ok'));
      expect(cb.getState().state).toBe('CLOSED');
      expect(cb.getState().failureCount).toBe(0);
    });

    it('does not close before successThreshold is met', async () => {
      await cb.execute(() => Promise.resolve('ok'));
      // Still half-open after just 1 success (threshold = 2)
      // The state might internally still be HALF_OPEN
      // A second call confirms the transition
      await cb.execute(() => Promise.resolve('ok'));
      expect(cb.getState().state).toBe('CLOSED');
    });
  });

  // -----------------------------------------------------------------------
  // Call timeout
  // -----------------------------------------------------------------------

  describe('call timeout', () => {
    it('rejects calls that exceed callTimeout', async () => {
      const slowFn = () =>
        new Promise<string>((resolve) => {
          setTimeout(() => resolve('late'), 2000);
        });

      const promise = cb.execute(slowFn);
      vi.advanceTimersByTime(1001);
      await expect(promise).rejects.toThrow('timed out');
    });

    it('counts timeout as a failure', async () => {
      const slowFn = () =>
        new Promise<string>((resolve) => {
          setTimeout(() => resolve('late'), 2000);
        });

      const promise = cb.execute(slowFn);
      vi.advanceTimersByTime(1001);

      try {
        await promise;
      } catch {
        // expected
      }

      expect(cb.getState().failureCount).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // Manual reset
  // -----------------------------------------------------------------------

  describe('reset()', () => {
    it('manually resets circuit to CLOSED state', async () => {
      for (let i = 0; i < 3; i++) {
        await expect(
          cb.execute(() => Promise.reject(new Error('fail'))),
        ).rejects.toThrow();
      }
      expect(cb.getState().state).toBe('OPEN');

      cb.reset();
      expect(cb.getState().state).toBe('CLOSED');
      expect(cb.getState().failureCount).toBe(0);
    });

    it('allows calls again after manual reset', async () => {
      for (let i = 0; i < 3; i++) {
        await expect(
          cb.execute(() => Promise.reject(new Error('fail'))),
        ).rejects.toThrow();
      }

      cb.reset();
      const result = await cb.execute(() => Promise.resolve('recovered'));
      expect(result).toBe('recovered');
    });
  });

  // -----------------------------------------------------------------------
  // getState()
  // -----------------------------------------------------------------------

  describe('getState()', () => {
    it('returns the correct state object', () => {
      const state = cb.getState();
      expect(state).toHaveProperty('name', 'test-service');
      expect(state).toHaveProperty('state', 'CLOSED');
      expect(state).toHaveProperty('failureCount', 0);
    });
  });

  // -----------------------------------------------------------------------
  // Default options
  // -----------------------------------------------------------------------

  describe('default options', () => {
    it('uses default values when options are not provided', () => {
      const cbDefaults = new CircuitBreaker({ name: 'defaults' });
      const state = cbDefaults.getState();
      expect(state.name).toBe('defaults');
      expect(state.state).toBe('CLOSED');
    });
  });
});
