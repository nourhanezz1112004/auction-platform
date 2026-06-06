import { Request, Response, NextFunction } from 'express';
import { getCorrelationId, X_CORRELATION_ID } from '@auction/shared-utils';

// Attach correlation ID to every request and response
// so a single bid can be traced across backend + ai-service in logs.
export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const correlationId = getCorrelationId(req.headers as Record<string, string>);
  req.correlationId = correlationId;
  res.setHeader(X_CORRELATION_ID, correlationId);
  next();
}
