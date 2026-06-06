import { z } from 'zod';

// ─── Zod Schemas ───────────────────────────────────────────────────────────────

export const PlaceBidSchema = z.object({
  auctionId: z.string().uuid(),          // was min(1) — now enforces UUID format
  amount:    z.number().positive(),
});

export const BidQuerySchema = z.object({
  page:  z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
  auctionId: z.string().uuid().optional(),
});

// ─── Inferred Types ────────────────────────────────────────────────────────────

export type PlaceBidRequest = z.infer<typeof PlaceBidSchema>;
export type BidQuery        = z.infer<typeof BidQuerySchema>;

// ─── Response Shapes ──────────────────────────────────────────────────────────

export interface Bid {
  id:        string;
  userId:    string;
  auctionId: string;
  amount:    number;
  createdAt: string;
}

export interface PlaceBidResponse {
  bid:           Bid;
  newHighestBid: number;
}

export interface BidListResponse {
  bids:  Bid[];
  total: number;
}

// ─── Error Codes ──────────────────────────────────────────────────────────────
// These are the exact reason strings returned in 4xx responses.
// Frontend switches on these — never use free-form strings.

export const BidErrorCode = {
  BOT_DETECTED:     'bot_detected',    // 403 — anti-bot confidence > 0.7
  CAPTCHA_REQUIRED: 'captcha_required',// 403 — anti-bot confidence 0.4–0.7
  FRAUD_FLAGGED:    'fraud_flagged',   // 402 — fraud score > 0.7
  OUTBID:           'outbid',          // 409 — optimistic concurrency version mismatch
  AUCTION_ENDED:    'auction_ended',   // 410 — endsAt has passed
} as const;
export type BidErrorCode = typeof BidErrorCode[keyof typeof BidErrorCode];

export interface BidErrorResponse {
  error:         BidErrorCode;
  message:       string;
  currentPrice?: number;  // included on 409 outbid only
}

// ─── Review Schema (co-located with bid types for shared access) ───────────────

export const CreateReviewSchema = z.object({
  auctionId: z.string().uuid(),
  rating:    z.number().int().min(1).max(5),
  comment:   z.string().optional(),
});

export type CreateReviewRequest = z.infer<typeof CreateReviewSchema>;
