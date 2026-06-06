import { prisma } from '../setup';
import jwt from 'jsonwebtoken';
import { User, Auction, Bid } from '@prisma/client';

export async function createTestUser(overrides: Partial<User> = {}): Promise<User> {
  return prisma.user.create({
    data: {
      email: 'test' + Date.now() + Math.random() + '@example.com',
      password: 'hashedpassword',
      name: 'Test User',
      ...overrides,
    },
  });
}

export async function createTestAuction(sellerId: string, overrides: Partial<Auction> = {}): Promise<Auction> {
  const now = new Date();
  const later = new Date(now.getTime() + 1000 * 60 * 60 * 24); // 1 day later
  return prisma.auction.create({
    data: {
      title: 'Test Auction',
      description: 'Test Description',
      sellerId,
      category: 'Test Category',
      startingPrice: 100,
      currentPrice: 100,
      reservePrice: 200,
      imageUrls: ['https://example.com/image.jpg'],
      status: 'ACTIVE',
      startsAt: now,
      endsAt: later,
      ...overrides,
    },
  });
}

export async function createTestBid(userId: string, auctionId: string, amount: number): Promise<Bid> {
  return prisma.bid.create({
    data: {
      userId,
      auctionId,
      amount,
    },
  });
}

export function loginAs(user: User): { accessToken: string; refreshToken: string } {
  const payload = { sub: user.id, email: user.email, isAdmin: user.isAdmin };
  const accessToken = jwt.sign(payload, process.env.JWT_ACCESS_SECRET!, { expiresIn: '15m' });
  const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET!, { expiresIn: '7d' });
  return { accessToken, refreshToken };
}
