import type { ErrorCode } from '@audiostash/contracts';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

// Services and data access throw these. The error handler in app.ts is the only
// place that turns them into HTTP responses, so lower layers stay HTTP-agnostic.
export class AppError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: ErrorCode;
  readonly details: unknown;

  constructor(status: ContentfulStatusCode, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request', details?: unknown) {
    super(400, 'bad_request', message, details);
  }
}

export class ValidationError extends AppError {
  constructor(details: unknown) {
    super(400, 'validation_failed', 'Request validation failed', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Missing or invalid token') {
    super(401, 'unauthorized', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Not allowed') {
    super(403, 'forbidden', message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(404, 'not_found', message);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict') {
    super(409, 'conflict', message);
  }
}

export class UnavailableError extends AppError {
  constructor(message = 'Service unavailable') {
    super(503, 'unavailable', message);
  }
}
