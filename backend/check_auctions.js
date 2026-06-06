const { PrismaClient } = require('@prisma/client');
// Manually override for host-level check
process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/auction_db";
const prisma = new PrismaClient();
async function main() {
  try {
    const count = await prisma.auction.count({ where: { status: 'ACTIVE', deletedAt: null } });
    console.log('Active auctions:', count);
    const recommendations = await prisma.auction.findMany({
      where: { status: 'ACTIVE', deletedAt: null },
      take: 5
    });
    console.log('Sample auctions:', recommendations.map(a => a.title));
  } catch (e) {
    console.error(e);
  }
}
main().finally(() => prisma.$disconnect());
