// backend/src/services/vectorRecommendations.ts
// pgvector cosine-similarity recommendations.
// Requires: pgvector extension enabled + vector column on Auction table.
//
// PRISMA SCHEMA ADDITION (add to Auction model):
//   embedding  Unsupported("vector(4)")?
//
// SQL MIGRATION (add to a new migration file):
//   CREATE EXTENSION IF NOT EXISTS vector;
//   ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS embedding vector(4);
//   CREATE INDEX ON "Auction" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10);
//
// To populate embeddings, call seedEmbeddings() or have the AI service write them
// via the /embed endpoint after each listing is created.

import { prisma } from "../lib/prisma";

export interface SimilarItem {
  id: string;
  title: string;
  category: string;
  currentPrice: number;
  similarity: number;
}

/**
 * Returns the top-k most similar auctions to the given auctionId
 * using cosine similarity on the stored embedding vectors.
 */
export async function getSimilarItems(
  auctionId: string,
  topK = 6
): Promise<SimilarItem[]> {
  // 1. Fetch the query item's embedding
  const rows = await prisma.$queryRaw<Array<{ embedding: string | null }>>`
    SELECT embedding::text FROM "Auction" WHERE id = ${auctionId} LIMIT 1
  `;

  if (!rows[0]?.embedding) {
    // Fallback: category-based recommendations when no embedding exists
    return getCategoryFallback(auctionId, topK);
  }

  const embeddingStr = rows[0].embedding;

  // 2. Cosine similarity search using pgvector <=> operator (lower = more similar)
  const results = await prisma.$queryRaw<Array<{
    id: string;
    title: string;
    category: string;
    currentPrice: number;
    similarity: number;
  }>>`
    SELECT
      id,
      title,
      category,
      "currentPrice",
      1 - (embedding <=> ${embeddingStr}::vector) AS similarity
    FROM "Auction"
    WHERE
      id != ${auctionId}
      AND status IN ('ACTIVE', 'SCHEDULED')
      AND embedding IS NOT NULL
    ORDER BY embedding <=> ${embeddingStr}::vector
    LIMIT ${topK}
  `;

  return results.map((r) => ({
    ...r,
    similarity: Number(r.similarity.toFixed(4)),
  }));
}

/**
 * Fallback: simple category + price range match when embeddings aren't populated.
 */
async function getCategoryFallback(
  auctionId: string,
  topK: number
): Promise<SimilarItem[]> {
  const source = await prisma.auction.findUnique({
    where: { id: auctionId },
    select: { category: true, currentPrice: true },
  });

  if (!source) return [];

  const priceMin = source.currentPrice * 0.4;
  const priceMax = source.currentPrice * 2.5;

  const items = await prisma.auction.findMany({
    where: {
      id: { not: auctionId },
      category: source.category,
      status: { in: ["ACTIVE", "SCHEDULED"] },
      currentPrice: { gte: priceMin, lte: priceMax },
    },
    take: topK,
    orderBy: { currentPrice: "asc" },
    select: { id: true, title: true, category: true, currentPrice: true },
  });

  return items.map((i) => ({ ...i, similarity: 0 }));
}

/**
 * Writes a 4-dimensional embedding vector for an auction.
 * Called after a listing is created or updated.
 * Vector = [categoryEnc, conditionEnc, normalizedPrice, normalizedDuration]
 */
export async function upsertEmbedding(auctionId: string): Promise<void> {
  const CATEGORIES = ["watches","cameras","art","jewelry","electronics","other"];
  const CONDITIONS = ["poor","fair","good","very good","excellent","mint"];

  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    select: { category: true, condition: true, reservePrice: true, startingPrice: true },
  });
  if (!auction) return;

  const catIdx = CATEGORIES.indexOf(auction.category?.toLowerCase() ?? "") / 5;
  const condIdx = CONDITIONS.indexOf(auction.condition?.toLowerCase() ?? "") / 5;
  const normPrice = Math.min(auction.reservePrice / 10000, 1);
  const normStart = Math.min(auction.startingPrice / 10000, 1);

  const vec = `[${catIdx.toFixed(4)},${condIdx.toFixed(4)},${normPrice.toFixed(4)},${normStart.toFixed(4)}]`;

  await prisma.$executeRaw`
    UPDATE "Auction"
    SET embedding = ${vec}::vector
    WHERE id = ${auctionId}
  `;
}
