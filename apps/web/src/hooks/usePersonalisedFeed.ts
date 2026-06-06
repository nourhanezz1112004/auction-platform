import { useInfiniteQuery } from "@tanstack/react-query";
import axios from "axios";

export interface FeedItem {
  auction_id: string;
  title: string;
  current_price: number;
  reserve_price: number;
  image_urls: string[];
  end_time: string;
  reason?: string;
  category?: string;
  condition?: string;
  bid_count: number;
}

interface FeedPage {
  items: FeedItem[];
  personalised: boolean;
  nextCursor?: string;
}

export function usePersonalisedFeed(userId: string, limit = 20) {
  return useInfiniteQuery<FeedPage>({
    queryKey: ["feed", userId],
    queryFn: async ({ pageParam }) => {
      try {
        const res = await axios.get("/api/auctions", {
          params: { limit, cursor: pageParam, userId },
        });
        const raw = res.data?.auctions ?? res.data ?? [];
        const items: FeedItem[] = raw.map((a: any) => ({
          auction_id: a.id ?? a.auction_id,
          title: a.title,
          current_price: a.currentPrice ?? a.current_price ?? 0,
          reserve_price: a.reservePrice ?? a.reserve_price ?? 0,
          image_urls: a.imageUrls ?? a.image_urls ?? [],
          end_time: a.endTime ?? a.end_time ?? new Date().toISOString(),
          reason: a.reason ?? "Recommended for you",
          category: a.category ?? "",
          condition: a.condition ?? "",
          bid_count: a.bidCount ?? a.bid_count ?? 0,
        }));
        return { items, personalised: false, nextCursor: undefined };
      } catch {
        return { items: [], personalised: false };
      }
    },
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}
