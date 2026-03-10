import { logger } from './logger';
import { ServiceUnavailableError } from './errors';

// ─── Circuit Breaker States ─────────────────────────────────────────────────

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  /** Name for logging */
  name: string;
  /** Number of failures before opening the circuit (default: 5) */
  failureThreshold?: number;
  /** Time in ms to wait before trying again (default: 30000) */
  resetTimeout?: number;
  /** Number of successful calls in HALF_OPEN before closing (default: 2) */
  successThreshold?: number;
  /** Timeout in ms for each call (default: 10000) */
  callTimeout?: number;
  /** Optional fallback function when circuit is open */
  fallback?: () => unknown;
}

/**
 * Circuit Breaker pattern for flaky external dependencies.
 *
 * CLOSED: Normal operation, requests pass through.
 * OPEN: Failures exceeded threshold, all requests fail fast.
 * HALF_OPEN: After reset timeout, allow limited requests to test recovery.
 */
export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private readonly name: string;
  private readonly failureThreshold: number;
  private readonly resetTimeout: number;
  private readonly successThreshold: number;
  private readonly callTimeout: number;
  private readonly fallback?: () => unknown;

  constructor(options: CircuitBreakerOptions) {
    this.name = options.name;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeout = options.resetTimeout ?? 30000;
    this.successThreshold = options.successThreshold ?? 2;
    this.callTimeout = options.callTimeout ?? 10000;
    this.fallback = options.fallback;
  }

  /**
   * Execute a function through the circuit breaker.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      // Check if reset timeout has elapsed
      if (Date.now() - this.lastFailureTime >= this.resetTimeout) {
        this.state = 'HALF_OPEN';
        this.successCount = 0;
        logger.info(`Circuit breaker [${this.name}] transitioning to HALF_OPEN`);
      } else {
        // Circuit is open -- fail fast or use fallback
        if (this.fallback) {
          logger.debug(`Circuit breaker [${this.name}] is OPEN, using fallback`);
          return this.fallback() as T;
        }
        throw new ServiceUnavailableError(
          `Service "${this.name}" is temporarily unavailable (circuit open)`
        );
      }
    }

    try {
      const result = await this.withTimeout(fn(), this.callTimeout);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.successCount = 0;
        logger.info(`Circuit breaker [${this.name}] CLOSED (recovered)`);
      }
    } else {
      this.failureCount = 0;
    }
  }

  private onFailure(error: unknown): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    const errMsg = error instanceof Error ? error.message : String(error);

    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      logger.warn(`Circuit breaker [${this.name}] re-opened after HALF_OPEN failure`, {
        error: errMsg,
      });
    } else if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      logger.warn(`Circuit breaker [${this.name}] OPENED after ${this.failureCount} failures`, {
        error: errMsg,
        resetTimeoutMs: this.resetTimeout,
      });
    }
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`Circuit breaker [${this.name}] call timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  /**
   * Get the current circuit state (useful for health checks).
   */
  getState(): { name: string; state: CircuitState; failureCount: number } {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
    };
  }

  /**
   * Manually reset the circuit breaker to CLOSED state.
   */
  reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    logger.info(`Circuit breaker [${this.name}] manually reset to CLOSED`);
  }
}
