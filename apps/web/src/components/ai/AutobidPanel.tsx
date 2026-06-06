// apps/web/src/components/ai/AutobidPanel.tsx
// AI autobidder UI — fits BidSpace's Zustand + TanStack Query + TailwindCSS v4 stack.
// Drop into your AuctionRoom page next to the manual bid form.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore"; // your existing Zustand auth store
import { apiClient as axios } from "@/api/client";                   // your existing Axios JWT interceptor

type Strategy = "conservative" | "aggressive" | "sniper" | "value";

const STRATEGIES: { key: Strategy; label: string; desc: string; icon: string }[] = [
  { key: "conservative", label: "Conservative", desc: "Bid only when great value", icon: "🛡️" },
  { key: "aggressive",   label: "Aggressive",   desc: "Bid high to deter rivals", icon: "⚡" },
  { key: "sniper",       label: "Sniper",       desc: "Strike in final 30 seconds", icon: "🎯" },
  { key: "value",        label: "Value",        desc: "Only bid below fair price",  icon: "⚖️" },
];

interface Props {
  auctionId: string;
  currentPrice: number;
}

export function AutobidPanel({ auctionId, currentPrice }: Props) {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [strategy, setStrategy] = useState<Strategy>("conservative");
  const [maxBudget, setMaxBudget] = useState<string>("");
  const [open, setOpen] = useState(false);

  // Check if already registered
  const { data: myBids } = useQuery({
    queryKey: ["autobids"],
    queryFn: () => axios.get("/api/autobid/my").then(r => r.data),
    enabled: !!user,
  });

  const existing = myBids?.find((r: any) => r.auctionId === auctionId && r.isActive);

  const register = useMutation({
    mutationFn: () => axios.post("/api/autobid/register", {
      auctionId,
      maxBudget: parseFloat(maxBudget),
      strategy,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["autobids"] });
      setOpen(false);
    },
  });

  const cancel = useMutation({
    mutationFn: () => axios.delete(`/api/autobid/cancel/${auctionId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autobids"] }),
  });

  if (!user) return null;

  if (existing) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 mt-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-amber-900">
              <span>🤖</span>
              <span>Autobidder active — {existing.strategy}</span>
            </div>
            <div className="text-xs text-amber-700 mt-1">
              Budget: ${parseFloat(existing.maxBudget).toLocaleString()}
            </div>
          </div>
          <button
            onClick={() => cancel.mutate()}
            disabled={cancel.isPending}
            className="text-xs text-amber-800 underline hover:no-underline"
          >
            {cancel.isPending ? "Cancelling…" : "Cancel"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-300 py-3 text-sm text-neutral-500 hover:border-neutral-400 hover:text-neutral-700 transition-colors"
        >
          <span>🤖</span>
          Set up AI autobidder
        </button>
      ) : (
        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-sm">AI autobidder</h3>
            <button onClick={() => setOpen(false)} className="text-neutral-400 hover:text-neutral-600 text-lg leading-none">×</button>
          </div>

          {/* Strategy picker */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            {STRATEGIES.map(s => (
              <button
                key={s.key}
                onClick={() => setStrategy(s.key)}
                className={`rounded-lg border p-3 text-left transition-all ${
                  strategy === s.key
                    ? "border-neutral-900 bg-neutral-900 text-white"
                    : "border-neutral-200 hover:border-neutral-400"
                }`}
              >
                <div className="text-lg mb-1">{s.icon}</div>
                <div className="text-xs font-medium">{s.label}</div>
                <div className={`text-xs mt-0.5 ${strategy === s.key ? "text-neutral-300" : "text-neutral-500"}`}>
                  {s.desc}
                </div>
              </button>
            ))}
          </div>

          {/* Max budget */}
          <div className="mb-4">
            <label className="text-xs text-neutral-500 mb-1.5 block">
              Maximum budget (current: ${currentPrice.toLocaleString()})
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">$</span>
              <input
                type="number"
                value={maxBudget}
                onChange={e => setMaxBudget(e.target.value)}
                placeholder={String(Math.round(currentPrice * 1.3))}
                min={currentPrice + 10}
                className="w-full pl-7 pr-3 py-2.5 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:border-neutral-400"
              />
            </div>
            {maxBudget && parseFloat(maxBudget) <= currentPrice && (
              <p className="text-xs text-red-500 mt-1">Budget must be above current price</p>
            )}
          </div>

          {/* Strategy hint */}
          <div className="rounded-lg bg-neutral-50 p-3 text-xs text-neutral-600 mb-4">
            {strategy === "conservative" && "Bids when outbid and predicted final price is well within your budget. Lowest risk."}
            {strategy === "aggressive" && "Bids immediately at 15% above current price to signal strength and deter competitors."}
            {strategy === "sniper" && "Waits silently then places a single bid in the final 30 seconds. Prevents counter-bidding."}
            {strategy === "value" && "Only bids when current price is below the AI's predicted fair market value. Best for disciplined buyers."}
          </div>

          <button
            onClick={() => register.mutate()}
            disabled={!maxBudget || parseFloat(maxBudget) <= currentPrice || register.isPending}
            className="w-full rounded-xl bg-neutral-900 text-white py-3 text-sm font-medium hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {register.isPending ? "Activating…" : "Activate autobidder"}
          </button>

          {register.isError && (
            <p className="text-xs text-red-500 mt-2 text-center">
              {(register.error as any)?.response?.data?.error ?? "Failed to activate"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
export default AutobidPanel;
