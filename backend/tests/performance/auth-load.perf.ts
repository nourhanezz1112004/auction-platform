import autocannon from 'autocannon';
import { prisma } from '../../src/lib/prisma';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

async function run() {
  console.log('Starting Auth Load Performance Test...');

  const userId = randomUUID();
  const password = await bcrypt.hash('Password123', 10);
  
  await prisma.user.create({
    data: { id: userId, email: 'auth_load@perf.com', password, name: 'Auth Load' }
  });

  const instance = autocannon({
    url: 'http://localhost:3000',
    connections: 50,
    duration: 30, // 30 seconds
    requests: [
      {
        method: 'POST',
        path: '/auth/login',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'auth_load@perf.com', password: 'Password123' }),
      }
    ],
  });

  autocannon.track(instance);

  instance.on('done', async (result) => {
    console.log('Test completed.');
    
    // Assert rate limiter kicks in (returns 429)
    const status429 = result.statusCodeStats['429']?.count || 0;
    const status5xx = result['5xx'];
    
    console.log(`429s: ${status429}, 500s: ${status5xx}`);
    
    if (status429 === 0) console.error('ASSERT FAILED: Rate limiter did not kick in (expected some 429s)');
    if (status5xx > 0) console.error('ASSERT FAILED: Expected 0 500s');

    // p99 under 300ms for non-rate-limited requests (overall might include 429 which is fast, but we check p99)
    if (result.latency.p99 > 300) console.error(`ASSERT FAILED: p99 should be under 300ms, got ${result.latency.p99}ms`);

    // Cleanup
    await prisma.user.delete({ where: { id: userId } });

    process.exit(0);
  });
}

run().catch(console.error);
