/**
 * Quick diagnostic: registers a user, creates an auction, then places one bid
 * and shows the exact error body. Run from inside Docker:
 *   node /app/backend/tests/performance/_test-bid-direct.mjs
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const jwt   = require('jsonwebtoken');
const fetch = (...args) => import('node-fetch').then(m => m.default(...args)).catch(() => globalThis.fetch(...args));

const BASE = 'http://localhost:3000';
const SECRET = process.env.JWT_ACCESS_SECRET;

// ── 1. Register a user ──────────────────────────────────────────────────────
const email = `diag_${Date.now()}@test.com`;
const regRes = await fetch(`${BASE}/auth/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password: 'Password123!', name: 'Diag User' }),
});
const regBody = await regRes.json();
console.log('Register status:', regRes.status, JSON.stringify(regBody).slice(0, 200));

const userId      = regBody.user?.id;
const accessToken = regBody.accessToken;
if (!userId || !accessToken) { console.error('Register failed'); process.exit(1); }

// ── 2. Create an auction (as the same user — seller) ───────────────────────
const aucRes = await fetch(`${BASE}/auctions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
  body: JSON.stringify({
    title: 'Diag Auction',
    description: 'This is a valid test description for the diagnostic auction.',
    category: 'electronics',
    startingPrice: 100,
    reservePrice: 150,
    startsAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + 86400000).toISOString(),
    status: 'ACTIVE',
  }),
});
const aucBody = await aucRes.json();
console.log('Create auction status:', aucRes.status, JSON.stringify(aucBody).slice(0, 200));

const auctionId = aucBody.id ?? aucBody.auction?.id;
if (!auctionId) { console.error('Auction creation failed'); process.exit(1); }

// ── 3. Register a second user (bidder) ──────────────────────────────────────
const bidderEmail = `bidder_${Date.now()}@test.com`;
const bidderReg = await fetch(`${BASE}/auth/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: bidderEmail, password: 'Password123!', name: 'Bidder' }),
});
const bidderBody = await bidderReg.json();
const bidderToken = bidderBody.accessToken;
if (!bidderToken) { console.error('Bidder register failed', bidderBody); process.exit(1); }

// ── 4. Place a bid ──────────────────────────────────────────────────────────
const bidRes = await fetch(`${BASE}/bids`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bidderToken}` },
  body: JSON.stringify({ auctionId, amount: 150 }),
});
const bidBody = await bidRes.json();
console.log('Place bid status:', bidRes.status, JSON.stringify(bidBody).slice(0, 500));
