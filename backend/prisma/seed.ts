import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const USERS = [
  {
    email: 'admin@auction.test',
    name: 'Sarah Mitchell',
    abGroup: 'a',
    isAdmin: true,
    avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&h=150&fit=crop&crop=face',
    bio: 'Platform administrator and vintage collector.',
  },
  {
    email: 'james@auction.test',
    name: 'James Thornton',
    abGroup: 'a',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face',
    bio: 'Watch enthusiast and horologist. Collecting since 1998.',
  },
  {
    email: 'priya@auction.test',
    name: 'Priya Sharma',
    abGroup: 'b',
    avatarUrl: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&h=150&fit=crop&crop=face',
    bio: 'Fine art dealer and collector based in London.',
  },
  {
    email: 'marco@auction.test',
    name: 'Marco Rossi',
    abGroup: 'a',
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&h=150&fit=crop&crop=face',
    bio: 'Vintage camera collector and photography professor.',
  },
  {
    email: 'yuki@auction.test',
    name: 'Yuki Tanaka',
    abGroup: 'b',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop&crop=face',
    bio: 'Jewellery designer and estate sale specialist.',
  },
  {
    email: 'alex@auction.test',
    name: 'Alex Rivera',
    abGroup: 'a',
    avatarUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&h=150&fit=crop&crop=face',
    bio: 'Tech entrepreneur and electronics collector.',
  },
  {
    email: 'nina@auction.test',
    name: 'Nina Volkova',
    abGroup: 'b',
    avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&h=150&fit=crop&crop=face',
    bio: 'Contemporary art curator and collector.',
  },
  {
    email: 'omar@auction.test',
    name: 'Omar Khalil',
    abGroup: 'a',
    avatarUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&h=150&fit=crop&crop=face',
    bio: 'Antique dealer with 20 years of experience.',
  },
  {
    email: 'sofia@auction.test',
    name: 'Sofia Andersen',
    abGroup: 'b',
    avatarUrl: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=150&h=150&fit=crop&crop=face',
    bio: 'Scandinavian design enthusiast and buyer.',
  },
  {
    email: 'luca@auction.test',
    name: 'Luca Bianchi',
    abGroup: 'b',
    avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face',
    bio: 'Italian watch dealer and vintage specialist.',
  },
]

