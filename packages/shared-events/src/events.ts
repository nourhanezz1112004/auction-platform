// ─── Redis Key Namespacing ────────────────────────────────────────────────────
// ALL Redis keys used anywhere in the system must come from this file.

// ─── Pub/Sub Event Topics ─────────────────────────────────────────────────────

export const EVENTS = {
  AUCTION_CREATED:   'events:auction:created',
  AUCTION_ENDED:     'events:auction:ended',
  BID_PLACED:        'events:bid:placed',
  BID_FLAGGED:       'events:bid:flagged',
  USER_REGISTERED:   'events:user:registered',
  PAYMENT_SUCCEEDED: 'events:payment:succeeded',
} as const;

export type EventTopic = typeof EVENTS[keyof typeof EVENTS];

// ─── Cache Keys (functions — include the ID) ──────────────────────────────────

export const CACHE_KEYS = {
  recommendations: (userId: string)  => `cache:recommendations:${userId}`,
  session:         (userId: string)  => `cache:session:${userId}`,
  passwordReset:   (token: string)   => `cache:pwd-reset:${token}`,
} as const;

export const CACHE_TTL = {
  RECOMMENDATIONS_SECONDS: 15 * 60,
  SESSION_SECONDS:          7 * 24 * 60 * 60,
  PASSWORD_RESET_SECONDS:   15 * 60,          // 15 minutes
} as const;

// ─── Socket.io Room Names ─────────────────────────────────────────────────────

export const SOCKET_ROOMS = {
  auction: (auctionId: string) => `socket:auction:${auctionId}`,
} as const;

// ─── Socket.io Event Names ────────────────────────────────────────────────────

export const SOCKET_EVENTS = {
  BID_NEW:          'bid:new',
  AUCTION_ENDED:    'auction:ended',
  AUCTION_EXTENDED: 'auction:extended',
  BID_PLACE:        'bid:place',
} as const;

// ─── Bull Queue Names ─────────────────────────────────────────────────────────

export const QUEUES = {
  AUCTION_STATUS: 'bull:auction-status',
} as const;

// ─── Payload Types ────────────────────────────────────────────────────────────

export interface AuctionCreatedPayload {
  auctionId: string;
  sellerId:  string;
  title:     string;
  category:  string;
}

export interface AuctionEndedPayload {
  auctionId:  string;
  sellerId:   string;          // added — needed by consumer for seller notification
  winnerId:   string | null;
  finalPrice: number;
}

export interface BidPlacedPayload {
  bidId:       string;
  auctionId:   string;
  userId:      string;
  amount:      number;
  abGroup:     'a' | 'b';
  timeExtended: boolean;
}

export interface BidFlaggedPayload {
  bidId:     string;
  auctionId: string;
  userId:    string;
  score:     number;
  signals:   string[];
}

export interface PaymentSucceededPayload {
  auctionId: string;
  buyerId:   string;
  amount:    number;           // in dollars (not cents)
}

export interface UserRegisteredPayload {
  userId: string;
  email:  string;
}

// ─── Socket Payload Types ─────────────────────────────────────────────────────

export interface BidNewSocketPayload {
  bid: {
    id:        string;
    amount:    number;
    bidderId:  string;
    timestamp: string;
  };
  newHighestBid: number;
  timeExtended:  boolean;
}

export interface AuctionEndedSocketPayload {
  auctionId:  string;
  winnerId:   string | null;
  finalPrice: number;
}

export interface AuctionExtendedSocketPayload {
  auctionId: string;
  newEndsAt: string;
}
