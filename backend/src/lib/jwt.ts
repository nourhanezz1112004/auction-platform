// backend/src/lib/jwt.ts

import jwt from 'jsonwebtoken';

export function verifyToken(token: string): { userId: string } {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as { userId: string };
}

export function signAccessToken(payload: { userId: string; email: string; isAdmin: boolean }): string {
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET!, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
  });
}

export function signRefreshToken(payload: { userId: string }): string {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET!, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  });
}
