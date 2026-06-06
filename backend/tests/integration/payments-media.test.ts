/**
 * Integration tests — POST /payments/checkout, POST /payments/webhook, POST /media/upload
 *
 * Requirements (same as bids.test.ts):
 *   - Real PostgreSQL (DATABASE_URL env var)
 *   - Redis, Socket.io, Axios, Stripe, Cloudinary all mocked
 *   - AI service not required — axios mocked with safe fallbacks
 *
 * Run: cd backend && pnpm test
 */

import {
  describe, it, expect,
  beforeAll, afterAll, beforeEach, afterEach,
  vi,
} from 'vitest';
import request      from 'supertest';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt    from 'jsonwebtoken';

// ─── 1. Access Stripe and Cloudinary global mocks ─────────────────────────────
const mockStripe = (globalThis as any).mockStripe;
const mockCloudinary = (globalThis as any).mockCloudinary;

// ─── 3. Mock Axios (same stubs as bids.test.ts) ───────────────────────────────
vi.mock('axios', () => ({
  default: {
    post: vi.fn().mockImplementation((url: string) => {
      if (url.includes('/ai/anti-bot'))
        return Promise.resolve({ data: { is_bot: false, confidence: 0.0, reason: 'mocked' } });
      if (url.includes('/ai/fraud'))
        return Promise.resolve({ data: { flagged: false, score: 0.0, signals: [] } });
      return Promise.resolve({ data: {} });
    }),
  },
}));

// ─── 4. Mock Redis ────────────────────────────────────────────────────────────
vi.mock('../../src/utils/redis', () => ({
  redis: {
    publish:   vi.fn().mockResolvedValue(1),
    get:       vi.fn().mockResolvedValue(null),
    setex:     vi.fn().mockResolvedValue('OK'),
    on:        vi.fn(),
    subscribe: vi.fn(),
  },
}));

// ─── 5. Mock Socket.io ────────────────────────────────────────────────────────
vi.mock('../../src/utils/socket', () => ({
  setIO: vi.fn(),
  getIO: vi.fn().mockReturnValue({
    to: vi.fn().mockReturnValue({ emit: vi.fn() }),
  }),
}));

// ─── 6. Import app AFTER all mocks ───────────────────────────────────────────
import { app } from '../../src/index';

// ─── 7. Import mocked modules so we can reconfigure them per test ─────────────
import { v2 as cloudinaryV2 } from 'cloudinary';

// ─── Helpers to reach mock instances ─────────────────────────────────────────

function stripeMock() {
  return mockStripe;
}

// ─── DB + Auth helpers (identical to bids.test.ts) ───────────────────────────

const prisma = new PrismaClient();
const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret';

/** Mint a signed access token without touching the DB. */
function makeToken(userId: string, isAdmin = false): string {
  return jwt.sign(
    { sub: userId, email: 'test@example.com', isAdmin },
    ACCESS_SECRET,
    { expiresIn: '15m' },
  );
}

const RUN_ID = Date.now().toString(36);

interface TestUser    { id: string; email: string; token: string; }
interface TestAuction { id: string; currentPrice: number; version: number; }

async function createTestUser(suffix = ''): Promise<TestUser> {
  const email    = `pm-${RUN_ID}${suffix}@auction-test.com`;
  const password = await bcrypt.hash('Test1234!', 10);
  const user     = await prisma.user.create({
    data: { email, password, name: `PM User ${suffix}`, abGroup: 'a' },
  });
  return { id: user.id, email, token: makeToken(user.id) };
}

async function createTestAuction(
  sellerId:  string,
  overrides: Record<string, unknown> = {},
): Promise<TestAuction> {
  const auction = await prisma.auction.create({
    data: {
      title:         `PM Auction ${RUN_ID}`,
      description:   'Payments/media integration test auction',
      sellerId,
      category:      'electronics',
      startingPrice: 100,
      currentPrice:  250,
      reservePrice:  50,
      imageUrls:     [],
      status:        'ACTIVE',
      startsAt:      new Date(Date.now() - 60_000),
      endsAt:        new Date(Date.now() + 60 * 60_000),
      ...overrides,
    },
  });
  return { id: auction.id, currentPrice: auction.currentPrice, version: auction.version };
}

// ─── Cleanup tracking ─────────────────────────────────────────────────────────

const createdUserIds:    string[] = [];
const createdAuctionIds: string[] = [];

function trackUser(id: string)    { createdUserIds.push(id); }
function trackAuction(id: string) { createdAuctionIds.push(id); }

