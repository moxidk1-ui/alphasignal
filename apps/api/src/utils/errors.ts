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

export function badRequest(message: string, details?: unknown): AppError {
  return new AppError(400, "BAD_REQUEST", message, details);
}

export function unauthorized(message = "Authentication required."): AppError {
  return new AppError(401, "UNAUTHORIZED", message);
}

export function forbidden(message = "Insufficient permissions."): AppError {
  return new AppError(403, "FORBIDDEN", message);
}

export function conflict(message: string): AppError {
  return new AppError(409, "CONFLICT", message);
}

export function notFound(message = "Resource not found."): AppError {
  return new AppError(404, "NOT_FOUND", message);
}

export class MarketDataError extends AppError {
  constructor(
    public readonly provider: string,
    message = "Market data is temporarily unavailable.",
  ) {
    super(502, "MARKET_DATA_UNAVAILABLE", message);
    this.name = "MarketDataError";
  }
}

export function serviceUnavailable(message: string): AppError {
  return new AppError(503, "SERVICE_UNAVAILABLE", message);
}
