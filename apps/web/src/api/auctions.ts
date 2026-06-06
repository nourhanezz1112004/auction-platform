import { apiClient } from "./client";

export type AuctionStatus = "DRAFT" | "ACTIVE" | "ENDED" | "CANCELLED";

export type Auction = {
	id: string;
	title: string;
	description: string;
	sellerId: string;
	category: string;
	startingPrice: number;
	currentPrice: number;
	reservePrice: number;
	imageUrls: string[];
	status: AuctionStatus;
	version: number;
	startsAt: string;
	endsAt: string;
	createdAt: string;
	winnerId: string | null;
	payment?: {
		status: "PENDING" | "SUCCEEDED" | "FAILED" | "REFUNDED";
	} | null;
	seller?: {
		id: string;
		name: string;
		rating: number;
		avatarUrl?: string | null;
	};
	_count?: {
		bids: number;
	};
};

export type Bid = {
	id: string;
	userId: string;
	auctionId: string;
	amount: number;
	createdAt: string;
	auction?: {
		id?: string;
		title: string;
		status: AuctionStatus;
		currentPrice: number;
		winnerId: string | null;
		payment?: {
			status: "PENDING" | "SUCCEEDED" | "FAILED" | "REFUNDED";
		} | null;
	};
};

export type AuctionsResponse = {
	auctions: Auction[];
	total: number;
	page: number;
};

export type BidsResponse = {
	bids: Bid[];
	total: number;
};

export type AuctionFilters = {
  page?: number
  limit?: number
  category?: string
  status?: string
  q?: string
  sellerId?: string
}

export type CreateAuctionRequest = {
	title: string;
	description: string;
	category: string;
	startingPrice: number;
	reservePrice: number;
	startsAt: string;
	endsAt: string;
};

export async function getAuctions(
	filters: AuctionFilters = {},
): Promise<AuctionsResponse> {
	const res = await apiClient.get<AuctionsResponse>("/auctions", {
		params: filters,
	});
	return res.data;
}

export async function getAuction(id: string): Promise<Auction> {
	const res = await apiClient.get<{ auction: Auction }>(`/auctions/${id}`);
	return res.data.auction;
}

export async function getAuctionBids(
	id: string,
	page = 1,
): Promise<BidsResponse> {
	const res = await apiClient.get<BidsResponse>(`/auctions/${id}/bids`, {
		params: { page, limit: 20 },
	});
	return res.data;
}

export async function createAuction(
	data: CreateAuctionRequest,
): Promise<Auction> {
	const res = await apiClient.post<{ auction: Auction }>("/auctions", data);
	return res.data.auction;
}

export async function getRecommendations(userId?: string): Promise<Auction[]> {
	const res = await apiClient.get<{ recommendations: Auction[] }>(
		`/auctions/recommendations`,
	);
	return res.data.recommendations;
}

export async function searchAuctions(params: {
	q?: string;
	category?: string;
	minPrice?: number;
	maxPrice?: number;
	page?: number;
}): Promise<{ results: Auction[]; total: number }> {
	const res = await apiClient.get("/search", { params });
	return res.data;
}
