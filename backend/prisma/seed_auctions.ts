import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const SELLER_ID = 'cbcd6465-428a-4ad4-a28b-dc171bc25184'

async function main() {
  console.log('Seeding 10 premium auctions...')

  const auctions = [
    {
      title: 'Vintage Rolex Submariner 5513',
      description: 'A classic 1970s Rolex Submariner in exceptional condition. Features a beautiful matte dial and original oyster bracelet.',
      startingPrice: 8500,
      category: 'Watches',
      imageUrls: ['https://images.unsplash.com/photo-1523170335258-f5ed11844a49?auto=format&fit=crop&q=80&w=1000'],
    },
    {
      title: 'Leica M6 TTL Rangefinder',
      description: 'Legendary 35mm film camera. Black chrome finish, 0.72x viewfinder. Includes original box and strap.',
      startingPrice: 3200,
      category: 'Cameras',
      imageUrls: ['https://images.unsplash.com/photo-1510127034890-ba27508e9f1c?auto=format&fit=crop&q=80&w=1000'],
    },
    {
      title: 'Abstract "Ethereal Blue" Oil on Canvas',
      description: 'Original large-scale abstract painting by contemporary artist. 48x60 inches. Certificate of authenticity included.',
      startingPrice: 1200,
      category: 'Art',
      imageUrls: ['https://images.unsplash.com/photo-1541963463532-d68292c34b19?auto=format&fit=crop&q=80&w=1000'],
    },
    {
      title: '3ct Diamond Platinum Engagement Ring',
      description: 'Stunning GIA-certified 3-carat round brilliant diamond set in a handcrafted platinum pavé band.',
      startingPrice: 15000,
      category: 'Jewellery',
      imageUrls: ['https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&q=80&w=1000'],
    },
    {
      title: 'Custom Liquid Cooled Gaming PC',
      description: 'RTX 4090, i9-14900K, 64GB DDR5. Custom hard-line liquid cooling loop with RGB management.',
      startingPrice: 4500,
      category: 'Electronics',
      imageUrls: ['https://images.unsplash.com/photo-1587202372775-e209217f23e7?auto=format&fit=crop&q=80&w=1000'],
    },
    {
      title: 'Omega Speedmaster Moonwatch Professional',
      description: 'The iconic "Moonwatch" with Hesalite crystal and Calibre 3861 manual-wind movement. Full set.',
      startingPrice: 5400,
      category: 'Watches',
      imageUrls: ['https://images.unsplash.com/photo-1614164185128-e4ec99c436d7?auto=format&fit=crop&q=80&w=1000'],
    },
    {
      title: 'Hasselblad 500C/M Medium Format',
      description: 'Vintage medium format camera with Carl Zeiss 80mm f/2.8 lens. Recent CLA performed.',
      startingPrice: 4100,
      category: 'Cameras',
      imageUrls: ['https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&q=80&w=1000'],
    },
    {
      title: '17th Century Style Portrait Study',
      description: 'Traditional oil portrait study on wood panel. Atmospheric lighting and rich textures.',
      startingPrice: 2800,
      category: 'Art',
      imageUrls: ['https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?auto=format&fit=crop&q=80&w=1000'],
    },
    {
      title: '18K Gold Emerald & Diamond Necklace',
      description: 'Natural Colombian emerald pendant surrounded by a halo of baguette diamonds on a gold chain.',
      startingPrice: 9000,
      category: 'Jewellery',
      imageUrls: ['https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&q=80&w=1000'],
    },
    {
      title: 'Apple Vision Pro - 512GB',
      description: 'Brand new, sealed in box. Apples spatial computing headset. Includes all original accessories.',
      startingPrice: 3400,
      category: 'Electronics',
      imageUrls: ['https://images.unsplash.com/photo-1707246594002-3932e65be009?auto=format&fit=crop&q=80&w=1000'],
    },
  ]

  for (const a of auctions) {
    const startsAt = new Date()
    const endsAt = new Date()
    endsAt.setDate(endsAt.getDate() + 7)

    await prisma.auction.create({
      data: {
        ...a,
        sellerId: SELLER_ID,
        status: 'ACTIVE',
        startsAt,
        endsAt,
        currentPrice: a.startingPrice,
        reservePrice: a.startingPrice * 0.9,
        version: 0,
      },
    })
  }

  console.log('Seeding complete!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
