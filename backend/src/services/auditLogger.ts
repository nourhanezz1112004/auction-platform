// backend/src/services/auditLogger.ts
//
// Central audit logging service for BidSpace.
// Call audit() anywhere in the app — routes, services, Bull jobs, sockets.
// All writes are fire-and-forget (non-blocking) to keep latency off the hot path.
// On failure the error is captured and logged to stderr/Sentry — never thrown.

import { prisma } from "../lib/prisma";
import { AuditAction, AuditEntity, Prisma } from "@prisma/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuditContext {
  /** The user performing the action. Undefined for system/job-triggered events. */
  actorId?: string;
  /** Raw IP from req.ip — store for dispute resolution */
  actorIp?: string;
  /** Truncated User-Agent string */
  actorAgent?: string;
}

export interface AuditOptions {
  action: AuditAction;
  entity: AuditEntity;
  /** The primary ID of the entity being acted on (bidId, auctionId, paymentId) */
  entityId: string;
  /** Optional denormalised auctionId for fast auction-timeline queries */
  auctionId?: string;
  /** userId of the actor resolved as a User FK (may differ from actorId for admin impersonation) */
  userId?: string;
  /** Immutable snapshot of relevant state at the moment of the event.
   *  Include enough to reconstruct what happened without the main tables. */
  snapshot: Record<string, unknown>;
  ctx?: AuditContext;
}

// ─── Core logger ─────────────────────────────────────────────────────────────

/**
 * Fire-and-forget audit write. Never awaited on the hot path.
 * Returns the Promise so callers can await in tests or batch jobs.
 */
export function audit(options: AuditOptions): Promise<void> {
  const { action, entity, entityId, auctionId, userId, snapshot, ctx } = options;

  const write = prisma.auditLog
    .create({
      data: {
        action,
        entity,
        entityId,
        auctionId,
        userId,
        actorId: ctx?.actorId,
        actorIp: ctx?.actorIp?.slice(0, 45),           // fits IPv6
        actorAgent: ctx?.actorAgent?.slice(0, 255),
        snapshot: snapshot as Prisma.InputJsonValue,
      },
      select: { id: true },                              // minimal read-back
    })
    .then(() => undefined)
    .catch((err: Error) => {
      // Audit failure must NEVER crash the main request — log and continue.
      console.error("[audit] write failed", { action, entity, entityId, err });
      // If you have Sentry wired: Sentry.captureException(err, { extra: options });
    });

  return write;
}

// ─── Convenience wrappers ─────────────────────────────────────────────────────
// These match BidSpace's domain language exactly and enforce the right snapshot shape.

/** Audit a bid placement (accepted or rejected). */
export function auditBid(params: {
  action: Extract<
    AuditAction,
    | "BID_PLACED"
    | "BID_REJECTED_FRAUD"
    | "BID_REJECTED_TOO_LOW"
    | "BID_REJECTED_AUCTION_CLOSED"
    | "BID_REJECTED_SELF_BID"
    | "BID_WINNING"
    | "BID_OUTBID"
    | "BID_RETRACTED"
  >;
  bidId: string;
  auctionId: string;
  bidAmount: number;
  previousHighestBid: number;
  fraudScore?: number;
  rejectionReason?: string;
  ctx: AuditContext;
}): Promise<void> {
  return audit({
    action: params.action,
    entity: "BID",
    entityId: params.bidId,
    auctionId: params.auctionId,
    userId: params.ctx.actorId,
    snapshot: {
      bidAmount: params.bidAmount,
      previousHighestBid: params.previousHighestBid,
      fraudScore: params.fraudScore,
      rejectionReason: params.rejectionReason,
    },
    ctx: params.ctx,
  });
}

/** Audit an auction lifecycle event (close, extend, cancel). */
export function auditAuction(params: {
  action: Extract<
    AuditAction,
    | "AUCTION_CREATED"
    | "AUCTION_EXTENDED"
    | "AUCTION_CLOSED"
    | "AUCTION_CANCELLED"
    | "AUCTION_RESERVE_NOT_MET"
  >;
  auctionId: string;
  snapshot: {
    title: string;
    reservePrice: number;
    finalBid?: number;
    winnerId?: string;
    extensionReason?: string;
    newEndTime?: Date;
  };
  ctx?: AuditContext; // optional — lifecycle events are often system-triggered
}): Promise<void> {
  return audit({
    action: params.action,
    entity: "AUCTION",
    entityId: params.auctionId,
    auctionId: params.auctionId,
    snapshot: params.snapshot as Record<string, unknown>,
    ctx: params.ctx,
  });
}

/** Audit a payment event. */
export function auditPayment(params: {
  action: Extract<
    AuditAction,
    | "PAYMENT_INITIATED"
    | "PAYMENT_SUCCEEDED"
    | "PAYMENT_FAILED"
    | "PAYMENT_REFUNDED"
    | "PAYMENT_DISPUTED"
    | "ESCROW_RELEASED"
    | "ESCROW_HELD"
  >;
  paymentId: string;
  auctionId: string;
  amount: number;
  currency: string;
  stripePaymentIntentId?: string;
  failureReason?: string;
  ctx: AuditContext;
}): Promise<void> {
  return audit({
    action: params.action,
    entity: "PAYMENT",
    entityId: params.paymentId,
    auctionId: params.auctionId,
    userId: params.ctx.actorId,
    snapshot: {
      amount: params.amount,
      currency: params.currency,
      stripePaymentIntentId: params.stripePaymentIntentId,
      failureReason: params.failureReason,
    },
    ctx: params.ctx,
  });
}
