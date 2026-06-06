// backend/src/middleware/csrf.ts
// Double-submit cookie CSRF protection (works with JWT — no session needed).
// On login: server sends a random csrfToken in a cookie.
// On state-changing requests: client must echo it in X-CSRF-Token header.

import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

const CSRF_COOKIE = "csrf_token";
const CSRF_HEADER = "x-csrf-token";
const SAFE_METHODS = new Set(["GET","HEAD","OPTIONS"]);

// Attach a new CSRF token cookie on every response that doesn't have one
export function csrfInit(req: Request, res: Response, next: NextFunction): void {
  if (!req.cookies?.[CSRF_COOKIE]) {
    const token = crypto.randomBytes(32).toString("hex");
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,      // must be JS-readable so the client can echo it
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });
  }
  next();
}

// Validate CSRF token on state-changing requests
export function csrfProtect(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) { next(); return; }

  const cookieToken: string | undefined = req.cookies?.[CSRF_COOKIE];
  const headerToken: string | undefined = req.headers[CSRF_HEADER] as string;

  if (!cookieToken || !headerToken) {
    res.status(403).json({ error: "CSRF token missing" });
    return;
  }

  // Constant-time comparison to prevent timing attacks
  const a = Buffer.from(cookieToken);
  const b = Buffer.from(headerToken);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    res.status(403).json({ error: "CSRF token invalid" });
    return;
  }

  next();
}