async function cleanupAll(): Promise<void> {
  if (createdAuctionIds.length) {
    // Delete in dependency order — Payment and Bid before Auction
    await prisma.payment.deleteMany({ where: { auctionId: { in: createdAuctionIds } } });
    await prisma.fraudFlag.deleteMany({ where: { bid: { auctionId: { in: createdAuctionIds } } } });
    await prisma.botBlock.deleteMany({ where: { auctionId: { in: createdAuctionIds } } });
    await prisma.bid.deleteMany({ where: { auctionId: { in: createdAuctionIds } } });
    await prisma.auction.deleteMany({ where: { id: { in: createdAuctionIds } } });
    createdAuctionIds.length = 0;
  }
  if (createdUserIds.length) {
    await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
  }
}

// ─── Suite lifecycle ──────────────────────────────────────────────────────────

beforeAll(async () => { await prisma.$connect(); });
afterAll(async  () => { await cleanupAll(); await prisma.$disconnect(); });
afterEach(async () => { await cleanupAll(); });

// ═════════════════════════════════════════════════════════════════════════════
// POST /payments/checkout
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /payments/checkout', () => {
  let user:    TestUser;
  let auction: TestAuction;

  beforeEach(async () => {
    user    = await createTestUser();           trackUser(user.id);
    auction = await createTestAuction(user.id, { 
      status: 'ENDED', 
      winnerId: user.id 
    }); 
    trackAuction(auction.id);

    // Default Stripe session mock — overridden per test where needed
    stripeMock().checkout.sessions.create.mockResolvedValue({
      id:  'cs_test_123',
      url: 'https://checkout.stripe.com/test',
    });
  });

  // ── 1. Happy path ────────────────────────────────────────────────────────
  it('returns 200 { stripeSessionUrl } for a valid authenticated request', async () => {
    const res = await request(app)
      .post('/payments/checkout')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ auctionId: auction.id });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('stripeSessionUrl', 'https://checkout.stripe.com/test');

    // Payment row written to DB with correct fields
    const payment = await prisma.payment.findUnique({ where: { auctionId: auction.id } });
    expect(payment).not.toBeNull();
    expect(payment?.stripeSessionId).toBe('cs_test_123');
    expect(payment?.status).toBe('PENDING');
    expect(payment?.amount).toBe(auction.currentPrice);
    expect(payment?.buyerId).toBe(user.id);
  });

  // ── 2. No auth ───────────────────────────────────────────────────────────
  it('returns 401 when no Authorization header is provided', async () => {
    const res = await request(app)
      .post('/payments/checkout')
      .send({ auctionId: auction.id });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('unauthorized');
  });

  // ── 3. Non-existent auction ──────────────────────────────────────────────
  it('returns 404 when auctionId does not exist in the database', async () => {
    const res = await request(app)
      .post('/payments/checkout')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ auctionId: '00000000-0000-0000-0000-000000000000' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });

  // ── 4. Soft-deleted auction ──────────────────────────────────────────────
  it('returns 404 when auction exists but is soft-deleted', async () => {
    await prisma.auction.update({
      where: { id: auction.id },
      data:  { deletedAt: new Date(), status: 'CANCELLED' },
    });

    const res = await request(app)
      .post('/payments/checkout')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ auctionId: auction.id });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /payments/webhook
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /payments/webhook', () => {
  let user:    TestUser;
  let auction: TestAuction;

  const SESSION_ID = 'cs_webhook_test_456';

  beforeEach(async () => {
    user    = await createTestUser('-wh'); trackUser(user.id);
    auction = await createTestAuction(user.id); trackAuction(auction.id);

    // Seed a PENDING Payment row with a known stripeSessionId
    await prisma.payment.create({
      data: {
        auctionId:       auction.id,
        buyerId:         user.id,
        amount:          auction.currentPrice,
        status:          'PENDING',
        stripeSessionId: SESSION_ID,
      },
    });
  });

  // ── 5. Valid webhook event → SUCCEEDED ───────────────────────────────────
  it('returns 200 { received: true } and updates Payment to SUCCEEDED', async () => {
    stripeMock().webhooks.constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          id:          SESSION_ID,
          metadata:    { auctionId: auction.id, buyerId: user.id },
          amount_total: Math.round(auction.currentPrice * 100),
        },
      },
    });

    const res = await request(app)
      .post('/payments/webhook')
      .set('stripe-signature', 'sig_test')
      // express.raw() is applied to /payments/webhook in index.ts;
      // sending raw bytes with application/json simulates Stripe's real call
      .set('Content-Type', 'application/json')
      .send(Buffer.from('{}'));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });

    // Payment status must be updated in the DB
    const payment = await prisma.payment.findUnique({ where: { auctionId: auction.id } });
    expect(payment?.status).toBe('SUCCEEDED');
  });

  // ── 6. Invalid signature → 400 ──────────────────────────────────────────
  it('returns 400 when Stripe signature verification fails', async () => {
    stripeMock().webhooks.constructEvent.mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature for payload');
    });

    const res = await request(app)
      .post('/payments/webhook')
      .set('stripe-signature', 'bad_sig')
      .set('Content-Type', 'application/json')
      .send(Buffer.from('{}'));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Webhook signature verification failed');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /media/upload
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /media/upload', () => {
  let user:    TestUser;
  let auction: TestAuction;

  // 1×1 transparent PNG — smallest valid image buffer
  const PNG_BUFFER = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  );

  const CLD_URL = 'https://res.cloudinary.com/test/image.jpg';
  const CLD_PID = 'auction-platform/auctions/test/img1';

  /** Configure upload_stream to resolve immediately with a success result. */
  function mockCloudinarySuccess() {
    vi.mocked(cloudinaryV2.uploader.upload_stream).mockImplementation(
      (_opts: any, cb?: (error: Error | undefined, result: any) => void) => {
        cb?.(undefined, { secure_url: CLD_URL, public_id: CLD_PID });
        return { end: vi.fn() } as any;
      },
    );
  }

  beforeEach(async () => {
    user    = await createTestUser('-media'); trackUser(user.id);
    auction = await createTestAuction(user.id); trackAuction(auction.id);
  });

  // ── 7. Happy path ────────────────────────────────────────────────────────
  it('returns 201 { url, publicId } for a valid image upload', async () => {
    mockCloudinarySuccess();

    const res = await request(app)
      .post('/media/upload')
      .set('Authorization', `Bearer ${user.token}`)
      .field('auctionId', auction.id)
      .attach('file', PNG_BUFFER, { filename: 'test.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ url: CLD_URL, publicId: CLD_PID });

    // URL must be appended to the auction's imageUrls array in the DB
    const updated = await prisma.auction.findUnique({ where: { id: auction.id } });
    expect(updated?.imageUrls).toContain(CLD_URL);
  });

  // ── 8. No auth ───────────────────────────────────────────────────────────
  it('returns 401 when no Authorization header is provided', async () => {
    const res = await request(app)
      .post('/media/upload')
      .field('auctionId', auction.id)
      .attach('file', PNG_BUFFER, { filename: 'test.png', contentType: 'image/png' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('unauthorized');
  });

  // ── 9. No file attached ──────────────────────────────────────────────────
  it('returns 400 missing_file when no file field is attached', async () => {
    const res = await request(app)
      .post('/media/upload')
      .set('Authorization', `Bearer ${user.token}`)
      .field('auctionId', auction.id);
    // No .attach() — multer processes the form but req.file is undefined

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('missing_file');
  });

  // ── 10. auctionId missing from form body ─────────────────────────────────
  it('returns 400 missing_auction_id when auctionId field is absent', async () => {
    mockCloudinarySuccess();

    const res = await request(app)
      .post('/media/upload')
      .set('Authorization', `Bearer ${user.token}`)
      .attach('file', PNG_BUFFER, { filename: 'test.png', contentType: 'image/png' });
    // No .field('auctionId') — req.body.auctionId will be undefined

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('missing_auction_id');
  });

  // ── 11. Non-existent auctionId ───────────────────────────────────────────
  it('returns 404 when auctionId does not exist in the database', async () => {
    // Cloudinary is not called — the 404 is returned before the upload
    const res = await request(app)
      .post('/media/upload')
      .set('Authorization', `Bearer ${user.token}`)
      .field('auctionId', '00000000-0000-0000-0000-000000000000')
      .attach('file', PNG_BUFFER, { filename: 'test.png', contentType: 'image/png' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });

  // ── 12. Non-image file type ──────────────────────────────────────────────
  it('returns 400 invalid_file_type when a non-image file is uploaded', async () => {
    const txtBuffer = Buffer.from('this is plain text, not an image');

    const res = await request(app)
      .post('/media/upload')
      .set('Authorization', `Bearer ${user.token}`)
      .field('auctionId', auction.id)
      .attach('file', txtBuffer, { filename: 'notes.txt', contentType: 'text/plain' });

    // multer's fileFilter calls cb(new BadRequestError('invalid_file_type', ...))
    // which is forwarded to errorMiddleware → 400
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_file_type');
  });
});
