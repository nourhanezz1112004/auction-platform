// backend/src/routes/analytics.ts
// GET /api/analytics/seller/:id — full seller performance stats + AI narrative
// Uses read replica when available (set DATABASE_URL_READONLY in .env)

import { Router, Request, Response } from "express";
import { prisma, prismaRead } from "../lib/prisma";
import { requireAuth } from "../middleware/requireAuth";
import Anthropic from "@anthropic-ai/sdk";

const router = Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

router.get("/seller/:id", requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { period = "30" } = req.query as { period?: string };
  const days = Math.min(parseInt(period), 365);
  const since = new Date(Date.now() - days * 86400_000);
  const db = prismaRead ?? prisma;

  const [auctionStats] = await db.$queryRaw<Array<{
    total_auctions: number; closed_auctions: number; total_gmv: number;
    avg_final_vs_reserve: number; avg_bid_count: number; reserve_met_rate: number;
  }>>`
    SELECT
      COUNT(*)::int AS total_auctions,
      COUNT(*) FILTER (WHERE status = 'CLOSED')::int AS closed_auctions,
      COALESCE(SUM(b.max_bid), 0) AS total_gmv,
      COALESCE(AVG(b.max_bid / NULLIF(a."reservePrice", 0)), 1) AS avg_final_vs_reserve,
      COALESCE(AVG(b.bid_count), 0) AS avg_bid_count,
      COALESCE(COUNT(*) FILTER (WHERE b.max_bid >= a."reservePrice")::float /
        NULLIF(COUNT(*) FILTER (WHERE status = 'CLOSED'), 0), 0) AS reserve_met_rate
    FROM "Auction" a
    LEFT JOIN LATERAL (
      SELECT MAX(amount) AS max_bid, COUNT(*)::int AS bid_count
      FROM "Bid" WHERE "auctionId" = a.id
    ) b ON true
    WHERE a."sellerId" = ${id} AND a."createdAt" >= ${since}
  `;

  const dayStats = await db.$queryRaw<Array<{ dow: number; avg_final_price: number; auction_count: number }>>`
    SELECT EXTRACT(DOW FROM a."endTime")::int AS dow, AVG(b.max_bid) AS avg_final_price, COUNT(*)::int AS auction_count
    FROM "Auction" a
    LEFT JOIN LATERAL (SELECT MAX(amount) AS max_bid FROM "Bid" WHERE "auctionId" = a.id) b ON true
    WHERE a."sellerId" = ${id} AND a.status = 'CLOSED' AND a."createdAt" >= ${since}
    GROUP BY EXTRACT(DOW FROM a."endTime") ORDER BY avg_final_price DESC LIMIT 3
  `;

  const [hourStats] = await db.$queryRaw<Array<{ best_hour: number; avg_final_price: number }>>`
    SELECT EXTRACT(HOUR FROM a."endTime")::int AS best_hour, AVG(b.max_bid) AS avg_final_price
    FROM "Auction" a
    LEFT JOIN LATERAL (SELECT MAX(amount) AS max_bid FROM "Bid" WHERE "auctionId" = a.id) b ON true
    WHERE a."sellerId" = ${id} AND a.status = 'CLOSED' AND a."createdAt" >= ${since}
    GROUP BY EXTRACT(HOUR FROM a."endTime") ORDER BY avg_final_price DESC LIMIT 1
  `;

  const categoryStats = await db.$queryRaw<Array<{
    category: string; auction_count: number; avg_final_price: number; avg_vs_reserve: number;
  }>>`
    SELECT a.category, COUNT(*)::int AS auction_count,
      COALESCE(AVG(b.max_bid), 0) AS avg_final_price,
      COALESCE(AVG(b.max_bid / NULLIF(a."reservePrice", 0)), 1) AS avg_vs_reserve
    FROM "Auction" a
    LEFT JOIN LATERAL (SELECT MAX(amount) AS max_bid FROM "Bid" WHERE "auctionId" = a.id) b ON true
    WHERE a."sellerId" = ${id} AND a."createdAt" >= ${since}
    GROUP BY a.category ORDER BY avg_final_price DESC
  `;

  const weeklyTrend = await db.$queryRaw<Array<{ week: string; gmv: number; auction_count: number }>>`
    SELECT TO_CHAR(DATE_TRUNC('week', a."endTime"), 'YYYY-MM-DD') AS week,
      COALESCE(SUM(b.max_bid), 0) AS gmv, COUNT(*)::int AS auction_count
    FROM "Auction" a
    LEFT JOIN LATERAL (SELECT MAX(amount) AS max_bid FROM "Bid" WHERE "auctionId" = a.id) b ON true
    WHERE a."sellerId" = ${id} AND a.status = 'CLOSED' AND a."endTime" >= ${since}
    GROUP BY DATE_TRUNC('week', a."endTime") ORDER BY week ASC
  `;

  const DOW = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const bestDow = dayStats[0] ? DOW[dayStats[0].dow] : "N/A";
  const bestHour = hourStats ? `${hourStats.best_hour}:00` : "N/A";
  const topCategory = categoryStats[0]?.category ?? "N/A";
  const vsReservePct = Math.round(((auctionStats.avg_final_vs_reserve ?? 1) - 1) * 100);
  const reserveMetPct = Math.round((auctionStats.reserve_met_rate ?? 0) * 100);

  let narrative = `Your auctions closed ${vsReservePct > 0 ? "+" : ""}${vsReservePct}% vs reserve over the last ${days} days, with ${reserveMetPct}% meeting reserve. ${topCategory} is your strongest category — ${bestDow} at ${bestHour} delivers the best results.`;

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const msg = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 200,
        messages: [{
          role: "user",
          content: `Write a 2-sentence friendly seller performance digest using these stats:
Period: ${days} days | GMV: $${Math.round(auctionStats.total_gmv ?? 0).toLocaleString()} | Avg vs reserve: ${vsReservePct > 0 ? "+" : ""}${vsReservePct}% | Reserve met: ${reserveMetPct}% | Best day: ${bestDow} | Best hour: ${bestHour} | Top category: ${topCategory}. Be specific and data-driven. No markdown.`,
        }],
      });
      narrative = (msg.content[0] as { text: string }).text;
    } catch { /* use fallback */ }
  }

  return res.json({
    period_days: days,
    summary: {
      total_auctions: auctionStats.total_auctions,
      closed_auctions: auctionStats.closed_auctions,
      total_gmv: Math.round(auctionStats.total_gmv ?? 0),
      avg_final_vs_reserve_pct: vsReservePct,
      avg_bid_count: Math.round(auctionStats.avg_bid_count ?? 0),
      reserve_met_rate_pct: reserveMetPct,
    },
    best_times: {
      day: bestDow, hour: bestHour,
      top_days: dayStats.map((d) => ({ day: DOW[d.dow], avg_price: Math.round(d.avg_final_price), count: d.auction_count })),
    },
    categories: categoryStats.map((c) => ({
      category: c.category, count: c.auction_count,
      avg_price: Math.round(c.avg_final_price),
      vs_reserve_pct: Math.round((c.avg_vs_reserve - 1) * 100),
    })),
    weekly_trend: weeklyTrend.map((w) => ({ week: w.week, gmv: Math.round(w.gmv), count: w.auction_count })),
    narrative,
  });
});

export default router;
