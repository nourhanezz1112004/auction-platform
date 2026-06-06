// backend/src/middleware/rateLimiter.ts
// Per-user Redis-backed rate limiting for bid submission.
// Global fallback for unauthenticated routes.

import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import { createClient } from "redis";
import { Request } from "express";

const redisClient = createClient({ url: process.env.REDIS_URL ?? "redis://localhost:6379" });
redisClient.connect().catch(console.error);

// ── Bid rate limiter: 5 bids per 2 seconds per user ──────────────────────────
export const bidRateLimiter = rateLimit({
  windowMs: 2_000,        // 2-second window
  max: 5,                 // max 5 bids per window
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) =>
    `bid:${(req as any).user?.id ?? (req as any).session?.userId ?? req.ip}`,
  store: new RedisStore({
    sendCommand: (...args: string[]) => redisClient.sendCommand(args),
    prefix: "rl:bid:",
  }),
  handler: (_req, res) =>
    res.status(429).json({
      error: "Too many bids — maximum 5 per 2 seconds. Please slow down.",
      retryAfter: 2,
    }),
});

// ── General API limiter: 300 req/min per IP ───────────────────────────────────
export const globalRateLimiter = rateLimit({
  windowMs: 60_000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args: string[]) => redisClient.sendCommand(args),
    prefix: "rl:global:",
  }),
  handler: (_req, res) =>
    res.status(429).json({ error: "Too many requests. Please try again in a minute." }),
});

// ── Auth limiter: 10 login attempts / 15 min per IP ──────────────────────────
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  standardHeaders: true,
  store: new RedisStore({
    sendCommand: (...args: string[]) => redisClient.sendCommand(args),
    prefix: "rl:auth:",
  }),
  handler: (_req, res) =>
    res.status(429).json({ error: "Too many login attempts. Try again in 15 minutes." }),
});
