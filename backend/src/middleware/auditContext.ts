// backend/src/middleware/auditContext.ts
//
// Attaches an AuditContext to every request so downstream routes and services
// can call audit() without manually extracting user/IP/agent each time.
//
// Usage: app.use(auditContextMiddleware) — add AFTER your session/JWT middleware
// so req.session / req.user is already populated.

import { Request, Response, NextFunction } from "express";
import { AuditContext } from "../services/auditLogger";

// Extend Express Request to carry audit context
declare global {
  namespace Express {
    interface Request {
      auditCtx: AuditContext;
    }
  }
}

/**
 * Extracts actor identity and request metadata from the authenticated session.
 * Compatible with BidSpace's JWT + Express session setup.
 */
export function auditContextMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  // Support both JWT (req.user) and session (req.session.userId) patterns
  const actorId: string | undefined =
    (req as any).user?.sub ??
    (req as any).user?.id ??
    (req as any).user?.userId ??
    (req as any).session?.userId ??
    undefined;

  req.auditCtx = {
    actorId,
    // X-Forwarded-For is set by your CDN/load balancer in production
    actorIp: (
      (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() ??
      req.socket.remoteAddress ??
      req.ip
    ),
    actorAgent: req.headers["user-agent"],
  };

  next();
}

// ─── Route-level audit middleware factories ───────────────────────────────────
// These wrap specific routes to add audit calls automatically,
// keeping route handlers clean.

import { auditBid, auditAuction, auditPayment } from "../services/auditLogger";
import { AuditAction } from "@prisma/client";

/**
 * Post-response middleware for bid placement.
 * Attaches AFTER your bid route handler runs.
 * The route handler should set res.locals.auditBid with the relevant data.
 *
 * Example in your bid route:
 *   res.locals.auditBid = { bidId, auctionId, bidAmount, previousHighestBid, action: 'BID_PLACED' };
 *   res.json({ success: true, ... });
 */
export function bidAuditMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Intercept res.json to capture the response before it's sent
  const originalJson = res.json.bind(res);

  res.json = function (body: unknown) {
    const auditData = res.locals.auditBid as {
      action: AuditAction;
      bidId: string;
      auctionId: string;
      bidAmount: number;
      previousHighestBid: number;
      fraudScore?: number;
      rejectionReason?: string;
    } | undefined;

    if (auditData) {
      // Fire-and-forget — do not await, keeps response latency clean
      auditBid({ ...auditData, ctx: req.auditCtx }).catch(() => {});
    }

    return originalJson(body);
  };

  next();
}

/**
 * Post-response middleware for payment routes.
 * Route handler sets res.locals.auditPayment with payment data.
 */
export function paymentAuditMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const originalJson = res.json.bind(res);

  res.json = function (body: unknown) {
    const auditData = res.locals.auditPayment as {
      action: AuditAction;
      paymentId: string;
      auctionId: string;
      amount: number;
      currency: string;
      stripePaymentIntentId?: string;
      failureReason?: string;
    } | undefined;

    if (auditData) {
      auditPayment({ ...auditData, ctx: req.auditCtx }).catch(() => {});
    }

    return originalJson(body);
  };

  next();
}
