import { io } from 'socket.io-client';
import { prisma } from '../../src/lib/prisma';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import request from 'supertest';

async function run() {
  console.log('Starting Socket Throughput Performance Test...');

  const sellerId = randomUUID();
  const auctionId = randomUUID();
  
  await prisma.user.create({
    data: { id: sellerId, email: 'socket_seller@perf.com', password: 'hash', name: 'Seller' }
  });

  await prisma.auction.create({
    data: {
      id: auctionId, title: 'Socket Perf Auction', description: 'Desc', sellerId, category: 'Misc',
      startingPrice: 100, currentPrice: 100, reservePrice: 150,
      startsAt: new Date(), endsAt: new Date(Date.now() + 86400000), status: 'ACTIVE', version: 0,
    }
  });

  // Create 100 virtual users
  const users = await Promise.all(
    Array.from({ length: 100 }).map(async (_, i) => {
      const user = await prisma.user.create({
        data: { id: randomUUID(), email: `socket_bidder${i}@perf.com`, password: 'hash', name: `Bidder ${i}` }
      });
      const token = jwt.sign(
        { sub: user.id, email: user.email, isAdmin: user.isAdmin },
        process.env.JWT_ACCESS_SECRET!,
        { expiresIn: '15m' }
      );
      return { ...user, token };
    })
  );

  let connectionsCount = 0;
  let receivedEventsCount = 0;
  let disconnectsCount = 0;

  const sockets = users.map(u => {
    const socket = io('http://localhost:3000', {
      auth: { token: u.token }
    });

    socket.on('connect', () => {
      connectionsCount++;
      socket.emit('join:auction', auctionId);
    });

    socket.on('bid:new', () => {
      receivedEventsCount++;
    });

    socket.on('disconnect', () => {
      disconnectsCount++;
    });

    return socket;
  });

  // Wait for all to connect
  let attempts = 0;
  while (connectionsCount < 100 && attempts < 20) {
    await new Promise(resolve => setTimeout(resolve, 500));
    attempts++;
  }
  // Wait a little extra time for the join:auction events to be processed by the server
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log(`Connected ${connectionsCount} sockets.`);

  // One client places a bid every 2 seconds for 60 seconds (30 bids total)
  let currentPrice = 150;
  for (let i = 0; i < 30; i++) {
    const u = users[0];
    await fetch('http://localhost:3000/bids', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${u.token}`,
        'Content-Type': 'application/json',
        'x-performance-test': 'true',
      },
      body: JSON.stringify({ auctionId, amount: currentPrice++ }),
    });
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Wait a bit for events to propagate
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('Disconnects under load:', disconnectsCount);
  console.log('Received events:', receivedEventsCount);

  // Assert
  if (disconnectsCount > 0) console.error('ASSERT FAILED: No socket disconnections under load');
  if (receivedEventsCount < 30 * 100) console.error('ASSERT FAILED: All 100 clients receive every bid:new event');

  sockets.forEach(s => s.disconnect());

  // Cleanup
  await prisma.bid.deleteMany({ where: { auctionId } });
  await prisma.auction.delete({ where: { id: auctionId } });
  await prisma.user.deleteMany({ where: { id: { in: [sellerId, ...users.map(u => u.id)] } } });

  process.exit(0);
}

run().catch(console.error);
