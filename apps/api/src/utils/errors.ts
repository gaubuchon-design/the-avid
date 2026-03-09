// ─── Base Error ────────────────────────────────────────────────────────────────

export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: {
        message: this.message,
        code: this.code ?? this.name,
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}

// ─── HTTP Errors ───────────────────────────────────────────────────────────────

export class BadRequestError extends AppError {
  constructor(message = 'Bad request', details?: unknown) {
    super(message, 400, 'BAD_REQUEST', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict', details?: unknown) {
    super(message, 409, 'CONFLICT', details);
  }
}

export class GoneError extends AppError {
  constructor(message = 'Resource no longer available') {
    super(message, 410, 'GONE');
  }
}

export class UnprocessableError extends AppError {
  constructor(message = 'Unprocessable entity', details?: unknown) {
    super(message, 422, 'UNPROCESSABLE', details);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Rate limit exceeded', retryAfterSeconds?: number) {
    super(message, 429, 'RATE_LIMITED', retryAfterSeconds ? { retryAfter: retryAfterSeconds } : undefined);
  }
}

export class InsufficientTokensError extends AppError {
  constructor(required: number, available: number) {
    super(
      `Insufficient AI tokens. Required: ${required}, available: ${available}`,
      402,
      'INSUFFICIENT_TOKENS',
      { required, available }
    );
  }
}

export class MediaProcessingError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 500, 'MEDIA_PROCESSING_ERROR', details);
  }
}

export class AIServiceError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 503, 'AI_SERVICE_ERROR', details);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable') {
    super(message, 503, 'SERVICE_UNAVAILABLE');
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, message?: string) {
    super(
      message ?? `External service "${service}" is unavailable`,
      502,
      'EXTERNAL_SERVICE_ERROR',
      { service }
    );
  }
}

// ─── Assertion helpers ─────────────────────────────────────────────────────────

/**
 * Assert that a value is defined, otherwise throw a NotFoundError.
 */
export function assertFound<T>(value: T | null | undefined, resource = 'Resource'): asserts value is T {
  if (value === null || value === undefined) {
    throw new NotFoundError(resource);
  }
}

/**
 * Assert a boolean condition, otherwise throw a BadRequestError.
 */
export function assertValid(condition: boolean, message: string, details?: unknown): asserts condition {
  if (!condition) {
    throw new BadRequestError(message, details);
  }
}
