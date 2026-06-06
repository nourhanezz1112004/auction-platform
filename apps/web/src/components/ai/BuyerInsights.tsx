// apps/web/src/pages/BuyerInsights.tsx
// Buyer analytics dashboard — win rate, spend history, propensity score,
// AI-recommended auctions, and favourite category breakdown.
// Calls /insights/buyer from the AI service with the user's real bid data.

import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";

const AI = import.meta.env.VITE_AI_SERVICE_URL ?? "http://localhost:8000";

interface BuyerData {
  total_bids: number;
  auctions_won: number;
  win_rate_pct: number;
  total_spend: number;
  avg_overpaid_pct: number;
  favourite_category: string;
  recommended_auctions: string[];
  propensity_score: number;
  narrative: string;
}

interface RecommendedAuction {
  id: string;
  title: string;
  currentPrice: number;
  endTime: string;
  imageUrls: string[];
  category: string;
  _count: { bids: number };
}

function StatCard({ label, value, sub, color = "text-neutral-900" }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="text-xs text-neutral-500 mb-1">{label}</div>
      <div className={`text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
      {sub && <div className="text-xs text-neutral-400 mt-1">{sub}</div>}
    </div>
  );
}

function PropensityMeter({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = score >= 0.7 ? "#16a34a" : score >= 0.4 ? "#d97706" : "#6b7280";
  const label = score >= 0.7 ? "High activity" : score >= 0.4 ? "Moderate" : "Low activity";
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="text-xs text-neutral-500 mb-3">Bid propensity (next 7 days)</div>
      <div className="flex items-center gap-3 mb-2">
        <div className="flex-1 h-2 bg-neutral-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, background: color }}
          />
        </div>
        <span className="text-sm font-semibold tabular-nums" style={{ color }}>
          {pct}%
        </span>
      </div>
      <div className="text-xs" style={{ color }}>{label}</div>
      <div className="text-xs text-neutral-400 mt-1">
        Likelihood of bidding based on your recent activity
      </div>
    </div>
  );
}

function timeLeft(endTime: string): string {
  const diff = new Date(endTime).getTime() - Date.now();
  if (diff <= 0) return "Ended";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return h > 24 ? `${Math.floor(h / 24)}d` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function BuyerInsights() {
  const { user } = useAuthStore();

  const { data: insights, isLoading: insightsLoading } = useQuery<BuyerData>({
    queryKey: ["buyer-insights", user?.id],
    queryFn: () =>
      fetch(`${AI}/insights/buyer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buyer_id: user!.id, period_days: 90 }),
      }).then(r => r.json()),
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
  });

  // Fetch details for recommended auctions
  const { data: recommended } = useQuery<RecommendedAuction[]>({
    queryKey: ["recommended-auctions", insights?.recommended_auctions],
    queryFn: async () => {
      if (!insights?.recommended_auctions?.length) return [];
      const results = await Promise.all(
        insights.recommended_auctions.slice(0, 4).map(id =>
          fetch(`${import.meta.env.VITE_API_URL ?? "http://localhost:3001"}/api/auctions/${id}`)
            .then(r => r.ok ? r.json() : null)
        )
      );
      return results.filter(Boolean);
    },
    enabled: !!insights?.recommended_auctions?.length,
  });

  if (insightsLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-neutral-100 rounded w-1/3" />
          <div className="grid grid-cols-3 gap-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 bg-neutral-100 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!insights) return null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold">Your bidding insights</h1>
        <p className="text-sm text-neutral-500 mt-1">Last 90 days of activity</p>
      </div>

      {/* AI narrative */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5 border-l-4 border-l-neutral-900">
        <div className="text-xs text-neutral-400 mb-2 flex items-center gap-1">
          <span>✦</span><span>AI summary</span>
        </div>
        <p className="text-sm text-neutral-700 leading-relaxed">{insights.narrative}</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard
          label="Auctions bid on"
          value={insights.total_bids.toLocaleString()}
        />
        <StatCard
          label="Won"
          value={insights.auctions_won.toLocaleString()}
          sub={`${insights.win_rate_pct}% win rate`}
          color={insights.win_rate_pct >= 30 ? "text-green-700" : "text-neutral-900"}
        />
        <StatCard
          label="Total spend"
          value={`$${insights.total_spend.toLocaleString()}`}
        />
        <StatCard
          label="Avg vs reserve"
          value={`${insights.avg_overpaid_pct > 0 ? "+" : ""}${insights.avg_overpaid_pct}%`}
          sub="above reserve when winning"
          color={insights.avg_overpaid_pct > 20 ? "text-amber-700" : "text-neutral-900"}
        />
        <StatCard
          label="Favourite category"
          value={insights.favourite_category}
          color="text-neutral-900"
        />
      </div>

      {/* Propensity meter */}
      <PropensityMeter score={insights.propensity_score} />

      {/* Recommended auctions */}
      {recommended && recommended.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-medium">Recommended for you</h2>
            <span className="text-xs text-neutral-400 flex items-center gap-1">
              <span>✦</span>AI picks in {insights.favourite_category}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {recommended.map(auction => (
              <Link
                key={auction.id}
                to={`/auctions/${auction.id}`}
                className="flex gap-3 rounded-xl border border-neutral-200 bg-white p-3 hover:border-neutral-400 transition-colors"
              >
                {/* Thumbnail */}
                <div className="w-14 h-14 rounded-lg bg-neutral-100 overflow-hidden flex-shrink-0">
                  {auction.imageUrls?.[0] ? (
                    <img src={auction.imageUrls[0]} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xl text-neutral-300">📦</div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{auction.title}</div>
                  <div className="text-xs text-neutral-500 mt-0.5 capitalize">{auction.category}</div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-sm font-semibold">${auction.currentPrice.toLocaleString()}</span>
                    <span className="text-xs text-neutral-400">{timeLeft(auction.endTime)}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Win rate context */}
      <div className="rounded-xl bg-neutral-50 border border-neutral-200 p-4">
        <h3 className="text-sm font-medium mb-2">How to improve your win rate</h3>
        <ul className="space-y-1.5">
          {insights.win_rate_pct < 20 && (
            <li className="text-xs text-neutral-600 flex gap-2">
              <span>→</span>
              <span>Try the AI autobidder with a sniper strategy — it places your bid in the final 30 seconds to avoid counter-bids.</span>
            </li>
          )}
          {insights.avg_overpaid_pct > 25 && (
            <li className="text-xs text-neutral-600 flex gap-2">
              <span>→</span>
              <span>You tend to pay well above reserve. Use the "value" autobidder strategy to only bid below predicted fair market value.</span>
            </li>
          )}
          <li className="text-xs text-neutral-600 flex gap-2">
            <span>→</span>
            <span>Watch auctions in your favourite category ({insights.favourite_category}) — you know the market best there.</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

export default BuyerInsights;
