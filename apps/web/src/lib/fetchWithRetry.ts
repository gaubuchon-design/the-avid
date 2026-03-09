// =============================================================================
//  THE AVID -- Resilient HTTP Client
//  Provides fetch with timeout, retry logic with exponential backoff,
//  and structured error handling for various HTTP status codes.
// =============================================================================

import { createLogger } from './logger';

const logger = createLogger('HTTP');

// ─── Error Types ────────────────────────────────────────────────────────────

export class NetworkError extends Error {
  public readonly isOffline: boolean;
  public readonly isTimeout: boolean;

  constructor(message: string, options?: { isOffline?: boolean; isTimeout?: boolean }) {
    super(message);
    this.name = 'NetworkError';
    this.isOffline = options?.isOffline ?? false;
    this.isTimeout = options?.isTimeout ?? false;
  }
}

export class HttpError extends Error {
  public readonly status: number;
  public readonly statusText: string;
  public readonly body: unknown;

  constructor(status: number, statusText: string, body?: unknown) {
    super(`HTTP ${status}: ${statusText}`);
    this.name = 'HttpError';
    this.status = status;
    this.statusText = statusText;
    this.body = body;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }

  get isServerError(): boolean {
    return this.status >= 500;
  }
}

// ─── Configuration ──────────────────────────────────────────────────────────

export interface FetchWithRetryOptions {
  /** Number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Request timeout in milliseconds (default: 30000) */
  timeoutMs?: number;
  /** Base delay for exponential backoff in ms (default: 1000) */
  baseDelayMs?: number;
  /** Maximum backoff delay in ms (default: 10000) */
  maxDelayMs?: number;
  /** HTTP status codes that should trigger a retry (default: [408, 429, 500, 502, 503, 504]) */
  retryableStatuses?: number[];
  /** AbortSignal for external cancellation */
  signal?: AbortSignal;
  /** Callback invoked before each retry attempt */
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
}

const DEFAULT_RETRYABLE_STATUSES = [408, 429, 500, 502, 503, 504];

// ─── Core Fetch with Retry ──────────────────────────────────────────────────

/**
 * Enhanced fetch with timeout, retry logic, and exponential backoff.
 *
 * @param url - Request URL
 * @param init - Standard RequestInit options
 * @param options - Retry and timeout configuration
 * @returns Response object on success
 * @throws NetworkError for network/timeout failures
 * @throws HttpError for non-retryable HTTP error responses
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  options?: FetchWithRetryOptions,
): Promise<Response> {
  const {
    maxRetries = 3,
    timeoutMs = 30_000,
    baseDelayMs = 1_000,
    maxDelayMs = 10_000,
    retryableStatuses = DEFAULT_RETRYABLE_STATUSES,
    signal: externalSignal,
    onRetry,
  } = options ?? {};

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Check if externally cancelled
    if (externalSignal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError');
    }

    // Create timeout controller for this attempt
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

    // Combine external signal with timeout signal
    const combinedSignal = externalSignal
      ? combineAbortSignals(externalSignal, timeoutController.signal)
      : timeoutController.signal;

    try {
      const response = await fetch(url, {
        ...init,
        signal: combinedSignal,
      });

      clearTimeout(timeoutId);

      // Successful response
      if (response.ok) {
        return response;
      }

      // Non-retryable HTTP error
      if (!retryableStatuses.includes(response.status)) {
        let body: unknown;
        try {
          body = await response.json();
        } catch {
          // Body parsing failure is non-critical
        }
        throw new HttpError(response.status, response.statusText, body);
      }

      // Retryable HTTP error -- will retry after backoff
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        // Body parsing failure is non-critical
      }
      lastError = new HttpError(response.status, response.statusText, body);

    } catch (err) {
      clearTimeout(timeoutId);

      // If it is an HttpError we threw above, re-throw non-retryable ones
      if (err instanceof HttpError && !retryableStatuses.includes(err.status)) {
        throw err;
      }

      // Abort from external signal -- do not retry
      if (externalSignal?.aborted) {
        throw new DOMException('The operation was aborted.', 'AbortError');
      }

      // Timeout
      if (err instanceof DOMException && err.name === 'AbortError') {
        lastError = new NetworkError(
          `Request to ${url} timed out after ${timeoutMs}ms`,
          { isTimeout: true },
        );
      }
      // Network error (offline, DNS, etc.)
      else if (err instanceof TypeError) {
        const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
        lastError = new NetworkError(
          isOffline
            ? 'You appear to be offline. Check your internet connection.'
            : `Network error: ${err.message}`,
          { isOffline },
        );
      }
      // Already an HttpError from our retryable check above
      else if (err instanceof HttpError) {
        lastError = err;
      }
      // Unknown error
      else {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    // If we have more attempts, wait with exponential backoff + jitter
    if (attempt < maxRetries && lastError) {
      const delayMs = Math.min(
        baseDelayMs * Math.pow(2, attempt) + Math.random() * 500,
        maxDelayMs,
      );

      logger.warn(`Retrying request to ${url}`, {
        attempt: attempt + 1,
        maxRetries,
        delayMs: Math.round(delayMs),
        error: lastError.message,
      });

      onRetry?.(attempt + 1, lastError, delayMs);
      await sleep(delayMs);
    }
  }

  // All retries exhausted
  throw lastError ?? new NetworkError('Request failed after all retries');
}

// ─── JSON Fetch Helper ──────────────────────────────────────────────────────

/**
 * Convenience wrapper around fetchWithRetry that parses JSON responses.
 */
