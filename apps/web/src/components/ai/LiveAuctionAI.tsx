// apps/web/src/components/ai/LiveAuctionAI.tsx
// Three live AI overlays for your AuctionRoom page:
//   1. BidMomentumMeter  — animated 0-10 hotness gauge
//   2. PriceForecastOverlay — "likely to close $X–$Y"
//   3. SupportChat — floating AI support widget
// All use TanStack Query + your existing Axios/Socket patterns.

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";

const AI = import.meta.env.VITE_AI_SERVICE_URL ?? "http://localhost:8000";

// ═══════════════════════════════════════════════════════════════════
// 1. BID MOMENTUM METER
// ═══════════════════════════════════════════════════════════════════

interface MomentumData {
  momentum_score: number;
  label: string;
  bid_velocity: number;
  watcher_count: number;
  price_acceleration: number;
  confidence: string;
}

export function BidMomentumMeter({ auctionId }: { auctionId: string }) {
  const { data } = useQuery<MomentumData>({
    queryKey: ["momentum", auctionId],
    queryFn: () => fetch(`${AI}/live/momentum/${auctionId}`).then(r => r.json()),
    refetchInterval: 30_000,
    staleTime: 25_000,
  });

  const score = data?.momentum_score ?? 0;
  const pct   = (score / 10) * 100;
  const color = score >= 8 ? "#EF4444" : score >= 5 ? "#F59E0B" : score >= 3 ? "#3B82F6" : "#6B7280";

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-neutral-500">Bid momentum</span>
        {data && (
          <span className="text-xs font-medium" style={{ color }}>
            {data.label}
          </span>
        )}
      </div>

      {/* Gauge bar */}
      <div className="h-2 bg-neutral-100 rounded-full overflow-hidden mb-3">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>

      {/* Score */}
      <div className="flex items-baseline gap-1 mb-3">
        <span className="text-2xl font-semibold tabular-nums" style={{ color }}>
          {score.toFixed(1)}
        </span>
        <span className="text-xs text-neutral-400">/10</span>
      </div>

      {/* Stats */}
      {data && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-sm font-medium tabular-nums">{data.bid_velocity.toFixed(1)}</div>
            <div className="text-[10px] text-neutral-400">bids/min</div>
          </div>
          <div>
            <div className="text-sm font-medium tabular-nums">{data.watcher_count}</div>
            <div className="text-[10px] text-neutral-400">watching</div>
          </div>
          <div>
            <div className="text-sm font-medium tabular-nums">
              {data.price_acceleration > 0 ? "+" : ""}{data.price_acceleration.toFixed(1)}%
            </div>
            <div className="text-[10px] text-neutral-400">30m trend</div>
          </div>
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════
// 2. PRICE FORECAST OVERLAY
// ═══════════════════════════════════════════════════════════════════

interface ForecastData {
  current_price: number;
  predicted_final_low: number;
  predicted_final_mid: number;
  predicted_final_high: number;
  confidence_pct: number;
  based_on_bids: number;
  comparable_sold_avg: number | null;
  message: string;
}

export function PriceForecastOverlay({ auctionId }: { auctionId: string }) {
  const { data, isFetching } = useQuery<ForecastData>({
    queryKey: ["price-forecast", auctionId],
    queryFn: () =>
      fetch(`${AI}/live/price-forecast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auction_id: auctionId }),
      }).then(r => r.json()),
    refetchInterval: 60_000,
    staleTime: 55_000,
  });

  if (!data) return null;

  const range = data.predicted_final_high - data.predicted_final_low;
  const midPct = range > 0
    ? ((data.predicted_final_mid - data.predicted_final_low) / range) * 100
    : 50;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-neutral-500">AI price forecast</span>
          {isFetching && (
            <div className="w-3 h-3 border-2 border-neutral-200 border-t-neutral-500 rounded-full animate-spin" />
          )}
        </div>
        <span className="text-xs text-neutral-400">{data.confidence_pct}% confidence</span>
      </div>

      {/* Forecast range */}
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-xs text-neutral-400">${data.predicted_final_low.toLocaleString()}</span>
        <div className="text-center">
          <div className="text-lg font-semibold tabular-nums">
            ${data.predicted_final_mid.toLocaleString()}
          </div>
          <div className="text-[10px] text-neutral-400">predicted close</div>
        </div>
        <span className="text-xs text-neutral-400">${data.predicted_final_high.toLocaleString()}</span>
      </div>

      {/* Range bar */}
      <div className="relative h-1.5 bg-neutral-100 rounded-full mb-3">
        <div className="absolute inset-0 bg-blue-100 rounded-full" />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-blue-600 border-2 border-white shadow-sm"
          style={{ left: `${midPct}%`, transform: `translate(-50%, -50%)` }}
        />
      </div>

      <div className="text-[11px] text-neutral-500 leading-relaxed">
        {data.message}
      </div>

      {data.comparable_sold_avg && (
        <div className="mt-2 pt-2 border-t border-neutral-100 text-[11px] text-neutral-400">
          Comparable sales avg: ${data.comparable_sold_avg.toLocaleString()}
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════
// 3. SUPPORT CHAT WIDGET
// ═══════════════════════════════════════════════════════════════════

interface Message { role: "user" | "assistant"; content: string }

interface SupportResponse {
  message: string;
  escalate: boolean;
  resolved: boolean;
  ticket_id: string | null;
}

interface SupportChatProps {
  userId: string;
  auctionId?: string;
}

export function SupportChat({ userId, auctionId }: SupportChatProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hi! I'm BidSpace support AI. How can I help you today?" }
  ]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = useMutation({
    mutationFn: async (userMessage: string) => {
      const updated: Message[] = [...messages, { role: "user", content: userMessage }];
      const res = await fetch(`${AI}/support/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          auction_id: auctionId,
          messages: updated.map(m => ({ content: m.content })),
        }),
      });
      const data: SupportResponse = await res.json();
      return { updated, response: data };
    },
    onSuccess: ({ updated, response }) => {
      setMessages([
        ...updated,
        { role: "assistant", content: response.message },
      ]);
      if (response.ticket_id) {
        setMessages(prev => [...prev, {
          role: "assistant",
          content: `✓ Support ticket created: ${response.ticket_id}. Our team will follow up within 2 hours.`
        }]);
      }
    },
  });

  function handleSend() {
    const text = input.trim();
    if (!text || send.isPending) return;
    setInput("");
    send.mutate(text);
  }

  return (
    <>
      {/* Floating trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 right-6 w-12 h-12 rounded-full bg-neutral-900 text-white shadow-lg flex items-center justify-center text-xl hover:bg-neutral-700 transition-colors z-50"
        aria-label="Support chat"
      >
        {open ? "×" : "?"}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-20 right-6 w-80 rounded-2xl border border-neutral-200 bg-white shadow-2xl overflow-hidden z-50 flex flex-col" style={{ height: 440 }}>
          {/* Header */}
          <div className="px-4 py-3 border-b border-neutral-100 bg-neutral-900 text-white">
            <div className="text-sm font-medium">BidSpace Support</div>
            <div className="text-[11px] text-neutral-400 mt-0.5">AI · typically replies instantly</div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-neutral-900 text-white rounded-br-sm"
                    : "bg-neutral-100 text-neutral-800 rounded-bl-sm"
                }`}>
                  {m.content}
                </div>
              </div>
            ))}
            {send.isPending && (
              <div className="flex justify-start">
                <div className="bg-neutral-100 rounded-xl rounded-bl-sm px-3 py-2">
                  <div className="flex gap-1">
                    {[0,1,2].map(i => (
                      <div key={i} className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-neutral-100 flex gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()}
              placeholder="Type a message…"
              className="flex-1 rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:outline-none focus:border-neutral-400"
              disabled={send.isPending}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || send.isPending}
              className="rounded-xl bg-neutral-900 text-white px-3 py-2 text-sm font-medium hover:bg-neutral-700 disabled:opacity-40 transition-colors"
            >
              →
            </button>
          </div>
        </div>
      )}
    </>
  );
}
export default BidMomentumMeter;
