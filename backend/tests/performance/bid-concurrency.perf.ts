import autocannon from 'autocannon';
import { prisma } from '../../src/lib/prisma';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';

async function run() {
  console.log('Starting Bid Concurrency Performance Test...');

  // Setup test data
  const sellerId = randomUUID();
  const auctionId = randomUUID();
  
  await prisma.user.create({
    data: { id: sellerId, email: 'seller@perf.com', password: 'hash', name: 'Seller' }
  });

  await prisma.auction.create({
    data: {
      id: auctionId, title: 'Perf Auction', description: 'Desc', sellerId, category: 'Misc',
      startingPrice: 100, currentPrice: 100, reservePrice: 150,
      startsAt: new Date(), endsAt: new Date(Date.now() + 86400000), status: 'ACTIVE', version: 0,
    }
  });

  // Create 50 virtual users and tokens
  const users = await Promise.all(
    Array.from({ length: 50 }).map(async (_, i) => {
      const user = await prisma.user.create({
        data: { id: randomUUID(), email: `bidder${i}@perf.com`, password: 'hash', name: `Bidder ${i}` }
      });
      const token = jwt.sign(
        { sub: user.id, email: user.email, isAdmin: user.isAdmin },
        process.env.JWT_ACCESS_SECRET!,
        { expiresIn: '15m' }
      );
      return { ...user, token };
    })
  );

  // We want to fire 50 requests simultaneously at the same price. Autocannon handles this with 50 connections.
  const requests = users.map((u) => ({
    method: 'POST',
    path: '/bids',
    headers: {
      Authorization: `Bearer ${u.token}`,
      'Content-Type': 'application/json',
      'x-performance-test': 'true',
    },
    body: JSON.stringify({
      auctionId,
      amount: 150, // All bidding the same amount
    }),
  }));

  const instance = autocannon({
    url: 'http://localhost:3000',
    connections: 50,
    amount: 50, // Exactly 50 requests total
    requests,
  });

  autocannon.track(instance);

  instance.on('done', async (result) => {
    console.log('Test completed.');
    
    // Assert exactly one bid wins per price level, zero 500 errors, all others return 409
    const status201 = result.statusCodeStats['201']?.count || 0;
    const status409 = result.statusCodeStats['409']?.count || 0;
    const status429 = result.statusCodeStats['429']?.count || 0;
    const status5xx = result['5xx'];
    
    console.log(`201s: ${status201}, 409s: ${status409}, 429s: ${status429}, 500s: ${status5xx}`);
    if (status201 !== 1) console.error('ASSERT FAILED: Expected exactly one 201');
    if (status409 + status429 !== 49) {
      console.error(`ASSERT FAILED: Expected exactly 49 non-winning responses (got 409s: ${status409}, 429s: ${status429})`);
    }
    if (status5xx > 0) console.error('ASSERT FAILED: Expected 0 500s');

    const auction = await prisma.auction.findUnique({ where: { id: auctionId } });
    if (auction?.version !== 1) console.error('ASSERT FAILED: Version should be 1');

    if (result.latency.p95 > 500) console.error('ASSERT FAILED: p95 should be under 500ms');

    // Cleanup
    await prisma.bid.deleteMany({ where: { auctionId } });
    await prisma.auction.delete({ where: { id: auctionId } });
    await prisma.user.deleteMany({ where: { id: { in: [sellerId, ...users.map(u => u.id)] } } });

    process.exit(0);
  });
}

run().catch(console.error);
