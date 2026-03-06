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
  constructor(message = 'Conflict') {
    super(message, 409, 'CONFLICT');
  }
}

export class UnprocessableError extends AppError {
  constructor(message = 'Unprocessable entity', details?: unknown) {
    super(message, 422, 'UNPROCESSABLE', details);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMITED');
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
