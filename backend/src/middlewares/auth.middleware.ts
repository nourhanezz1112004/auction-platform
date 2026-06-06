import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UnauthorizedError, ForbiddenError } from './error.middleware';

export interface JWTPayload {
  sub:     string;   // userId
  email:   string;
  isAdmin: boolean;
}

// Extend Express Request so downstream handlers get full type safety
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
      correlationId?: string;
    }
  }
}

// Fail fast if JWT_ACCESS_SECRET is absent or insecure in production
const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
if (!ACCESS_SECRET || ACCESS_SECRET === 'dev-access-secret') {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_ACCESS_SECRET is insecure or unset in production');
  }
}
const tokenSecret = ACCESS_SECRET || 'dev-access-secret';

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new UnauthorizedError());
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, tokenSecret) as JWTPayload;
    req.user = payload;
    next();
  } catch {
    next(new UnauthorizedError('Token expired or invalid'));
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next();
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, tokenSecret) as JWTPayload;
    req.user = payload;
  } catch {
    // Silently continue if token is invalid
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, (err?: unknown) => {
    if (err) return next(err);
    if (!req.user?.isAdmin) {
      return next(new ForbiddenError('forbidden', 'Admin access required'));
    }
    next();
  });
}