const AUCTIONS = [
  // ── Watches ─────────────────────────────────────────────────────────
  {
    title: 'Rolex Submariner Date Ref. 126610LN',
    category: 'watches',
    startingPrice: 8500,
    currentPrice: 11200,
    reservePrice: 9000,
    description: 'Unworn 2022 Rolex Submariner Date in Oystersteel with black cerachrom bezel. Complete set including original box, papers, warranty card, and hang tags. Reference 126610LN. A true grail watch in perfect condition.',
    imageUrls: [
      'https://images.unsplash.com/photo-1547996160-81dfa63595aa?w=800&h=600&fit=crop',
      'https://images.unsplash.com/photo-1523170335258-f5ed11844a49?w=800&h=600&fit=crop',
    ],
    status: 'ACTIVE',
    daysFromNow: 2,
  },
  {
    title: 'Omega Speedmaster Professional Moonwatch',
    category: 'watches',
    startingPrice: 4200,
    currentPrice: 5800,
    reservePrice: 4500,
    description: 'Omega Speedmaster Professional ref. 310.30.42.50.01.001, the watch worn on the moon. Full set with Hesalite crystal, calibre 1861 movement, and all original accessories including both straps.',
    imageUrls: [
      'https://images.unsplash.com/photo-1548171915-e79a380a2a4b?w=800&h=600&fit=crop',
      'https://images.unsplash.com/photo-1609587312208-cea54be969e7?w=800&h=600&fit=crop',
    ],
    status: 'ACTIVE',
    daysFromNow: 3,
  },
  {
    title: 'Seiko 6105 "Captain Willard" Diver 1972',
    category: 'watches',
    startingPrice: 1400,
    currentPrice: 2100,
    reservePrice: 1600,
    description: 'Legendary vintage Seiko 6105-8110, the watch worn by Martin Sheen in Apocalypse Now. All original including cushion case, crown-protecting crown guard, original bracelet, and iconic dial. Serviced 2023.',
    imageUrls: [
      'https://images.unsplash.com/photo-1587836374828-4dbafa94cf0e?w=800&h=600&fit=crop',
    ],
    status: 'ACTIVE',
    daysFromNow: 1,
  },
  {
    title: 'IWC Portugieser Chronograph IW371601',
    category: 'watches',
    startingPrice: 6500,
    currentPrice: 8400,
    reservePrice: 7000,
    description: 'IWC Portugieser Chronograph with silver dial and brown leather strap. Calibre 79350, 42mm case. Full set with box and papers. An icon of Swiss watchmaking at its finest.',
    imageUrls: [
      'https://images.unsplash.com/photo-1614164185128-e4ec99c436d7?w=800&h=600&fit=crop',
    ],
    status: 'ACTIVE',
    daysFromNow: 4,
  },
  {
    title: 'Patek Philippe Calatrava Ref. 5119G',
    category: 'watches',
    startingPrice: 18000,
    currentPrice: 22500,
    reservePrice: 20000,
    description: 'Patek Philippe Calatrava ref. 5119G in 18ct white gold. Ultra-thin automatic movement, silver dial, blue hands. Box and papers from 2019. The purest expression of dress watch design.',
    imageUrls: [
      'https://images.unsplash.com/photo-1585123334904-845d60e97b29?w=800&h=600&fit=crop',
    ],
    status: 'ACTIVE',
    daysFromNow: 5,
  },

  // ── Cameras ─────────────────────────────────────────────────────────
  {
    title: 'Leica M6 TTL Silver Chrome 0.85',
    category: 'cameras',
    startingPrice: 2800,
    currentPrice: 3650,
    reservePrice: 3000,
    description: 'Leica M6 TTL 0.85 viewfinder in silver chrome finish. One of the most coveted film rangefinders ever made. Original box, manual, strap lug covers. Glass immaculate, shutter curtains perfect.',
    imageUrls: [
      'https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=800&h=600&fit=crop',
      'https://images.unsplash.com/photo-1495121605193-b116b5b9c5fe?w=800&h=600&fit=crop',
    ],
    status: 'ACTIVE',
    daysFromNow: 2,
  },
  {
    title: 'Hasselblad 500CM + 80mm Planar T*',
    category: 'cameras',
    startingPrice: 1800,
    currentPrice: 2400,
    reservePrice: 2000,
    description: 'Hasselblad 500CM medium format camera with Carl Zeiss 80mm f/2.8 Planar T* lens and A12 film back. Used by NASA for moon landings. Everything works perfectly. A photographer\'s holy grail.',
    imageUrls: [
      'https://images.unsplash.com/photo-1584535793254-44ef8b47e4a2?w=800&h=600&fit=crop',
    ],
    status: 'ACTIVE',
    daysFromNow: 3,
  },
  {
    title: 'Nikon F3 HP Professional SLR',
    category: 'cameras',
    startingPrice: 380,
    currentPrice: 520,
    reservePrice: 420,
    description: 'Nikon F3 HP (High Eyepoint) with DE-3 finder. Light seals replaced, shutter speeds accurate. Used by photojournalists worldwide. Comes with 50mm f/1.4 Nikkor lens.',
    imageUrls: [
      'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800&h=600&fit=crop',
    ],
    status: 'ACTIVE',
    daysFromNow: 1,
  },
  {
    title: 'Canon F-1 Original + Motor Drive MF',
    category: 'cameras',
    startingPrice: 450,
    currentPrice: 680,
    reservePrice: 500,
    description: 'Canon F-1 original (1971) with Motor Drive MF. The professional workhorse of the 1970s Olympics. Complete kit with FD 50mm f/1.4 lens. All mechanical, no batteries needed.',
    imageUrls: [
      'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=800&h=600&fit=crop',
    ],
    status: 'ACTIVE',
    daysFromNow: 6,
  },

  // ── Art ──────────────────────────────────────────────────────────────
  {
    title: 'Banksy "Balloon Girl" Authenticated Print',
    category: 'art',
    startingPrice: 4500,
    currentPrice: 6800,
    reservePrice: 5000,
    description: 'Banksy "Balloon Girl" screen print on 350gsm archival paper. Hand-finished with spray paint stencil elements. Pest Control certificate of authenticity included. Edition of 150.',
    imageUrls: [
      'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?w=800&h=600&fit=crop',
      'https://images.unsplash.com/photo-1561214115-f2f134cc4912?w=800&h=600&fit=crop',
    ],
    status: 'ACTIVE',
    daysFromNow: 4,
  },
  {
    title: 'Jean-Michel Basquiat Lithograph No. 47/250',
    category: 'art',
    startingPrice: 5000,
    currentPrice: 7200,
    reservePrice: 5500,
    description: 'Rare Jean-Michel Basquiat limited edition lithograph, numbered 47 of 250. Published by Galerie Bruno Bischofberger, Zurich. Full provenance documented. Museum quality framing.',
    imageUrls: [
      'https://images.unsplash.com/photo-1547826039-bfc35e0f1ea8?w=800&h=600&fit=crop',
    ],
    status: 'ACTIVE',
    daysFromNow: 2,
  },
  {
    title: 'Large Abstract Oil on Canvas — "Emergence"',
    category: 'art',
    startingPrice: 1200,
    currentPrice: 1850,
    reservePrice: 1400,
    description: 'Large format contemporary abstract oil painting, 150x120cm. Bold gestural marks in ultramarine, burnt sienna, and gold leaf. Signed and dated 2024 by emerging London artist. Gallery framed.',
    imageUrls: [
      'https://images.unsplash.com/photo-1541512416146-3cf58d6b27cc?w=800&h=600&fit=crop',
    ],
    status: 'ACTIVE',
    daysFromNow: 5,
  },

  // ── Electronics ──────────────────────────────────────────────────────
  {
    title: 'Apple MacBook Pro M3 Pro 14" — 18GB',
    category: 'electronics',
    startingPrice: 1500,
    currentPrice: 1950,
    reservePrice: 1700,
    description: 'Apple MacBook Pro 14" with M3 Pro chip, 18GB unified memory, 512GB SSD in Space Black. AppleCare+ coverage until March 2026. Purchased new January 2024. Immaculate condition.',
    imageUrls: [
      'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800&h=600&fit=crop',
      'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=800&h=600&fit=crop',
    ],
    status: 'ACTIVE',
    daysFromNow: 3,
  },
  {
    title: 'Sony WH-1000XM5 Wireless Headphones',
    category: 'electronics',
    startingPrice: 220,
    currentPrice: 310,
    reservePrice: 250,
    description: 'Sony WH-1000XM5 in Midnight Black. Best-in-class noise cancellation. Used less than 10 hours. All original accessories: carry case, cables, adapters, ear cushions.',
    imageUrls: [
      'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&h=600&fit=crop',
    ],
    status: 'ACTIVE',
    daysFromNow: 1,
  },
  {
    title: 'DJI Mini 4 Pro Fly More Combo',
    category: 'electronics',
    startingPrice: 680,
    currentPrice: 850,
    reservePrice: 750,
    description: 'DJI Mini 4 Pro with Fly More Combo Plus. Under 15 flights total. Includes 3 batteries, charging hub, ND filters, shoulder bag. 4K/60fps video. Under 249g — no license required.',
    imageUrls: [
      'https://images.unsplash.com/photo-1473968512647-3e447244af8f?w=800&h=600&fit=crop',
    ],
    status: 'ACTIVE',
    daysFromNow: 2,
  },

  // ── Jewellery ────────────────────────────────────────────────────────
  {
    title: 'Art Deco Diamond Ring — 1.2ct GIA Certified',
    category: 'jewellery',
    startingPrice: 3500,
    currentPrice: 4800,
    reservePrice: 4000,
    description: 'Stunning Art Deco platinum ring with 1.2ct old European cut diamond (GIA cert: G/VS1). Milgrain detailing with old mine cut side stones. Circa 1925. Finger size 6.5, resizing available.',
    imageUrls: [
      'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=800&h=600&fit=crop',
      'https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=800&h=600&fit=crop',
    ],
    status: 'ACTIVE',
    daysFromNow: 3,
  },
  {
    title: 'Cartier Love Bracelet 18ct Yellow Gold',
    category: 'jewellery',
    startingPrice: 5500,
    currentPrice: 7200,
    reservePrice: 6000,
    description: 'Authentic Cartier Love bracelet in 18ct yellow gold, size 17. Purchased from Cartier Bond Street 2021. Includes original box, certificate, and screwdriver. Receipt available on request.',
    imageUrls: [
      'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=800&h=600&fit=crop',
    ],
    status: 'ACTIVE',
    daysFromNow: 4,
  },
  {
    title: 'Victorian 18ct Gold Locket — Circa 1880',
    category: 'jewellery',
    startingPrice: 580,
    currentPrice: 780,
    reservePrice: 650,
    description: 'Exquisite Victorian 18ct gold locket with hand-engraved floral decoration. Interior holds two portrait miniatures. Original gold trace chain included. Excellent condition for age. Hallmarked Birmingham 1882.',
    imageUrls: [
      'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=800&h=600&fit=crop',
    ],
    status: 'ACTIVE',
    daysFromNow: 2,
  },

  // ── Ended auctions (for demo — winners set) ──────────────────────────
  {
    title: 'Leica M3 Double Stroke — 1954',
    category: 'cameras',
    startingPrice: 1200,
    currentPrice: 2800,
    reservePrice: 1500,
    description: 'Rare first-year Leica M3 double stroke with original 50mm Summicron. Serial number 700XXX. Complete CLA performed 2024. The camera that defined rangefinder photography.',
    imageUrls: [
      'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&h=600&fit=crop',
    ],
    status: 'ENDED',
    daysFromNow: -3,
  },
  {
    title: 'Rolex Datejust 36 — Jubilee Dial 2021',
    category: 'watches',
    startingPrice: 6000,
    currentPrice: 8500,
    reservePrice: 6500,
    description: 'Rolex Datejust 36 ref. 126234 with green Jubilee dial and Jubilee bracelet. Full set, unworn. One of the most elegant references in the current collection.',
    imageUrls: [
      'https://images.unsplash.com/photo-1587836374828-4dbafa94cf0e?w=800&h=600&fit=crop',
    ],
    status: 'ENDED',
    daysFromNow: -5,
  },
]

