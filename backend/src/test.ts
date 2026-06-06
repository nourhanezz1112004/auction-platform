import { prisma } from './lib/prisma';
async function run() {
  const auctions = await prisma.auction.findMany({ where: { status: 'ENDED' } });
  console.log(JSON.stringify(auctions, null, 2));
}
run();
