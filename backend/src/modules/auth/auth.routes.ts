import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { validate } from '../../middlewares/validate.middleware';
import { requireAuth } from '../../middlewares/auth.middleware';
import { RegisterSchema, LoginSchema } from '@auction/shared-types';
import * as authController from './auth.controller';

export const authRouter = Router();

// ─── Rate limiters ────────────────────────────────────────────────────────────

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests', message: 'Too many login attempts — try again in 15 minutes' },
});

const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests', message: 'Too many password reset requests — try again in 15 minutes' },
});

// ─── Routes ───────────────────────────────────────────────────────────────────

const RefreshSchema     = z.object({ refreshToken: z.string().min(1) });
const ForgotSchema      = z.object({ email: z.string().email() });
const ResetSchema       = z.object({ token: z.string().min(1), newPassword: z.string().min(8) });

authRouter.post('/register',        validate({ body: RegisterSchema }),   authController.register);
authRouter.post('/login',           loginLimiter,  validate({ body: LoginSchema }),    authController.login);
authRouter.post('/refresh',         validate({ body: RefreshSchema }),    authController.refresh);
authRouter.get ('/me',              requireAuth,                          authController.me);
authRouter.post('/logout',          requireAuth,                          authController.logout);
authRouter.post('/forgot-password', forgotLimiter, validate({ body: ForgotSchema }),  authController.forgotPassword);
authRouter.post('/reset-password',  validate({ body: ResetSchema }),      authController.resetPassword);
