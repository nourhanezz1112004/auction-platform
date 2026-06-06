/**
 * Seed script — run with: pnpm seed
 *
 * Creates:
 *   - 10 users (5 group A / 5 group B for A/B test)
 *   - 20 auctions across categories (cameras, watches, art) — clear clusters for demo
 *   - 200+ bids spread across auctions
 *   - Some fraud flags for admin dashboard demo
 *
 * Clear category clusters are essential for Demo Moment 3 (personalised recommendations).
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const CATEGORIES = ['cameras', 'watches', 'art', 'electronics', 'jewellery'];

const SEED_AUCTIONS = [
  // ── Cameras cluster ────────────────────────────────────────────────────────
  { title: 'Leica M6 TTL Silver Chrome', category: 'cameras', price: 1250, desc: 'Pristine Leica M6 TTL with original box, strap, and 50mm viewfinder.' },
  { title: 'Hasselblad 500CM Medium Format', category: 'cameras', price: 2100, desc: 'Classic Hasselblad 500CM with 80mm Planar lens and film back.' },
  { title: 'Nikon F3 HP Professional SLR', category: 'cameras', price: 480, desc: 'Nikon F3 HP in excellent condition. Light seals replaced. Shutter accurate.' },
  { title: 'Canon AE-1 Program + 50mm', category: 'cameras', price: 220, desc: 'Fully working Canon AE-1 Program with 50mm f/1.8 lens.' },

  // ── Watches cluster ────────────────────────────────────────────────────────
  { title: 'Rolex Submariner Date 2022', category: 'watches', price: 9200, desc: 'Unworn Rolex Submariner Date ref. 126610LN with box and papers.' },
  { title: 'Omega Speedmaster Moonwatch', category: 'watches', price: 4800, desc: 'Omega Speedmaster Professional ref. 310.30.42.50.01.001. Full set.' },
  { title: 'Seiko 6105 Diver 1972', category: 'watches', price: 1800, desc: 'Vintage Seiko 6105-8110 Captain Willard. Original dial, bracelet.' },
  { title: 'IWC Portugieser Chronograph', category: 'watches', price: 7400, desc: 'IWC Portugieser Chronograph ref. IW371601 with silver dial.' },

  // ── Art cluster ────────────────────────────────────────────────────────────
  { title: 'Banksy — "Balloon Girl" Print', category: 'art', price: 3200, desc: 'Authenticated Banksy screen print. Certificate of authenticity included.' },
  { title: 'Jean-Michel Basquiat Lithograph', category: 'art', price: 5500, desc: 'Limited edition lithograph, numbered 47/250. Provenance documented.' },
  { title: 'Roy Lichtenstein Offset Print', category: 'art', price: 2800, desc: 'Vintage 1970s Lichtenstein offset poster. Museum framed.' },
  { title: 'Contemporary Oil — Abstract No. 7', category: 'art', price: 950, desc: 'Large format abstract oil on canvas, 120x90cm. Signed 2023.' },

  // ── Electronics ────────────────────────────────────────────────────────────
  { title: 'Apple M3 MacBook Pro 14"', category: 'electronics', price: 1600, desc: 'M3 Pro chip, 18GB RAM, 512GB SSD. AppleCare+ until 2026.' },
  { title: 'Sony WH-1000XM5 Headphones', category: 'electronics', price: 280, desc: 'Mint condition Sony WH-1000XM5 with all accessories.' },
  { title: 'DJI Mini 4 Pro Drone', category: 'electronics', price: 750, desc: 'DJI Mini 4 Pro with Fly More Combo. Under 10 flights.' },
  { title: 'Fujifilm X-T5 Mirrorless', category: 'electronics', price: 1400, desc: 'Fujifilm X-T5 body only, 6400 shots on shutter.' },

  // ── Jewellery ──────────────────────────────────────────────────────────────
  { title: 'Art Deco Diamond Ring 1.2ct', category: 'jewellery', price: 3800, desc: 'Platinum Art Deco ring with 1.2ct old European cut diamond. GIA cert.' },
  { title: 'Victorian Gold Locket', category: 'jewellery', price: 680, desc: '18ct gold Victorian locket with engraving. Circa 1880.' },
  { title: 'Cartier Love Bracelet 18ct', category: 'jewellery', price: 4200, desc: 'Authentic Cartier Love bracelet with screwdriver. Size 17.' },
  { title: 'Pearl Strand Necklace 16"', category: 'jewellery', price: 420, desc: 'Akoya cultured pearl strand with 18ct gold clasp.' },
];

async function main() {
  console.log('🌱 Seeding database...\n');

  // ── Users ────────────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('demo1234', 10);

  const users = await Promise.all([
    prisma.user.upsert({
      where: { email: 'admin@auction.com' },
      update: {},
      create: { email: 'admin@auction.com', password: passwordHash, name: 'Admin User', abGroup: 'a', isAdmin: true },
    }),
    prisma.user.upsert({
      where: { email: 'alice@example.com' },
      update: {},
      create: { email: 'alice@example.com', password: passwordHash, name: 'Alice Chen', abGroup: 'a' },
    }),
    prisma.user.upsert({
      where: { email: 'bob@example.com' },
      update: {},
      create: { email: 'bob@example.com', password: passwordHash, name: 'Bob Hassan', abGroup: 'b' },
    }),
    prisma.user.upsert({
      where: { email: 'carol@example.com' },
      update: {},
      create: { email: 'carol@example.com', password: passwordHash, name: 'Carol Smith', abGroup: 'a' },
    }),
    prisma.user.upsert({
      where: { email: 'david@example.com' },
      update: {},
      create: { email: 'david@example.com', password: passwordHash, name: 'David Park', abGroup: 'b' },
    }),
  ]);

  console.log(`✅ Created ${users.length} users`);

  // ── Auctions ──────────────────────────────────────────────────────────────
  const seller = users[0];
  const now = new Date();

  const auctions = await Promise.all(
    SEED_AUCTIONS.map((a, i) =>
      prisma.auction.upsert({
        where: { id: `seed-auction-${i + 1}`.padEnd(36, '0') },
        update: {},
        create: {
          id:            `seed-auction-${String(i + 1).padStart(3, '0')}`.slice(0, 36),
          title:         a.title,
          description:   a.desc,
          sellerId:      seller.id,
          category:      a.category,
          startingPrice: a.price * 0.7,
          currentPrice:  a.price,
          reservePrice:  a.price * 0.8,
          imageUrls:     [`https://placehold.co/800x600?text=${encodeURIComponent(a.title)}`],
          status:        'ACTIVE',
          startsAt:      new Date(now.getTime() - 2 * 86400000),
          endsAt:        new Date(now.getTime() + (i % 3 + 1) * 86400000),
        },
      })
    )
  );

  console.log(`✅ Created ${auctions.length} auctions`);

  // ── Bids ──────────────────────────────────────────────────────────────────
  const bidders = users.slice(1);
  let bidCount = 0;

  for (const auction of auctions) {
    const numBids = Math.floor(Math.random() * 8) + 3;
    let price = auction.currentPrice * 0.85;

    for (let i = 0; i < numBids; i++) {
      const bidder = bidders[i % bidders.length];
      price = price * (1 + Math.random() * 0.05 + 0.01);

      await prisma.bid.create({
        data: {
          userId:    bidder.id,
          auctionId: auction.id,
          amount:    Math.round(price * 100) / 100,
          createdAt: new Date(now.getTime() - (numBids - i) * 3600000),
        },
      });
      bidCount++;
    }
  }

  console.log(`✅ Created ${bidCount} bids`);

  // ── Fraud flags (for admin dashboard demo) ────────────────────────────────
  const allBids = await prisma.bid.findMany({ take: 5 });
  for (const bid of allBids.slice(0, 3)) {
    await prisma.fraudFlag.upsert({
      where: { bidId: bid.id },
      update: {},
      create: {
        bidId:   bid.id,
        score:   0.75 + Math.random() * 0.2,
        signals: ['high_velocity', 'new_account'],
        reason:  'Anomalous bid pattern detected',
      },
    });
  }

  console.log('✅ Created 3 fraud flags for admin dashboard demo');
  console.log('\n🎉 Seed complete!');
  console.log('   Login with any: alice@example.com / bob@example.com / admin@auction.com');
  console.log('   Password: demo1234');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
