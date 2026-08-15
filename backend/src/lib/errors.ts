import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** An error we intentionally surface to the client with a specific status. */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (msg: string, details?: unknown) =>
  new AppError(400, 'BAD_REQUEST', msg, details);
export const unauthorized = (msg = 'Authentication required') =>
  new AppError(401, 'UNAUTHORIZED', msg);
export const forbidden = (msg = 'Not allowed') => new AppError(403, 'FORBIDDEN', msg);
export const notFound = (msg = 'Not found') => new AppError(404, 'NOT_FOUND', msg);
export const conflict = (msg: string, details?: unknown) =>
  new AppError(409, 'CONFLICT', msg, details);
export const insufficientFunds = (msg = 'Insufficient available balance') =>
  new AppError(400, 'INSUFFICIENT_FUNDS', msg);
export const serviceUnavailable = (msg: string) =>
  new AppError(503, 'SERVICE_UNAVAILABLE', msg);

/**
 * Express 5 forwards rejected promises to the error handler on its own, but
 * wrapping keeps the intent explicit and keeps handler signatures uniform.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    void fn(req, res, next).catch(next);
  };
}
