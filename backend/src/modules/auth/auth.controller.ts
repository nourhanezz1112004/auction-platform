import { Request, Response, NextFunction } from 'express';
import sgMail from '@sendgrid/mail';
import * as authService from './auth.service';
import { prisma } from '../../lib/prisma';
import { redis } from '../../utils/redis';
import { CACHE_KEYS, CACHE_TTL } from '@auction/shared-events';

const FROM_EMAIL   = process.env.SENDGRID_FROM_EMAIL ?? 'noreply@auction-platform.com';
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173';

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
} else {
  console.warn('[auth.controller] SENDGRID_API_KEY is not set — emails will not be sent');
}

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.register(req.body);
    res.status(201).json(result);
  } catch (err) { next(err); }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.login(req.body);
    res.json(result);
  } catch (err) { next(err); }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.refresh(req.body.refreshToken);
    res.json(result);
  } catch (err) { next(err); }
}

export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await prisma.user.findFirst({
      where: { id: req.user!.sub, deletedAt: null },
      select: { id: true, email: true, name: true, phone: true, rating: true, abGroup: true, createdAt: true, isAdmin: true },
    });
    if (!user) return res.status(404).json({ error: 'not_found', message: 'User not found' });
    res.json({ user: { ...user, role: user.isAdmin ? 'ADMIN' : 'USER' } });
  } catch (err) { next(err); }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    try {
      await redis.del(CACHE_KEYS.session(req.user!.sub));
    } catch {
      // Redis unavailable — still return success
    }
    res.json({ success: true });
  } catch (err) { next(err); }
}

export async function forgotPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { email } = req.body as { email: string };

    // Always return success to avoid leaking whether an account exists
    try {
      const user = await prisma.user.findFirst({
        where: { email: email.toLowerCase().trim(), deletedAt: null },
        select: { id: true, email: true, name: true },
      });

      if (user) {
        const crypto = await import('crypto');
        const token  = crypto.randomBytes(32).toString('hex');

        await redis.setex(
          CACHE_KEYS.passwordReset(token),
          CACHE_TTL.PASSWORD_RESET_SECONDS,
          user.id,
        );

        const resetLink = `${FRONTEND_URL}/reset-password?token=${token}`;

        if (process.env.SENDGRID_API_KEY) {
          await sgMail.send({
            to:      user.email,
            from:    FROM_EMAIL,
            subject: 'Reset your password',
            text: [
              `Hi ${user.name},`,
              '',
              'You requested a password reset. Click the link below to set a new password:',
              '',
              resetLink,
              '',
              'This link expires in 15 minutes. If you did not request a reset, ignore this email.',
            ].join('\n'),
            html: [
              `<p>Hi <strong>${user.name}</strong>,</p>`,
              `<p>You requested a password reset. Click the link below:</p>`,
              `<p><a href="${resetLink}">Reset my password</a></p>`,
              `<p>This link expires in 15 minutes.</p>`,
            ].join(''),
          });
        }
      }
    } catch (inner) {
      // Swallow all internal errors — never reveal details
    }

    res.json({ success: true });
  } catch (err) { next(err); }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { token, newPassword } = req.body as { token: string; newPassword: string };

    const userId = await redis.get(CACHE_KEYS.passwordReset(token));
    if (!userId) {
      return res.status(400).json({ error: 'invalid_token', message: 'Invalid or expired token' });
    }

    const bcrypt = await import('bcryptjs');
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({
      where: { id: userId },
      data:  { password: hashedPassword },
    });

    // Invalidate token and any existing session
    await Promise.allSettled([
      redis.del(CACHE_KEYS.passwordReset(token)),
      redis.del(CACHE_KEYS.session(userId)),
    ]);

    res.json({ success: true });
  } catch (err) { next(err); }
}
