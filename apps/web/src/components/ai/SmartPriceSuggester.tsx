// apps/web/src/components/ai/SmartPriceSuggester.tsx
// Smart price suggestion card shown when seller fills in category + condition.
// Calls /listing/price-suggest and shows comparable sold prices + suggested range.

import { useQuery } from "@tanstack/react-query";
import { TrendingUp, AlertCircle, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { useState } from "react";

const AI_URL = (import.meta as any).env?.VITE_AI_SERVICE_URL ?? "http://localhost:8000";

interface PriceSuggestResponse {
  suggested_starting: number;
  suggested_reserve: number;
  suggested_buy_now: number | null;
  comparable_avg: number;
  comparable_count: number;
  comparables: Array<{ title: string; final_price: number; condition: string; sold_days_ago: number }>;
  condition_adjustment_pct: number;
  confidence: "high" | "medium" | "low";
  reasoning: string;
}

interface Props {
  title: string;
  category: string;
  condition: string;
  onApply?: (starting: number, reserve: number) => void;
}

const CONFIDENCE_STYLE = {
  high:   "bg-emerald-50 border-emerald-200 text-emerald-700",
  medium: "bg-amber-50 border-amber-200 text-amber-700",
  low:    "bg-neutral-100 border-neutral-200 text-neutral-500",
};

export function SmartPriceSuggester({ title, category, condition, onApply }: Props) {
  const [expanded, setExpanded] = useState(false);

  const enabled = title.length >= 3 && !!category && !!condition;

  const { data, isLoading, error } = useQuery<PriceSuggestResponse>({
    queryKey: ["price-suggest", category, condition],
    queryFn: async () => {
      const res = await fetch(`${AI_URL}/listing/price-suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, category, condition }),
      });
      if (!res.ok) throw new Error("AI unavailable");
      return res.json();
    },
    enabled,
    staleTime: 5 * 60_000,
  });

  if (!enabled) return null;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 rounded-none border border-border-base bg-bg-surface text-text-tertiary text-xs">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span className="font-mono uppercase tracking-wider">Analysing comparable sales…</span>
      </div>
    );
  }

  if (error || !data) return null;

  return (
    <div className="rounded-none border border-border-base bg-bg-surface overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border-base">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-text-primary">
            AI Price Suggestion
          </span>
          <span className={`px-2 py-0.5 rounded-none text-[8px] font-bold uppercase tracking-widest border ${CONFIDENCE_STYLE[data.confidence]}`}>
            {data.confidence} confidence
          </span>
        </div>
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-text-tertiary hover:text-text-primary transition-colors cursor-pointer"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Price Cards */}
      <div className="grid grid-cols-2 gap-px bg-border-base">
        {[
          { label: "Starting Price", value: data.suggested_starting, sub: "60% of median" },
          { label: "Reserve Price", value: data.suggested_reserve, sub: "85% of median" },
        ].map(({ label, value, sub }) => (
          <div key={label} className="bg-bg-surface px-5 py-4">
            <p className="text-[9px] font-bold uppercase tracking-widest text-text-tertiary mb-1">{label}</p>
            <p className="font-mono text-2xl font-bold text-text-primary">${value.toLocaleString()}</p>
            <p className="text-[9px] text-text-tertiary font-mono tracking-wider mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* Apply Button */}
      {onApply && (
        <div className="px-5 py-3 border-t border-border-base">
          <button
            onClick={() => onApply(data.suggested_starting, data.suggested_reserve)}
            className="w-full py-2.5 rounded-none bg-primary text-white text-[10px] font-bold uppercase tracking-widest hover:bg-primary-dark transition-all cursor-pointer"
          >
            Apply Suggested Prices
          </button>
        </div>
      )}

      {/* Expanded: Comparables */}
      {expanded && (
        <div className="px-5 pb-5 pt-2 border-t border-border-base space-y-4">
          {/* Reasoning */}
          <div className="flex items-start gap-2 text-xs text-text-secondary">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-text-tertiary" />
            <p>{data.reasoning}</p>
          </div>

          {/* Comparable Sales */}
          {data.comparables.length > 0 && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-text-tertiary mb-2">
                {data.comparable_count} comparable sold auctions (last 90 days)
              </p>
              <div className="space-y-2">
                {data.comparables.map((comp, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-border-base last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-text-primary truncate">{comp.title}</p>
                      <p className="text-[9px] font-mono text-text-tertiary uppercase tracking-wider">
                        {comp.condition} · {comp.sold_days_ago}d ago
                      </p>
                    </div>
                    <p className="font-mono text-sm font-bold text-text-primary ml-4">
                      ${comp.final_price.toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.condition_adjustment_pct !== 0 && (
            <p className="text-[9px] font-mono text-text-tertiary">
              Condition adjustment: <span className={data.condition_adjustment_pct > 0 ? "text-primary" : "text-danger"}>
                {data.condition_adjustment_pct > 0 ? "+" : ""}{data.condition_adjustment_pct}%
              </span> applied for '{condition}' vs avg comparable condition.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default SmartPriceSuggester;
