// apps/web/src/pages/SellerDashboard.tsx
// Full seller analytics dashboard with AI narrative, charts, and weekly trend.

import { useState, useEffect } from "react";

interface AnalyticsData {
  period_days: number;
  summary: {
    total_auctions: number; closed_auctions: number; total_gmv: number;
    avg_final_vs_reserve_pct: number; avg_bid_count: number; reserve_met_rate_pct: number;
  };
  best_times: {
    day: string; hour: string;
    top_days: Array<{ day: string; avg_price: number; count: number }>;
  };
  categories: Array<{ category: string; count: number; avg_price: number; vs_reserve_pct: number }>;
  weekly_trend: Array<{ week: string; gmv: number; count: number }>;
  narrative: string;
}

const API = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

function useSellerAnalytics(sellerId: string, period: number) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/api/analytics/seller/${sellerId}?period=${period}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    })
      .then((r) => r.ok ? r.json() : Promise.reject("Failed to load analytics"))
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [sellerId, period]);

  return { data, loading, error };
}

// ── Mini bar chart ─────────────────────────────────────────────────────────────
function BarChart({ data, labelKey, valueKey, color = "var(--color-text-primary)" }: {
  data: Record<string, any>[]; labelKey: string; valueKey: string; color?: string;
}) {
  const max = Math.max(...data.map((d) => d[valueKey]), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80 }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <div style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>
            ${(d[valueKey] / 1000).toFixed(0)}k
          </div>
          <div style={{
            width: "100%", background: color, opacity: 0.8, borderRadius: 3,
            height: `${Math.max((d[valueKey] / max) * 60, 2)}px`,
            transition: "height .3s",
          }} />
          <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", textAlign: "center" }}>
            {d[labelKey]}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, positive }: {
  label: string; value: string; sub?: string; positive?: boolean;
}) {
  return (
    <div style={{
      background: "var(--color-background-secondary)",
      border: "1px solid var(--color-border-tertiary)",
      borderRadius: 10, padding: "14px 16px",
    }}>
      <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginBottom: 6 }}>{label}</div>
      <div style={{
        fontSize: 24, fontWeight: 500,
        color: positive === undefined ? "var(--color-text-primary)"
             : positive ? "var(--color-text-success)" : "var(--color-text-danger)",
      }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ── Main dashboard ─────────────────────────────────────────────────────────────
interface Props { sellerId: string; }

export function SellerDashboard({ sellerId }: Props) {
  const [period, setPeriod] = useState(30);
  const { data, loading, error } = useSellerAnalytics(sellerId, period);

  if (loading) return (
    <div style={{ padding: 32, textAlign: "center", color: "var(--color-text-secondary)" }}>
      Loading your analytics…
    </div>
  );

  if (error) return (
    <div style={{ padding: 32, color: "var(--color-text-danger)" }}>{error}</div>
  );

  if (!data) return null;
  const { summary, best_times, categories, weekly_trend, narrative } = data;

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 16px", fontFamily: "var(--font-sans)" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>Seller analytics</h1>
        <select
          value={period}
          onChange={(e) => setPeriod(Number(e.target.value))}
          style={{
            padding: "6px 12px", borderRadius: 8, fontSize: 13,
            border: "1px solid var(--color-border-secondary)",
            background: "var(--color-background-secondary)",
            color: "var(--color-text-primary)",
          }}
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={365}>Last year</option>
        </select>
      </div>

      {/* AI Narrative */}
      <div style={{
        background: "var(--color-background-secondary)",
        border: "1px solid var(--color-border-secondary)",
        borderRadius: 12, padding: "16px 20px", marginBottom: 24,
        borderLeft: "3px solid var(--color-text-primary)",
      }}>
        <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 8 }}>
          ✦ AI weekly digest
        </div>
        <p style={{ margin: 0, fontSize: 15, color: "var(--color-text-primary)", lineHeight: 1.6 }}>
          {narrative}
        </p>
      </div>

      {/* Stat grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
        <StatCard
          label="Total GMV"
          value={`$${summary.total_gmv.toLocaleString()}`}
          sub={`${summary.closed_auctions} auctions closed`}
        />
        <StatCard
          label="Avg final vs reserve"
          value={`${summary.avg_final_vs_reserve_pct > 0 ? "+" : ""}${summary.avg_final_vs_reserve_pct}%`}
          positive={summary.avg_final_vs_reserve_pct >= 0}
        />
        <StatCard
          label="Reserve met rate"
          value={`${summary.reserve_met_rate_pct}%`}
          sub={`Avg ${summary.avg_bid_count} bids/auction`}
          positive={summary.reserve_met_rate_pct >= 70}
        />
      </div>

      {/* Best times */}
      <div style={{
        background: "var(--color-background-secondary)",
        border: "1px solid var(--color-border-tertiary)",
        borderRadius: 10, padding: "16px 18px", marginBottom: 24,
      }}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>Best closing times</div>
        <div style={{ display: "flex", gap: 24 }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 4 }}>Best day</div>
            <div style={{ fontSize: 18, fontWeight: 500 }}>{best_times.day}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 4 }}>Best hour</div>
            <div style={{ fontSize: 18, fontWeight: 500 }}>{best_times.hour}</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 8 }}>Top days by avg price</div>
            {best_times.top_days.map((d) => (
              <div key={d.day} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                <span style={{ color: "var(--color-text-secondary)" }}>{d.day}</span>
                <span style={{ fontWeight: 500 }}>${d.avg_price.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Category breakdown */}
      <div style={{
        background: "var(--color-background-secondary)",
        border: "1px solid var(--color-border-tertiary)",
        borderRadius: 10, padding: "16px 18px", marginBottom: 24,
      }}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>Category performance</div>
        {categories.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>No closed auctions yet</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ color: "var(--color-text-tertiary)", fontSize: 11 }}>
                <th style={{ textAlign: "left", paddingBottom: 8, fontWeight: 400 }}>Category</th>
                <th style={{ textAlign: "right", paddingBottom: 8, fontWeight: 400 }}>Auctions</th>
                <th style={{ textAlign: "right", paddingBottom: 8, fontWeight: 400 }}>Avg price</th>
                <th style={{ textAlign: "right", paddingBottom: 8, fontWeight: 400 }}>vs Reserve</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.category} style={{ borderTop: "1px solid var(--color-border-tertiary)" }}>
                  <td style={{ padding: "8px 0", textTransform: "capitalize" }}>{c.category}</td>
                  <td style={{ textAlign: "right", color: "var(--color-text-secondary)" }}>{c.count}</td>
                  <td style={{ textAlign: "right", fontWeight: 500 }}>${c.avg_price.toLocaleString()}</td>
                  <td style={{ textAlign: "right", color: c.vs_reserve_pct >= 0 ? "var(--color-text-success)" : "var(--color-text-danger)" }}>
                    {c.vs_reserve_pct > 0 ? "+" : ""}{c.vs_reserve_pct}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Weekly GMV trend */}
      {weekly_trend.length > 0 && (
        <div style={{
          background: "var(--color-background-secondary)",
          border: "1px solid var(--color-border-tertiary)",
          borderRadius: 10, padding: "16px 18px",
        }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 16 }}>Weekly GMV trend</div>
          <BarChart
            data={weekly_trend}
            labelKey="week"
            valueKey="gmv"
          />
        </div>
      )}
    </div>
  );
}

export default SellerDashboard;