async function main() {
  console.log('🌱  Starting seed…\n')

  await prisma.fraudFlag.deleteMany()
  await prisma.bid.deleteMany()
  await prisma.notification.deleteMany()
  await prisma.watchlistItem.deleteMany()
  await prisma.review.deleteMany()
  await prisma.payment.deleteMany()
  await prisma.auction.deleteMany()
  await prisma.botBlock.deleteMany()
  await prisma.user.deleteMany()

  console.log('🗑  Cleared existing data\n')

  // ── Users ──────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('demo1234', 10)

  const createdUsers = await Promise.all(
    USERS.map((u) =>
      prisma.user.create({
        data: {
          email: u.email,
          password: passwordHash,
          name: u.name,
          abGroup: u.abGroup,
          isAdmin: u.isAdmin ?? false,
          avatarUrl: u.avatarUrl,
          bio: u.bio,
          rating: parseFloat((3.5 + Math.random() * 1.5).toFixed(1)),
        },
      })
    )
  )

  console.log(`✅  Created ${createdUsers.length} users`)
  createdUsers.forEach((u) => console.log(`    ${u.email}`))

  const admin = createdUsers[0]
  const sellers = createdUsers.slice(1, 5)
  const bidders = createdUsers.slice(1)

  // ── Auctions ───────────────────────────────────────────────────────
  const now = new Date()

  const createdAuctions = await Promise.all(
    AUCTIONS.map((a, i) => {
      const seller = sellers[i % sellers.length]
      const endsAt = new Date(now.getTime() + a.daysFromNow * 86400000)
      const startsAt = new Date(now.getTime() - 2 * 86400000)

      return prisma.auction.create({
        data: {
          title: a.title,
          description: a.description,
          sellerId: seller.id,
          category: a.category,
          startingPrice: a.startingPrice,
          currentPrice: a.currentPrice,
          reservePrice: a.reservePrice,
          imageUrls: a.imageUrls,
          status: a.status as 'ACTIVE' | 'ENDED',
          startsAt,
          endsAt,
        },
      })
    })
  )

  console.log(`\n✅  Created ${createdAuctions.length} auctions`)

  // ── Bids ───────────────────────────────────────────────────────────
  let totalBids = 0

  for (const auction of createdAuctions) {
    const numBids = Math.floor(Math.random() * 12) + 5
    let price = auction.startingPrice

    const shuffledBidders = [...bidders]
      .filter((b) => b.id !== auction.sellerId)
      .sort(() => Math.random() - 0.5)

    let topBidAmount = price;

    for (let i = 0; i < numBids; i++) {
      const bidder = shuffledBidders[i % shuffledBidders.length]
      price = price * (1 + Math.random() * 0.08 + 0.02)
      const bidAmount = Math.round(price * 100) / 100
      topBidAmount = bidAmount

      await prisma.bid.create({
        data: {
          userId: bidder.id,
          auctionId: auction.id,
          amount: bidAmount,
          createdAt: new Date(
            now.getTime() - (numBids - i) * 3600000 * (Math.random() + 0.5)
          ),
        },
      })
      totalBids++
    }

    // Set winner for ended auctions or update currentPrice for active auctions
    if (auction.status === 'ENDED') {
      const topBid = await prisma.bid.findFirst({
        where: { auctionId: auction.id },
        orderBy: { amount: 'desc' },
      })

      if (topBid) {
        await prisma.auction.update({
          where: { id: auction.id },
          data: {
            winnerId: topBid.userId,
            currentPrice: topBid.amount,
          },
        })
      }
    } else {
      // Active auctions: synchronize currentPrice with the highest seeded bid
      await prisma.auction.update({
        where: { id: auction.id },
        data: {
          currentPrice: topBidAmount,
        },
      })
    }
  }

  console.log(`✅  Created ${totalBids} bids`)

  // ── Fraud flags ─────────────────────────────────────────────────────
  const recentBids = await prisma.bid.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
  })

  const fraudSignalSets = [
    ['high_velocity', 'new_account', 'suspicious_ip'],
    ['price_spike', 'bid_pattern_anomaly'],
    ['high_velocity', 'multiple_accounts'],
    ['new_account', 'geographic_anomaly'],
    ['price_spike', 'high_velocity', 'new_account'],
  ]

  for (let i = 0; i < Math.min(4, recentBids.length); i++) {
    const bid = recentBids[i]
    const existing = await prisma.fraudFlag.findUnique({ where: { bidId: bid.id } })
    if (!existing) {
      await prisma.fraudFlag.create({
        data: {
          bidId: bid.id,
          score: parseFloat((0.72 + Math.random() * 0.24).toFixed(2)),
          signals: fraudSignalSets[i % fraudSignalSets.length],
          reason: 'Anomalous bidding pattern detected by Isolation Forest',
          status: i === 0 ? 'pending' : i === 1 ? 'review' : 'pending',
        },
      })
    }
  }

  console.log('✅  Created fraud flags')

  // ── Notifications ───────────────────────────────────────────────────
  const notifAuction = createdAuctions[0]
  const notificationsToCreate = createdUsers.flatMap((u) => [
    {
      userId: u.id,
      auctionId: notifAuction.id,
      type: 'outbid' as const,
      title: 'You have been outbid',
      message: `Someone placed a higher bid on "${notifAuction.title}". Bid now to stay in the lead.`,
      read: false,
    },
    {
      userId: u.id,
      auctionId: createdAuctions[createdAuctions.length - 1].id,
      type: 'won' as const,
      title: 'Congratulations — you won!',
      message: `You won the auction for "${createdAuctions[createdAuctions.length - 1].title}".`,
      read: false,
    },
    {
      userId: u.id,
      type: 'info' as const,
      title: 'Welcome to BidSpace',
      message: 'Your account is ready. Start bidding on rare items from around the world.',
      read: true,
    },
  ])

  await prisma.notification.createMany({
    data: notificationsToCreate,
  })

  console.log('✅  Created notifications')

  // ── Watchlist entries ───────────────────────────────────────────────
  await prisma.watchlistItem.createMany({
    data: [
      { userId: createdUsers[1].id, auctionId: createdAuctions[0].id },
      { userId: createdUsers[1].id, auctionId: createdAuctions[5].id },
      { userId: createdUsers[2].id, auctionId: createdAuctions[9].id },
      { userId: createdUsers[3].id, auctionId: createdAuctions[1].id },
    ],
  })

  console.log('✅  Created watchlist entries')

  // ── Reviews ─────────────────────────────────────────────────────────
  const endedAuctions = createdAuctions.filter((a) => a.status === 'ENDED')

  for (const auction of endedAuctions) {
    const winner = await prisma.auction.findUnique({
      where: { id: auction.id },
      select: { winnerId: true },
    })

    // Find a bidder who participated but is NOT the winner
    const reviewer = await prisma.bid.findFirst({
      where: {
        auctionId: auction.id,
        userId: { not: winner?.winnerId ?? undefined },
      },
      select: { userId: true },
    })

    if (reviewer?.userId) {
      const existing = await prisma.review.findFirst({
        where: { auctionId: auction.id, userId: reviewer.userId },
      })
      if (!existing) {
        await prisma.review.create({
          data: {
            auctionId: auction.id,
            userId: reviewer.userId,
            rating: Math.floor(Math.random() * 2) + 4,
            comment: [
              'Excellent communication from the seller, even though I lost the bid.',
              'Great item curation, hope to win next time!',
              'Professional seller. Highly active bidding war.',
            ][Math.floor(Math.random() * 3)],
          },
        })
      }
    }
  }

  console.log('✅  Created reviews')

  console.log('\n🎉  Seed complete!')
  console.log('\n📋  Login credentials (all passwords: demo1234):')
  console.log('    Admin:    admin@auction.test')
  createdUsers.slice(1).forEach((u) => console.log(`    User:     ${u.email}`))
  console.log('\n🖼   All auctions have real Unsplash images')
  console.log('👤  All users have real avatar photos')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())