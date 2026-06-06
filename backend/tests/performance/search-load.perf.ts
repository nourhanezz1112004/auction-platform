import autocannon from 'autocannon';
import { prisma } from '../../src/lib/prisma';
import { randomUUID } from 'crypto';

async function run() {
  console.log('Starting Search Under Load Performance Test...');

  const sellerId = randomUUID();
  await prisma.user.create({
    data: { id: sellerId, email: 'search_perf@perf.com', password: 'hash', name: 'Seller' }
  });

  // Create 50 auctions
  await Promise.all(Array.from({ length: 50 }).map((_, i) => prisma.auction.create({
    data: {
      id: randomUUID(), title: `Perf Item ${i}`, description: 'Desc', sellerId, category: 'Misc',
      startingPrice: 100, currentPrice: 100, reservePrice: 150,
      startsAt: new Date(), endsAt: new Date(Date.now() + 86400000), status: 'ACTIVE', version: 0,
    }
  })));

  const queries = ['Item', 'Perf', 'Misc', 'NonExistent', '10', '20'];

  const instance = autocannon({
    url: 'http://localhost:3000',
    connections: 100,
    duration: 15,
    requests: queries.map(q => ({
      method: 'GET',
      path: `/search?q=${q}`,
    })),
  });

  autocannon.track(instance);

  instance.on('done', async (result) => {
    console.log('Test completed.');
    
    const status5xx = result['5xx'];
    
    console.log(`500s: ${status5xx}`);
    
    if (status5xx > 0) console.error('ASSERT FAILED: Expected 0 500s');
    if (result.latency.p95 > 400) console.error(`ASSERT FAILED: p95 should be under 400ms, got ${result.latency.p95}ms`);

    // Cleanup
    await prisma.auction.deleteMany({ where: { sellerId } });
    await prisma.user.delete({ where: { id: sellerId } });

    process.exit(0);
  });
}

run().catch(console.error);
