/**
 * @module AdapterError
 *
 * Consistent error types for all platform adapters. Every adapter method
 * should throw an `AdapterError` (or a subclass) instead of a bare `Error`
 * so that consumers can inspect the `adapterName`, `code`, and `recoverable`
 * fields for structured error handling and retry logic.
 *
 * ## Usage pattern
 *
 * ```ts
 * import { AdapterError, AdapterErrorCode } from '@mcua/adapters';
 *
 * try {
 *   await mcAdapter.getTimeline('seq-1');
 * } catch (err) {
 *   if (err instanceof AdapterError) {
 *     if (err.recoverable) {
 *       // safe to retry
 *     }
 *     console.error(`[${err.adapterName}] ${err.code}: ${err.message}`);
 *   }
 * }
 * ```
 */

// -- Error codes -------------------------------------------------------------

/**
 * Machine-readable error codes shared across all adapters.
 *
 * Codes are grouped by category:
 * - `NOT_FOUND`        -- requested resource does not exist
 * - `CONFLICT`         -- operation conflicts with current state
 * - `INVALID_ARGUMENT` -- caller provided an invalid parameter
 * - `TIMEOUT`          -- operation exceeded the allowed time
 * - `UNAVAILABLE`      -- backend service is unreachable
 * - `AUTH_FAILED`      -- authentication or authorisation failure
 * - `INTERNAL`         -- unexpected internal error
 * - `NOT_IMPLEMENTED`  -- the adapter does not support this operation
 * - `CANCELLED`        -- operation was cancelled by the caller
 */
export type AdapterErrorCode =
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INVALID_ARGUMENT'
  | 'TIMEOUT'
  | 'UNAVAILABLE'
  | 'AUTH_FAILED'
  | 'INTERNAL'
  | 'NOT_IMPLEMENTED'
  | 'CANCELLED';

// -- Base error class --------------------------------------------------------

/**
 * Base error class for all adapter failures.
 *
 * Extends the standard `Error` with structured fields that the agent
 * orchestrator uses for retry decisions, compensation, and user-facing
 * error messages.
 */
export class AdapterError extends Error {
  /** The adapter that threw this error (e.g. `"media-composer"`, `"content-core"`). */
  readonly adapterName: string;
  /** Machine-readable error code. */
  readonly code: AdapterErrorCode;
  /** Whether the operation can safely be retried. */
  readonly recoverable: boolean;
  /** The underlying cause error, if any. */
  override readonly cause?: Error;

  constructor(options: {
    adapterName: string;
    code: AdapterErrorCode;
    message: string;
    recoverable?: boolean;
    cause?: Error;
  }) {
    super(options.message);
    this.name = 'AdapterError';
    this.adapterName = options.adapterName;
    this.code = options.code;
    this.recoverable = options.recoverable ?? false;
    this.cause = options.cause;

    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, AdapterError.prototype);
  }

  /** Serialise to a plain object for logging or event payloads. */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      adapterName: this.adapterName,
      code: this.code,
      message: this.message,
      recoverable: this.recoverable,
      cause: this.cause?.message,
      stack: this.stack,
    };
  }
}

// -- Convenience subclasses --------------------------------------------------

/**
 * Thrown when a requested resource (clip, track, sequence, asset, etc.)
 * cannot be found.
 */
export class NotFoundError extends AdapterError {
  constructor(adapterName: string, resourceType: string, resourceId: string) {
    super({
      adapterName,
      code: 'NOT_FOUND',
      message: `${resourceType} not found: ${resourceId}`,
      recoverable: false,
    });
    this.name = 'NotFoundError';
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

/**
 * Thrown when the backend service is unreachable or unhealthy.
 * These errors are always marked as recoverable.
 */
export class UnavailableError extends AdapterError {
  constructor(adapterName: string, message: string, cause?: Error) {
    super({
      adapterName,
      code: 'UNAVAILABLE',
      message,
      recoverable: true,
      cause,
    });
    this.name = 'UnavailableError';
    Object.setPrototypeOf(this, UnavailableError.prototype);
  }
}

/**
 * Thrown when an operation times out.
 * These errors are always marked as recoverable.
 */
export class TimeoutError extends AdapterError {
  constructor(adapterName: string, operation: string, timeoutMs: number) {
    super({
      adapterName,
      code: 'TIMEOUT',
      message: `${operation} timed out after ${timeoutMs}ms`,
      recoverable: true,
    });
    this.name = 'TimeoutError';
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

/**
 * Thrown when the caller provides an invalid argument.
 */
export class InvalidArgumentError extends AdapterError {
  constructor(adapterName: string, argument: string, reason: string) {
    super({
      adapterName,
      code: 'INVALID_ARGUMENT',
      message: `Invalid argument "${argument}": ${reason}`,
      recoverable: false,
    });
    this.name = 'InvalidArgumentError';
    Object.setPrototypeOf(this, InvalidArgumentError.prototype);
  }
}

/**
 * Thrown when an operation conflicts with current state
 * (e.g. trying to delete an already-deleted clip).
 */
export class ConflictError extends AdapterError {
  constructor(adapterName: string, message: string) {
    super({
      adapterName,
      code: 'CONFLICT',
      message,
      recoverable: false,
    });
    this.name = 'ConflictError';
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}
