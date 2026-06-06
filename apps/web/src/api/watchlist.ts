import { apiClient } from "./client";
import type { Auction } from "./auctions";

export async function getWatchlist(): Promise<Auction[]> {
	const res = await apiClient.get<{ watchlist: { auction: Auction }[] }>("/watchlist");
	return res.data.watchlist.map((item) => item.auction);
}

export async function addToWatchlist(auctionId: string): Promise<void> {
	await apiClient.post(`/watchlist/${auctionId}`);
}

export async function removeFromWatchlist(auctionId: string): Promise<void> {
	await apiClient.delete(`/watchlist/${auctionId}`);
}
