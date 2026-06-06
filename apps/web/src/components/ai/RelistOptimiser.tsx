// apps/web/src/components/ai/RelistOptimiser.tsx
// Shows sellers exactly what to change when reserve isn't met.
// Reads from /relist/optimise which uses your real comparable sold data.

import { useQuery } from "@tanstack/react-query";

const AI = import.meta.env.VITE_AI_SERVICE_URL ?? "http://localhost:8000";

interface RelistData {
  auction_title: string;
  original_reserve: number;
  highest_bid: number;
  reserve_gap_pct: number;
  suggested_reserve: number;
  suggested_reserve_reasoning: string;
  best_day: string;
  best_hour_label: string;
  comparable_sold_avg: number | null;
  comparable_sold_count: number;
  photo_tip: string;
  title_tip: string;
  overall_tip: string;
  estimated_success_chance: string;
}

interface Props {
  auctionId: string;
  onRelist: (newReserve: number) => void;
}

export function RelistOptimiser({ auctionId, onRelist }: Props) {
  const { data, isLoading } = useQuery<RelistData>({
    queryKey: ["relist", auctionId],
    queryFn: () =>
      fetch(`${AI}/relist/optimise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auction_id: auctionId }),
      }).then(r => r.json()),
  });

  const chanceColor = {
    high:   "text-green-700 bg-green-50 border-green-200",
    medium: "text-amber-700 bg-amber-50 border-amber-200",
    low:    "text-red-700 bg-red-50 border-red-200",
  };

  if (isLoading) {
    return (
      <div className="rounded-xl border border-neutral-200 p-5 animate-pulse">
        <div className="h-4 bg-neutral-100 rounded w-1/2 mb-3" />
        <div className="h-3 bg-neutral-100 rounded w-3/4 mb-2" />
        <div className="h-3 bg-neutral-100 rounded w-2/3" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-medium text-sm">Relist recommendations</h3>
          <p className="text-xs text-neutral-500 mt-0.5">
            Based on {data.comparable_sold_count} comparable sales
          </p>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${chanceColor[data.estimated_success_chance as keyof typeof chanceColor]}`}>
          {data.estimated_success_chance === "high" ? "✓ High chance" :
           data.estimated_success_chance === "medium" ? "~ Medium chance" : "⚠ Low chance"} of selling
        </span>
      </div>

      {/* AI narrative */}
      <p className="text-sm text-neutral-700 leading-relaxed border-l-2 border-neutral-300 pl-3">
        {data.overall_tip}
      </p>

      {/* Price comparison */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-neutral-50 border border-neutral-200 p-3">
          <div className="text-xs text-neutral-500 mb-1">Original reserve</div>
          <div className="text-base font-semibold line-through text-neutral-400">
            ${data.original_reserve.toLocaleString()}
          </div>
        </div>
        <div className="rounded-lg bg-neutral-50 border border-neutral-200 p-3">
          <div className="text-xs text-neutral-500 mb-1">Highest bid</div>
          <div className="text-base font-semibold text-neutral-700">
            ${data.highest_bid.toLocaleString()}
          </div>
          <div className="text-[10px] text-red-500">{data.reserve_gap_pct.toFixed(0)}% gap</div>
        </div>
        <div className="rounded-lg bg-green-50 border border-green-200 p-3">
          <div className="text-xs text-green-700 mb-1">Suggested reserve</div>
          <div className="text-base font-semibold text-green-800">
            ${data.suggested_reserve.toLocaleString()}
          </div>
        </div>
      </div>

      {data.comparable_sold_avg && (
        <p className="text-xs text-neutral-500">
          Comparable {data.auction_title.split(" ")[0]} items avg: ${data.comparable_sold_avg.toLocaleString()} across {data.comparable_sold_count} sales
        </p>
      )}

      {/* Timing */}
      <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
        <div className="text-xs font-medium text-blue-800 mb-1">📅 Best time to close</div>
        <div className="text-sm text-blue-700">
          {data.best_day} at {data.best_hour_label}
        </div>
        <div className="text-xs text-blue-600 mt-0.5">{data.suggested_reserve_reasoning}</div>
      </div>

      {/* Tips */}
      <div className="space-y-2">
        <div className="flex gap-2 text-xs text-neutral-600">
          <span>📸</span><span>{data.photo_tip}</span>
        </div>
        <div className="flex gap-2 text-xs text-neutral-600">
          <span>✏️</span><span>{data.title_tip}</span>
        </div>
      </div>

      {/* CTA */}
      <button
        onClick={() => onRelist(data.suggested_reserve)}
        className="w-full rounded-xl bg-neutral-900 text-white py-3 text-sm font-medium hover:bg-neutral-700 transition-colors"
      >
        Relist at ${data.suggested_reserve.toLocaleString()} →
      </button>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// apps/web/src/hooks/usePersonalisedFeed.ts
// TanStack Query hook for the ranked personalised auction feed.
// Use this in your home/browse page instead of a plain listing fetch.
// ─────────────────────────────────────────────────────────────────────────────

// NOTE: copy the code below into apps/web/src/hooks/usePersonalisedFeed.ts

export const USE_PERSONALISED_FEED_CODE = `
import { useInfiniteQuery } from "@tanstack/react-query";

const AI = import.meta.env.VITE_AI_SERVICE_URL ?? "http://localhost:8000";

interface FeedItem {
  auction_id: string;
  title: string;
  category: string;
  condition: string;
  current_price: number;
  reserve_price: number;
  end_time: string;
  image_urls: string[];
  bid_count: number;
  relevance_score: number;
  reason: string;
}

interface FeedPage {
  items: FeedItem[];
  total: number;
  personalised: boolean;
}

export function usePersonalisedFeed(userId: string, limit = 20) {
  return useInfiniteQuery<FeedPage>({
    queryKey: ["feed", userId],
    queryFn: async ({ pageParam = [] }) => {
      const res = await fetch(\`\${AI}/feed/ranked\`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          limit,
          exclude_ids: pageParam,
        }),
      });
      return res.json();
    },
    getNextPageParam: (lastPage, allPages) => {
      const seenIds = allPages.flatMap(p => p.items.map(i => i.auction_id));
      return lastPage.items.length === limit ? seenIds : undefined;
    },
    initialPageParam: [],
    staleTime: 2 * 60_000,  // 2 min
    enabled: !!userId,
  });
}
`;
export default RelistOptimiser;
