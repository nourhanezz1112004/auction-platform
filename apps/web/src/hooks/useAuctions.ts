import { useQuery } from "@tanstack/react-query";
import { getReviews, createReview } from '@/api/reviews'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from "react-hot-toast";

import {
	getAuctions,
	getAuction,
	getAuctionBids,
	getRecommendations,
	searchAuctions,
} from "@/api/auctions";
import type { AuctionFilters } from "@/api/auctions";

export function useAuctions(filters: AuctionFilters = {}) {
  return useQuery({
    queryKey: ['auctions', filters.status, filters.category, filters.page, filters.limit, filters.q],
    queryFn: () => getAuctions(filters),
  })
}

export function useAuction(id: string) {
	return useQuery({
		queryKey: ["auction", id],
		queryFn: () => getAuction(id),
		enabled: !!id,
		refetchInterval: 30000,
	});
}

export function useAuctionBids(id: string) {
	return useQuery({
		queryKey: ["auction-bids", id],
		queryFn: () => getAuctionBids(id),
		enabled: !!id,
	});
}

export function useRecommendations(userId: string | undefined) {
	return useQuery({
		queryKey: ["recommendations", userId],
		queryFn: () => getRecommendations(userId),
		staleTime: 1000 * 60 * 15,
	});
}

export function useSearch(params: Parameters<typeof searchAuctions>[0]) {
	return useQuery({
		queryKey: ["search", params],
		queryFn: () => searchAuctions(params),
	});
}





export function useReviews(auctionId: string) {
  return useQuery({
    queryKey: ['reviews', auctionId],
    queryFn: () => getReviews(auctionId),
    enabled: !!auctionId,
  })
}

export function useCreateReview(auctionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createReview,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews', auctionId] })
      toast.success('Review submitted')
    },
  })
}