// apps/web/src/components/ai/DemandHeatmap.tsx
// Real-time category demand heatmap — shows sellers which categories are hot.
// Data comes from /demand/heatmap reading your real 10k+ bid records.

import { useQuery } from "@tanstack/react-query";

const AI_SERVICE = import.meta.env.VITE_AI_SERVICE_URL ?? "http://localhost:8000";

interface CategoryDemand {
  category: string;
  active_auctions: number;
  active_bidders: number;
  avg_bid_count: number;
  avg_price_trend_pct: number;
  supply_demand_ratio: number;
  heat_score: number;
  recommendation: string;
}

interface HeatmapData {
  categories: CategoryDemand[];
  hottest_category: string;
  most_undersupplied: string;
  generated_at: string;
}

const CATEGORY_ICONS: Record<string, string> = {
  watches: "⌚", cameras: "📷", art: "🎨",
  jewelry: "💎", electronics: "💻", other: "📦",
};

function HeatBar({ score }: { score: number }) {
  const pct = Math.round(score * 10);
  const color = score >= 7 ? "bg-red-500" : score >= 4 ? "bg-amber-500" : "bg-teal-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium tabular-nums w-6 text-right">{score.toFixed(1)}</span>
    </div>
  );
}

export function DemandHeatmap() {
  const { data, isLoading } = useQuery<HeatmapData>({
    queryKey: ["demand-heatmap"],
    queryFn: () => fetch(`${AI_SERVICE}/demand/heatmap`).then(r => r.json()),
    staleTime: 5 * 60_000, // refresh every 5 min
    refetchInterval: 5 * 60_000,
  });

  if (isLoading) {
    return (
      <div className="rounded-xl border border-neutral-200 p-6 animate-pulse">
        <div className="h-4 bg-neutral-100 rounded w-1/3 mb-4" />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-12 bg-neutral-50 rounded-lg mb-2" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-medium text-sm">Market demand heatmap</h3>
          <p className="text-xs text-neutral-500 mt-0.5">Live from {data.categories.reduce((s,c)=>s+c.active_bidders,0)} active bidders</p>
        </div>
        <div className="flex gap-3 text-xs text-neutral-500">
          <span>🔥 {data.hottest_category}</span>
          <span>📈 {data.most_undersupplied} undersupplied</span>
        </div>
      </div>

      {/* Category list */}
      <div className="space-y-3">
        {data.categories.map(cat => (
          <div key={cat.category} className="flex items-center gap-3">
            <span className="text-xl w-7 flex-shrink-0 text-center">{CATEGORY_ICONS[cat.category] ?? "📦"}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm capitalize font-medium">{cat.category}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  cat.heat_score >= 7 ? "bg-red-50 text-red-700"
                  : cat.heat_score >= 4 ? "bg-amber-50 text-amber-700"
                  : "bg-teal-50 text-teal-700"
                }`}>
                  {cat.heat_score >= 7 ? "🔥 Hot" : cat.heat_score >= 4 ? "↗ Rising" : "✓ Stable"}
                </span>
              </div>
              <HeatBar score={cat.heat_score} />
              <div className="flex gap-3 mt-1 text-[11px] text-neutral-400">
                <span>{cat.active_auctions} listings</span>
                <span>{cat.active_bidders} bidders</span>
                <span>{cat.avg_bid_count.toFixed(1)} bids/lot</span>
                {cat.avg_price_trend_pct !== 0 && (
                  <span className={cat.avg_price_trend_pct > 0 ? "text-green-600" : "text-red-500"}>
                    {cat.avg_price_trend_pct > 0 ? "+" : ""}{cat.avg_price_trend_pct.toFixed(1)}% trend
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-neutral-100 text-xs text-neutral-400 text-center">
        Updated every 5 minutes from live bid data
      </div>
    </div>
  );
}
export default DemandHeatmap;
