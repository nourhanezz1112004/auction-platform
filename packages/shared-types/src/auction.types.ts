import { z } from 'zod';

// ─── Enums ─────────────────────────────────────────────────────────────────────

export const AuctionStatus = {
  DRAFT:     'DRAFT',
  ACTIVE:    'ACTIVE',
  ENDED:     'ENDED',
  CANCELLED: 'CANCELLED',
} as const;
export type AuctionStatus = typeof AuctionStatus[keyof typeof AuctionStatus];

export const AuctionCategory = {
  CAMERAS:     'cameras',
  WATCHES:     'watches',
  ART:         'art',
  ELECTRONICS: 'electronics',
  FASHION:     'fashion',
  COLLECTIBLES:'collectibles',
  JEWELLERY:   'jewellery',
  OTHER:       'other',
} as const;
export type AuctionCategory = typeof AuctionCategory[keyof typeof AuctionCategory];

// ─── Zod Schemas ───────────────────────────────────────────────────────────────

export const CreateAuctionSchema = z.object({
  title:         z.string().min(3).max(200),
  description:   z.string().min(10),
  category:      z.nativeEnum(AuctionCategory),
  startingPrice: z.number().positive(),
  reservePrice:  z.number().positive(),
  startsAt:      z.string().datetime(),
  endsAt:        z.string().datetime(),
});

export const UpdateAuctionSchema = CreateAuctionSchema.partial();

export const AuctionQuerySchema = z.object({
  page:     z.coerce.number().int().positive().default(1),
  limit:    z.coerce.number().int().positive().max(100).default(20),
  category: z.nativeEnum(AuctionCategory).optional(),
  status:   z.nativeEnum(AuctionStatus).optional(),
  q:        z.string().optional(),
  sellerId: z.string().optional(),
});

// ─── Inferred Types ────────────────────────────────────────────────────────────

export type CreateAuctionRequest = z.infer<typeof CreateAuctionSchema>;
export type UpdateAuctionRequest = z.infer<typeof UpdateAuctionSchema>;
export type AuctionQuery         = z.infer<typeof AuctionQuerySchema>;

// ─── Response Shapes ──────────────────────────────────────────────────────────

export interface Auction {
  id:            string;
  title:         string;
  description:   string;
  sellerId:      string;
  category:      AuctionCategory;
  startingPrice: number;
  currentPrice:  number;
  reservePrice:  number;
  imageUrls:     string[];
  status:        AuctionStatus;
  version:       number;   // optimistic concurrency — never omit
  startsAt:      string;
  endsAt:        string;
  createdAt:     string;
}

export interface AuctionListResponse {
  auctions: Auction[];
  total:    number;
  page:     number;
}
