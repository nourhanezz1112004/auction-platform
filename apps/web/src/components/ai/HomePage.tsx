// apps/web/src/pages/HomePage.tsx
// Updated home page integrating all AI features:
// - SemanticSearch in header
// - Personalised ranked feed (infinite scroll)
// - DemandHeatmap in sidebar
// - Reason badges ("Matches your watch interests")
// Replace your existing home/browse page with this.

import { useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { usePersonalisedFeed, type FeedItem } from "../../hooks/usePersonalisedFeed";
import { SemanticSearch } from "./SemanticSearch";
import { DemandHeatmap } from "./DemandHeatmap";
import { useAuthStore } from "@/store/authStore";

// ── Countdown timer ───────────────────────────────────────────────
function timeLeft(endTime: string): string {
  const diff = new Date(endTime).getTime() - Date.now();
  if (diff <= 0) return "Ended";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1_000);
  if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0)  return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

// ── Auction card ──────────────────────────────────────────────────
function AuctionCard({ item }: { item: FeedItem }) {
  const isHot = item.bid_count >= 10;
  const isEnding = new Date(item.end_time).getTime() - Date.now() < 3_600_000;

  return (
    <Link to={`/auctions/${item.auction_id}`} className="block group">
      <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden hover:border-neutral-400 hover:shadow-md transition-all">
        {/* Image */}
        <div className="relative aspect-[4/3] bg-neutral-100 overflow-hidden">
          {item.image_urls[0] ? (
            <img
              src={item.image_urls[0]}
              alt={item.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-4xl text-neutral-300">📦</div>
          )}

          {/* Badges */}
          <div className="absolute top-2 left-2 flex gap-1.5 flex-wrap">
            {isHot && (
              <span className="px-2 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-medium">
                🔥 Hot
              </span>
            )}
            {isEnding && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-medium">
                ⏱ Ending soon
              </span>
            )}
          </div>

          {/* Time left */}
          <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-black/60 text-white text-[11px] font-medium backdrop-blur-sm">
            {timeLeft(item.end_time)}
          </div>
        </div>

        {/* Details */}
        <div className="p-3">
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <h3 className="text-sm font-medium leading-tight line-clamp-2 flex-1">{item.title}</h3>
          </div>

          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] text-neutral-500 capitalize">{item.category}</span>
            <span className="text-neutral-300">·</span>
            <span className="text-[11px] text-neutral-500 capitalize">{item.condition}</span>
          </div>

          {/* AI reason badge */}
          <div className="mb-2.5">
            <span className="inline-flex items-center gap-1 text-[10px] text-neutral-500 bg-neutral-50 border border-neutral-200 px-2 py-0.5 rounded-full">
              <span>✦</span>
              <span>{item.reason}</span>
            </span>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="text-base font-semibold">${item.current_price.toLocaleString()}</div>
              <div className="text-[11px] text-neutral-400">{item.bid_count} bid{item.bid_count !== 1 ? "s" : ""}</div>
            </div>
            <div className="text-xs text-neutral-400 text-right">
              Reserve<br />
              <span className="text-neutral-600 font-medium">${item.reserve_price.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

// ── Skeleton card ─────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden animate-pulse">
      <div className="aspect-[4/3] bg-neutral-100" />
      <div className="p-3 space-y-2">
        <div className="h-3 bg-neutral-100 rounded w-3/4" />
        <div className="h-3 bg-neutral-100 rounded w-1/2" />
        <div className="h-4 bg-neutral-100 rounded w-1/3 mt-3" />
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────
export function HomePage() {
  const { user } = useAuthStore();
  const {
    data, isLoading, isFetchingNextPage,
    hasNextPage, fetchNextPage,
  } = usePersonalisedFeed(user?.id ?? "", 20);

  const sentinelRef = useRef<HTMLDivElement>(null);

  // Infinite scroll via IntersectionObserver
  const handleObserver = useCallback((entries: IntersectionObserverEntry[]) => {
    if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(handleObserver, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [handleObserver]);

  const allItems = data?.pages.flatMap(p => p.items) ?? [];
  const isPersonalised = data?.pages[0]?.personalised ?? false;

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Search bar */}
      <div className="sticky top-0 z-40 bg-white border-b border-neutral-200 px-4 py-3">
        <SemanticSearch />
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex gap-6">
          {/* Main feed */}
          <div className="flex-1 min-w-0">
            {/* Feed header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-lg font-semibold">
                  {isPersonalised ? "For you" : "Active auctions"}
                </h1>
                {isPersonalised && (
                  <p className="text-xs text-neutral-500 mt-0.5 flex items-center gap-1">
                    <span>✦</span>
                    <span>Ranked by your bidding history</span>
                  </p>
                )}
              </div>
              {allItems.length > 0 && (
                <span className="text-sm text-neutral-400">{allItems.length} auctions</span>
              )}
            </div>

            {/* Grid */}
            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(9)].map((_, i) => <SkeletonCard key={i} />)}
              </div>
            ) : allItems.length === 0 ? (
              <div className="text-center py-16 text-neutral-500">
                <div className="text-4xl mb-3">🏷️</div>
                <p className="font-medium">No active auctions right now</p>
                <p className="text-sm mt-1">Check back soon or browse all categories</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {allItems.map((item) => (
                    <AuctionCard key={item.auction_id} item={item} />
                  ))}
                </div>

                {/* Infinite scroll sentinel */}
                <div ref={sentinelRef} className="h-8 mt-4" />

                {isFetchingNextPage && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                    {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
                  </div>
                )}

                {!hasNextPage && allItems.length > 0 && (
                  <p className="text-center text-sm text-neutral-400 py-8">
                    You've seen all active auctions
                  </p>
                )}
              </>
            )}
          </div>

          {/* Sidebar */}
          <div className="hidden lg:block w-72 flex-shrink-0 space-y-4">
            <DemandHeatmap />

            {/* Quick links */}
            <div className="rounded-xl border border-neutral-200 bg-white p-4">
              <h3 className="text-sm font-medium mb-3">Browse categories</h3>
              <div className="space-y-1.5">
                {[
                  { icon: "⌚", label: "Watches", slug: "watches" },
                  { icon: "📷", label: "Cameras", slug: "cameras" },
                  { icon: "🎨", label: "Art",     slug: "art" },
                  { icon: "💎", label: "Jewelry",  slug: "jewelry" },
                  { icon: "💻", label: "Electronics", slug: "electronics" },
                ].map(c => (
                  <Link
                    key={c.slug}
                    to={`/browse?category=${c.slug}`}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-neutral-50 text-sm text-neutral-700 transition-colors"
                  >
                    <span>{c.icon}</span>
                    <span>{c.label}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HomePage;
