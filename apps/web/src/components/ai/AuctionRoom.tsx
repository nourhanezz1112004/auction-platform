// apps/web/src/pages/AuctionRoom.tsx
// Complete auction room page with ALL AI features integrated:
// - Live bid momentum meter
// - Real-time price forecast
// - Bid pace sparkline
// - AI autobidder panel
// - Support chat widget
// Uses your existing Socket.io connection, Zustand, and TanStack Query.

import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { io, Socket } from "socket.io-client";
import { useAuthStore } from "@/store/authStore";
import { apiClient as axios } from "@/api/client";

import { BidMomentumMeter, PriceForecastOverlay, SupportChat } from "./LiveAuctionAI";
import { AutobidPanel } from "./AutobidPanel";
import { BidPaceSparkline } from "./BidPaceSparkline";

const SOCKET_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

// ── Countdown ─────────────────────────────────────────────────────
function useCountdown(endTime: string) {
  const [remaining, setRemaining] = useState("");
  useEffect(() => {
    const tick = () => {
      const diff = new Date(endTime).getTime() - Date.now();
      if (diff <= 0) { setRemaining("Ended"); return; }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      setRemaining(h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endTime]);
  return remaining;
}

// ── Bid history item ──────────────────────────────────────────────
interface BidEvent {
  bidId: string;
  amount: number;
  bidCount: number;
  ts: number;
  extended?: boolean;
  newEndTime?: string;
  auctionId: string;
}

// ── Main page ─────────────────────────────────────────────────────
export function AuctionRoom() {
  const { id: auctionId } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const qc = useQueryClient();

  const [socket, setSocket] = useState<Socket | null>(null);
  const [bidAmount, setBidAmount] = useState("");
  const [liveBids, setLiveBids] = useState<BidEvent[]>([]);
  const [extended, setExtended] = useState(false);
  const [currentEndTime, setCurrentEndTime] = useState<string>("");
  const bidListRef = useRef<HTMLDivElement>(null);

  // Fetch auction data
  const { data: auction } = useQuery({
    queryKey: ["auction", auctionId],
    queryFn: () => axios.get(`/api/auctions/${auctionId}`).then(r => r.data),
    enabled: !!auctionId,
  });

  // Set initial end time
  useEffect(() => {
    if (auction?.endTime) setCurrentEndTime(auction.endTime);
  }, [auction?.endTime]);

  const countdown = useCountdown(currentEndTime || new Date().toISOString());

  // Socket.io connection
  useEffect(() => {
    if (!auctionId || !user) return;

    const s = io(SOCKET_URL, {
      auth: { token: localStorage.getItem("token") },
      transports: ["websocket"],
    });

    s.on("connect", () => {
      s.emit("auction:join", { auctionId });
    });

    // Receive full state on join/rejoin
    s.on("auction:state", (state: any) => {
      qc.setQueryData(["auction", auctionId], (old: any) => ({ ...old, ...state }));
    });

    // Live bid broadcast
    s.on("auction:bid", (event: BidEvent) => {
      setLiveBids(prev => [event, ...prev].slice(0, 50));
      qc.setQueryData(["auction", auctionId], (old: any) => ({
        ...old,
        currentPrice: event.amount,
        bidCount: event.bidCount,
      }));
      if (event.newEndTime) {
        setCurrentEndTime(event.newEndTime);
        setExtended(true);
        setTimeout(() => setExtended(false), 8000);
      }
      // Scroll bid list to top
      bidListRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    });

    setSocket(s);
    return () => { s.emit("auction:leave", { auctionId }); s.disconnect(); };
  }, [auctionId, user]);

  // Place bid mutation
  const placeBid = useMutation({
    mutationFn: () =>
      axios.post("/api/bids", { auctionId, amount: parseFloat(bidAmount) }),
    onSuccess: () => setBidAmount(""),
    onError: (err: any) => alert(err.response?.data?.error ?? "Bid failed"),
  });

  const minBid = (auction?.currentPrice ?? 0) + (auction?.minimumIncrement ?? 10);
  const canBid = !!bidAmount && parseFloat(bidAmount) >= minBid && auction?.status === "ACTIVE";

  if (!auction) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-neutral-200 border-t-neutral-900 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Left: Images + Details ── */}
          <div className="lg:col-span-2 space-y-4">
            {/* Main image */}
            <div className="rounded-2xl overflow-hidden bg-neutral-100 aspect-[4/3]">
              {auction.imageUrls?.[0] ? (
                <img src={auction.imageUrls[0]} alt={auction.title}
                  className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-6xl text-neutral-300">📦</div>
              )}
            </div>

            {/* Title + meta */}
            <div>
              <div className="flex items-start justify-between gap-3">
                <h1 className="text-xl font-semibold leading-snug">{auction.title}</h1>
                <span className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-medium ${
                  auction.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-neutral-100 text-neutral-600"
                }`}>
                  {auction.status}
                </span>
              </div>
              <div className="flex gap-3 mt-2 text-sm text-neutral-500">
                <span className="capitalize">{auction.category}</span>
                <span>·</span>
                <span className="capitalize">{auction.condition}</span>
              </div>
            </div>

            {/* Description */}
            {auction.description && (
              <p className="text-sm text-neutral-600 leading-relaxed">{auction.description}</p>
            )}

            {/* Bid pace sparkline */}
            {socket && (
              <div className="rounded-xl border border-neutral-200 bg-white p-4">
                <BidPaceSparkline auctionId={auctionId!} socket={socket} />
              </div>
            )}

            {/* Live bid history */}
            <div className="rounded-xl border border-neutral-200 bg-white p-4">
              <h3 className="text-sm font-medium mb-3">Live bids</h3>
              <div ref={bidListRef} className="space-y-2 max-h-48 overflow-y-auto">
                {liveBids.length === 0 ? (
                  <p className="text-sm text-neutral-400">No bids yet — be the first!</p>
                ) : liveBids.map((b, i) => (
                  <div key={b.bidId} className={`flex items-center justify-between py-1.5 ${
                    i === 0 ? "text-neutral-900 font-medium" : "text-neutral-500"
                  }`}>
                    <div className="flex items-center gap-2">
                      {i === 0 && <span className="text-green-500 text-xs">● </span>}
                      <span className="text-sm">${b.amount.toLocaleString()}</span>
                      {b.extended && (
                        <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Extended</span>
                      )}
                    </div>
                    <span className="text-xs text-neutral-400">
                      {new Date(b.ts).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Right: Bid panel + AI ── */}
          <div className="space-y-4">
            {/* Price + countdown */}
            <div className="rounded-2xl border border-neutral-200 bg-white p-5">
              <div className="text-xs text-neutral-500 mb-1">Current bid</div>
              <div className="text-3xl font-bold mb-1">
                ${(auction.currentPrice ?? 0).toLocaleString()}
              </div>
              <div className="flex items-center justify-between text-sm text-neutral-500 mb-4">
                <span>{auction._count?.bids ?? 0} bids</span>
                <span className={`font-medium ${
                  countdown.includes("m") && !countdown.includes("h") ? "text-red-600" : "text-neutral-700"
                }`}>
                  {countdown}
                </span>
              </div>

              {/* Anti-snipe notice */}
              {extended && (
                <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                  ⏱ Auction extended — a bid arrived in the final 2 minutes
                </div>
              )}

              {/* Bid form */}
              {auction.status === "ACTIVE" && user && auction.sellerId !== user.id && (
                <div className="space-y-2">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">$</span>
                    <input
                      type="number"
                      value={bidAmount}
                      onChange={e => setBidAmount(e.target.value)}
                      placeholder={String(minBid)}
                      min={minBid}
                      step={auction.minimumIncrement ?? 10}
                      className="w-full pl-7 pr-3 py-3 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:border-neutral-400"
                    />
                  </div>
                  <div className="text-xs text-neutral-400 text-center">
                    Minimum bid: ${minBid.toLocaleString()}
                  </div>
                  <button
                    onClick={() => placeBid.mutate()}
                    disabled={!canBid || placeBid.isPending}
                    className="w-full py-3 rounded-xl bg-neutral-900 text-white font-medium text-sm hover:bg-neutral-700 disabled:opacity-40 transition-colors"
                  >
                    {placeBid.isPending ? "Placing bid…" : `Place bid · $${bidAmount || minBid}`}
                  </button>
                </div>
              )}

              {auction.status !== "ACTIVE" && (
                <div className="text-center py-3 text-sm text-neutral-500">
                  This auction has ended
                </div>
              )}
            </div>

            {/* AI Momentum */}
            {auctionId && <BidMomentumMeter auctionId={auctionId} />}

            {/* AI Price Forecast */}
            {auctionId && <PriceForecastOverlay auctionId={auctionId} />}

            {/* AI Autobidder */}
            {auctionId && auction.status === "ACTIVE" && user && auction.sellerId !== user.id && (
              <AutobidPanel
                auctionId={auctionId}
                currentPrice={auction.currentPrice ?? 0}
              />
            )}

            {/* Seller info */}
            {auction.seller && (
              <div className="rounded-xl border border-neutral-200 bg-white p-4">
                <div className="text-xs text-neutral-500 mb-2">Seller</div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-neutral-200 flex items-center justify-center text-sm font-medium">
                    {auction.seller.name?.[0]?.toUpperCase()}
                  </div>
                  <div>
                    <div className="text-sm font-medium">{auction.seller.name}</div>
                    <div className="text-xs text-neutral-500">
                      {auction.seller.reputationScore?.toFixed(1)}/5 ★
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating support chat */}
      {user && auctionId && (
        <SupportChat userId={user.id} auctionId={auctionId} />
      )}
    </div>
  );
}

export default AuctionRoom;
