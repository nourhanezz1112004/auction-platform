import { Request, Response, NextFunction } from 'express';
import { logger } from '@auction/shared-utils';

// ─── Custom Error Classes ─────────────────────────────────────────────────────

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code:       string,
    message:           string,
    public data?:      Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class BadRequestError    extends AppError { constructor(code: string, msg: string, data?: Record<string, any>) { super(400, code, msg, data); } }
export class UnauthorizedError  extends AppError { constructor(msg = 'Unauthorized')      { super(401, 'unauthorized', msg); } }
export class ForbiddenError     extends AppError { constructor(code: string, msg: string, data?: Record<string, any>) { super(403, code, msg, data); } }
export class PaymentRequiredError extends AppError { constructor(code: string, msg: string, data?: Record<string, any>) { super(402, code, msg, data); } }
export class NotFoundError      extends AppError { constructor(msg = 'Not found')         { super(404, 'not_found', msg); } }
export class ConflictError      extends AppError { constructor(code: string, msg?: string, data?: Record<string, any>) { super(409, code, msg ?? code, data); } }
export class GoneError          extends AppError { constructor(code: string, msg: string, data?: Record<string, any>)  { super(410, code, msg, data); } }
export class InternalError      extends AppError { constructor(code: string, msg: string, data?: Record<string, any>)  { super(500, code, msg, data); } }

// ─── Middleware ───────────────────────────────────────────────────────────────

export function errorMiddleware(
  err:  any,
  req:  Request,
  res:  Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error:   err.code,
      message: err.message,
      ...(err.data || {}),
    });
    return;
  }

  // Unexpected error — log and return 500
  logger.error({ err, url: req.url, method: req.method, correlationId: (req as any).correlationId }, 'Unhandled error');
  res.status(500).json({
    error: 'internal_error',
    message: err.message || 'Internal server error',
    correlationId: (req as any).correlationId,
  });
}
