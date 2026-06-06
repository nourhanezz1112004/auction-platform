// apps/web/src/components/ai/DemandForecast.tsx
// 30-day GMV demand forecast chart for a category.
// Shows trend line with week-by-week predictions + recommendation.
// Used in the SellerDashboard and CreateListing pages.

import { useQuery } from "@tanstack/react-query";

const AI = import.meta.env.VITE_AI_SERVICE_URL ?? "http://localhost:8000";

interface ForecastData {
  category: string;
  weeks_ahead: number;
  forecasted_gmv: number[];
  week_labels: string[];
  trend: string;
  confidence: string;
  recommendation: string;
}

interface Props {
  category: string;
  weeksAhead?: number;
}

export function DemandForecast({ category, weeksAhead = 4 }: Props) {
  const { data, isLoading } = useQuery<ForecastData>({
    queryKey: ["demand-forecast", category, weeksAhead],
    queryFn: () =>
      fetch(`${AI}/forecast/demand`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, weeks_ahead: weeksAhead }),
      }).then(r => r.json()),
    staleTime: 30 * 60_000,
    enabled: !!category,
  });

  if (isLoading) {
    return <div className="h-28 rounded-xl bg-neutral-100 animate-pulse" />;
  }
  if (!data) return null;

  const max = Math.max(...data.forecasted_gmv, 1);
  const trendColor = data.trend === "up" ? "#16a34a" : data.trend === "down" ? "#ef4444" : "#6b7280";
  const trendIcon  = data.trend === "up" ? "↑" : data.trend === "down" ? "↓" : "→";

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xs font-medium text-neutral-600 capitalize">
            {category} — {weeksAhead}-week forecast
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-xs font-medium" style={{ color: trendColor }}>
              {trendIcon} {data.trend}
            </span>
            <span className="text-[10px] text-neutral-400">· {data.confidence} confidence</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold tabular-nums">
            ${data.forecasted_gmv[0]?.toLocaleString()}
          </div>
          <div className="text-[10px] text-neutral-400">next week GMV</div>
        </div>
      </div>

      {/* Mini bar chart */}
      <div className="flex items-end gap-1.5 h-16 mb-2">
        {data.forecasted_gmv.map((val, i) => {
          const h = Math.max((val / max) * 100, 4);
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full rounded-t-sm transition-all"
                style={{
                  height: `${h}%`,
                  background: i === 0 ? "var(--color-text-primary)" : "var(--color-border-secondary)",
                }}
              />
              <span className="text-[9px] text-neutral-400">{data.week_labels[i]}</span>
            </div>
          );
        })}
      </div>

      <div className="text-[11px] text-neutral-600 border-t border-neutral-100 pt-2">
        {data.recommendation}
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// apps/web/src/components/ai/ReputationBadge.tsx
// Trust badge shown on user profiles and in bid history.
// Reads from /reputation/score — falls back to stars if not loaded.
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery as useQ } from "@tanstack/react-query";

interface ReputationData {
  user_id: string;
  trust_score: number;
  trust_label: string;
  badge_color: string;
}

const BADGE_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  neutral:  { bg: "#f3f4f6", text: "#374151", border: "#d1d5db" },
  blue:     { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe" },
  green:    { bg: "#f0fdf4", text: "#15803d", border: "#bbf7d0" },
  gold:     { bg: "#fefce8", text: "#92400e", border: "#fde68a" },
  platinum: { bg: "#f5f3ff", text: "#5b21b6", border: "#ddd6fe" },
};

interface RepProps {
  userId: string;
  size?: "sm" | "md";
}

export function ReputationBadge({ userId, size = "md" }: RepProps) {
  const { data } = useQ<ReputationData>({
    queryKey: ["reputation", userId],
    queryFn: () =>
      fetch(`${AI}/reputation/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      }).then(r => r.json()),
    staleTime: 15 * 60_000,
    enabled: !!userId,
  });

  if (!data) return null;

  const style = BADGE_STYLES[data.badge_color] ?? BADGE_STYLES.neutral;
  const isSmall = size === "sm";

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border font-medium"
      style={{
        background: style.bg,
        color: style.text,
        borderColor: style.border,
        fontSize: isSmall ? "10px" : "11px",
        padding: isSmall ? "1px 6px" : "2px 8px",
      }}
      title={`Trust score: ${data.trust_score}/10`}
    >
      {data.badge_color === "platinum" ? "✦" :
       data.badge_color === "gold"     ? "★" :
       data.badge_color === "green"    ? "✓" : "·"}
      {data.trust_label}
    </span>
  );
}
export default DemandForecast;
