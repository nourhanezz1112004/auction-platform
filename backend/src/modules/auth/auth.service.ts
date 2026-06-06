import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import { RegisterRequest, LoginRequest } from '@auction/shared-types';
import { EVENTS, UserRegisteredPayload } from '@auction/shared-events';
import { logger } from '@auction/shared-utils';

import { BadRequestError, UnauthorizedError, ForbiddenError } from '../../middlewares/error.middleware';
import { redis } from '../../utils/redis';
import { CACHE_KEYS, CACHE_TTL } from '@auction/shared-events';

import { prisma } from '../../lib/prisma';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
if (!ACCESS_SECRET || ACCESS_SECRET === 'dev-access-secret') {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_ACCESS_SECRET is insecure or unset in production');
  }
}

const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
if (!REFRESH_SECRET || REFRESH_SECRET === 'dev-refresh-secret') {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_REFRESH_SECRET is insecure or unset in production');
  }
}

const tokenAccessSecret  = ACCESS_SECRET || 'dev-access-secret';
const tokenRefreshSecret = REFRESH_SECRET || 'dev-refresh-secret';
const ACCESS_EXP     = (process.env.JWT_ACCESS_EXPIRES_IN  ?? '15m') as jwt.SignOptions['expiresIn'];
const REFRESH_EXP    = (process.env.JWT_REFRESH_EXPIRES_IN ?? '7d')  as jwt.SignOptions['expiresIn'];

// ─── Register ─────────────────────────────────────────────────────────────────

export async function register(body: RegisterRequest) {
  // Use findFirst with deletedAt: null so soft-deleted emails can re-register
  const exists = await prisma.user.findFirst({ where: { email: body.email.toLowerCase().trim(), deletedAt: null } });
  if (exists) throw new BadRequestError('email_taken', 'Email already registered');

  const password = await bcrypt.hash(body.password, 12);

  const count   = await prisma.user.count();
  const abGroup = count % 2 === 0 ? 'a' : 'b';

  const user = await prisma.user.create({
    data: { email: body.email.toLowerCase().trim(), password, name: body.name, phone: body.phone, abGroup },
  });

  const payload: UserRegisteredPayload = { userId: user.id, email: user.email };
  await redis.publish(EVENTS.USER_REGISTERED, JSON.stringify(payload));

  logger.info({ userId: user.id, abGroup } as any, 'User registered');

  const tokens = issueTokens(user);
  return { user: sanitize(user), ...tokens };
}

// ─── Login ────────────────────────────────────────────────────────────────────

export async function login(body: LoginRequest) {
  const user = await prisma.user.findFirst({ where: { email: body.email.toLowerCase().trim(), deletedAt: null } });
  if (!user) throw new UnauthorizedError('Invalid email or password');

  const valid = await bcrypt.compare(body.password, user.password);
  if (!valid) throw new UnauthorizedError('Invalid email or password');

  // Use ForbiddenError (403) not UnauthorizedError (401) — user is authenticated but banned
  if (user.banned) {
    throw new ForbiddenError('account_banned', 'Your account has been banned. Please contact support.');
  }

  const tokens = issueTokens(user);

  await redis.setex(CACHE_KEYS.session(user.id), CACHE_TTL.SESSION_SECONDS, JSON.stringify(sanitize(user)));

  return { user: sanitize(user), ...tokens };
}

// ─── Refresh ──────────────────────────────────────────────────────────────────

export async function refresh(refreshToken: string) {
  if (!refreshToken) throw new UnauthorizedError('Refresh token required');

  try {
    const payload = jwt.verify(refreshToken, tokenRefreshSecret) as { sub: string };
    const user = await prisma.user.findFirstOrThrow({ where: { id: payload.sub, deletedAt: null } });

    if (user.banned) {
      throw new ForbiddenError('account_banned', 'Your account has been banned. Please contact support.');
    }

    const accessToken = jwt.sign(
      { sub: user.id, email: user.email, isAdmin: user.isAdmin },
      tokenAccessSecret,
      { expiresIn: ACCESS_EXP },
    );
    return { accessToken };
  } catch (err) {
    // Re-throw AppErrors (ForbiddenError) — only wrap JWT verification failures
    if ((err as any)?.statusCode) throw err;
    throw new UnauthorizedError('Invalid or expired refresh token');
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function issueTokens(user: { id: string; email: string; isAdmin: boolean }) {
  const payload = { sub: user.id, email: user.email, isAdmin: user.isAdmin };
  return {
    accessToken:  jwt.sign(payload, tokenAccessSecret,  { expiresIn: ACCESS_EXP }),
    refreshToken: jwt.sign(payload, tokenRefreshSecret, { expiresIn: REFRESH_EXP }),
  };
}

function sanitize(user: any) {
  const { password: _, ...safe } = user;
  return { ...safe, role: safe.isAdmin ? 'ADMIN' : 'USER' };
}
