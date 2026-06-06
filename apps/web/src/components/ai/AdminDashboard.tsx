// apps/web/src/pages/AdminDashboard.tsx
// Live admin ops dashboard — reads from /admin/platform-health every 60s.
// Shows bid velocity, fraud signals, payment health, shill alerts, model status.
// Uses TanStack Query + TailwindCSS v4.

import { useQuery } from "@tanstack/react-query";

const AI = import.meta.env.VITE_AI_SERVICE_URL ?? "http://localhost:8000";
const ADMIN_KEY = import.meta.env.VITE_ADMIN_API_KEY ?? "";

interface PlatformHealth {
  generated_at: string;
  bids_last_hour: number;
  bids_last_24h: number;
  bid_velocity_trend: string;
  avg_fraud_score_24h: number;
  high_fraud_bids_24h: number;
  active_auctions: number;
  auctions_ending_1h: number;
  reserve_met_rate_7d: number;
  payments_pending: number;
  payments_failed_24h: number;
  payment_failure_rate_7d: number;
  new_users_24h: number;
  new_users_7d: number;
  suspended_users: number;
  open_shill_alerts: number;
  high_risk_auctions: Array<{ id: string; title: string; fraud_bids: number; max_fraud_score: number }>;
  model_version: string;
  avg_price_prediction_error: number | null;
}

// ── Stat tile ────────────────────────────────────────────────────
function Tile({ label, value, sub, alert = false, good = false }: {
  label: string; value: string | number; sub?: string; alert?: boolean; good?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-4 ${
      alert ? "border-red-200 bg-red-50" :
      good  ? "border-green-200 bg-green-50" :
      "border-neutral-200 bg-white"
    }`}>
      <div className={`text-xs mb-1 ${alert ? "text-red-600" : good ? "text-green-700" : "text-neutral-500"}`}>
        {label}
      </div>
      <div className={`text-2xl font-semibold tabular-nums ${
        alert ? "text-red-700" : good ? "text-green-800" : "text-neutral-900"
      }`}>
        {value}
      </div>
      {sub && <div className="text-xs text-neutral-400 mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Trend badge ──────────────────────────────────────────────────
function TrendBadge({ trend }: { trend: string }) {
  const map: Record<string, { label: string; color: string }> = {
    up:     { label: "↑ Up",     color: "bg-green-100 text-green-700" },
    down:   { label: "↓ Down",   color: "bg-red-100 text-red-700" },
    stable: { label: "→ Stable", color: "bg-neutral-100 text-neutral-600" },
  };
  const t = map[trend] ?? map.stable;
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${t.color}`}>{t.label}</span>;
}

// ── Main dashboard ───────────────────────────────────────────────
export function AdminDashboard() {
  const { data, isLoading, dataUpdatedAt } = useQuery<PlatformHealth>({
    queryKey: ["admin-health"],
    queryFn: () =>
      fetch(`${AI}/admin/platform-health`, {
        headers: { "x-admin-key": ADMIN_KEY },
      }).then(r => {
        if (!r.ok) throw new Error("Unauthorized");
        return r.json();
      }),
    refetchInterval: 60_000,
    staleTime: 55_000,
  });

  if (isLoading) {
    return (
      <div className="p-8 text-center text-neutral-500">
        Loading platform health…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8 text-center text-red-500">
        Could not load admin dashboard. Check VITE_ADMIN_API_KEY.
      </div>
    );
  }

  const lastUpdated = new Date(dataUpdatedAt).toLocaleTimeString();

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Platform health</h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            AI anomaly dashboard · Updated {lastUpdated}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs text-neutral-500">Live</span>
        </div>
      </div>

      {/* Bid signals */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-sm font-medium text-neutral-700">Bid signals</h2>
          <TrendBadge trend={data.bid_velocity_trend} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Tile label="Bids last hour"   value={data.bids_last_hour.toLocaleString()} />
          <Tile label="Bids last 24h"    value={data.bids_last_24h.toLocaleString()} />
          <Tile
            label="High fraud bids (24h)" value={data.high_fraud_bids_24h}
            alert={data.high_fraud_bids_24h > 10}
            sub={`Avg score: ${data.avg_fraud_score_24h.toFixed(3)}`}
          />
          <Tile
            label="Open shill alerts" value={data.open_shill_alerts}
            alert={data.open_shill_alerts > 0}
          />
        </div>
      </div>

      {/* Auction signals */}
      <div>
        <h2 className="text-sm font-medium text-neutral-700 mb-3">Auctions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Tile label="Active auctions"   value={data.active_auctions} />
          <Tile
            label="Ending in 1h" value={data.auctions_ending_1h}
            alert={data.auctions_ending_1h > 50}
          />
          <Tile
            label="Reserve met rate (7d)" value={`${data.reserve_met_rate_7d}%`}
            good={data.reserve_met_rate_7d >= 70}
            alert={data.reserve_met_rate_7d < 40}
          />
        </div>
      </div>

      {/* Payment signals */}
      <div>
        <h2 className="text-sm font-medium text-neutral-700 mb-3">Payments</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Tile label="Pending payments"  value={data.payments_pending} alert={data.payments_pending > 20} />
          <Tile label="Failed (24h)"      value={data.payments_failed_24h} alert={data.payments_failed_24h > 5} />
          <Tile
            label="Failure rate (7d)" value={`${data.payment_failure_rate_7d}%`}
            alert={data.payment_failure_rate_7d > 10}
            good={data.payment_failure_rate_7d < 3}
          />
        </div>
      </div>

      {/* User signals */}
      <div>
        <h2 className="text-sm font-medium text-neutral-700 mb-3">Users</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Tile label="New users (24h)" value={data.new_users_24h} good={data.new_users_24h > 0} />
          <Tile label="New users (7d)"  value={data.new_users_7d} />
          <Tile label="Suspended"       value={data.suspended_users} alert={data.suspended_users > 0} />
        </div>
      </div>

      {/* High risk auctions */}
      {data.high_risk_auctions.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-red-700 mb-3">⚠ High-risk active auctions</h2>
          <div className="rounded-xl border border-red-200 bg-red-50 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-red-200 text-xs text-red-600">
                  <th className="text-left px-4 py-2 font-medium">Auction</th>
                  <th className="text-right px-4 py-2 font-medium">Fraud bids</th>
                  <th className="text-right px-4 py-2 font-medium">Max score</th>
                  <th className="text-right px-4 py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.high_risk_auctions.map((a) => (
                  <tr key={a.id} className="border-b border-red-100 last:border-0">
                    <td className="px-4 py-2.5 font-medium truncate max-w-xs">{a.title}</td>
                    <td className="px-4 py-2.5 text-right text-red-700">{a.fraud_bids}</td>
                    <td className="px-4 py-2.5 text-right text-red-700">{a.max_fraud_score.toFixed(3)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <a href={`/admin/auctions/${a.id}`}
                        className="text-xs text-red-700 underline hover:no-underline">
                        Review →
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Model health */}
      <div>
        <h2 className="text-sm font-medium text-neutral-700 mb-3">AI model health</h2>
        <div className="grid grid-cols-2 gap-3">
          <Tile label="Model version" value={data.model_version} />
          <Tile
            label="Price prediction error"
            value={data.avg_price_prediction_error != null ? `${data.avg_price_prediction_error}%` : "N/A"}
            good={data.avg_price_prediction_error != null && data.avg_price_prediction_error < 15}
            alert={data.avg_price_prediction_error != null && data.avg_price_prediction_error > 30}
          />
        </div>
      </div>
    </div>
  );
}

export default AdminDashboard;
