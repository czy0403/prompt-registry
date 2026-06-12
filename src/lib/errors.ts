export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function notFound(message: string): AppError {
  return new AppError(404, "not_found", message);
}

export function conflict(message: string, details?: unknown): AppError {
  return new AppError(409, "conflict", message, details);
}

export function badRequest(message: string, details?: unknown): AppError {
  return new AppError(400, "bad_request", message, details);
}

export function unauthorized(message = "A valid x-user-id header is required."): AppError {
  return new AppError(401, "unauthorized", message);
}