export async function fetchJSON<T>(
  url: string,
  init?: RequestInit,
  options?: FetchWithRetryOptions,
): Promise<T> {
  const response = await fetchWithRetry(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...init?.headers,
    },
  }, options);

  try {
    return await response.json() as T;
  } catch {
    throw new Error('Failed to parse JSON response');
  }
}

// ─── HTTP Error Handler ─────────────────────────────────────────────────────

export interface ErrorHandlerResult {
  message: string;
  action: 'redirect-login' | 'show-forbidden' | 'show-rate-limit' | 'show-error' | 'show-offline' | 'retry';
  retryAfterMs?: number;
}

/**
 * Interprets an error thrown by fetchWithRetry and returns a structured
 * result indicating the appropriate user-facing action.
 */
export function handleApiError(error: unknown): ErrorHandlerResult {
  if (error instanceof HttpError) {
    if (error.isUnauthorized) {
      return {
        message: 'Your session has expired. Please sign in again.',
        action: 'redirect-login',
      };
    }
    if (error.isForbidden) {
      return {
        message: 'You do not have permission to perform this action.',
        action: 'show-forbidden',
      };
    }
    if (error.isRateLimited) {
      return {
        message: 'Too many requests. Please wait a moment before trying again.',
        action: 'show-rate-limit',
        retryAfterMs: 60_000,
      };
    }
    if (error.isServerError) {
      return {
        message: 'The server encountered an error. Please try again later.',
        action: 'retry',
      };
    }
    return {
      message: error.message,
      action: 'show-error',
    };
  }

  if (error instanceof NetworkError) {
    if (error.isOffline) {
      return {
        message: 'You appear to be offline. Check your internet connection.',
        action: 'show-offline',
      };
    }
    if (error.isTimeout) {
      return {
        message: 'The request timed out. Please try again.',
        action: 'retry',
      };
    }
    return {
      message: error.message,
      action: 'retry',
    };
  }

  return {
    message: error instanceof Error ? error.message : 'An unexpected error occurred.',
    action: 'show-error',
  };
}

// ─── Utilities ──────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function combineAbortSignals(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener('abort', () => controller.abort(signal.reason), {
      once: true,
      signal: controller.signal,
    });
  }
  return controller.signal;
}
