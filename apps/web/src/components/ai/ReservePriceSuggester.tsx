// apps/web/src/components/ReservePriceSuggester.tsx
// Calls the AI service to suggest an optimal reserve price range for sellers.
// Drop into your CreateListing form after category/condition/startingPrice are filled.

import { useState, useEffect, useRef } from "react";

interface ReserveSuggestion {
  predicted_price: number;
  confidence_low: number;
  confidence_high: number;
  model_version: string;
}

interface Props {
  category: string;
  condition: string;
  startingPrice: number;
  durationHours?: number;
  endDow?: number;    // day of week 0-6
  endHour?: number;   // hour 0-23
  onAccept: (value: number) => void;
}

const AI_SERVICE = import.meta.env.VITE_AI_SERVICE_URL ?? "http://localhost:8000";

export function ReservePriceSuggester({
  category, condition, startingPrice, durationHours = 168,
  endDow = 0, endHour = 20, onAccept,
}: Props) {
  const [suggestion, setSuggestion] = useState<ReserveSuggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!category || !condition || startingPrice <= 0) return;

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${AI_SERVICE}/predict/price`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reserve_price: startingPrice * 1.5,
            starting_price: startingPrice,
            category, condition, duration_hours: durationHours,
            end_dow: endDow, end_hour: endHour,
            bid_count: 0, seller_reputation: 4.0,
          }),
        });
        if (!res.ok) throw new Error("AI service unavailable");
        setSuggestion(await res.json());
      } catch {
        setError("Price suggestion unavailable — enter your reserve manually.");
      } finally {
        setLoading(false);
      }
    }, 600);

    return () => clearTimeout(debounceRef.current);
  }, [category, condition, startingPrice, durationHours, endDow, endHour]);

  if (!category || !condition || startingPrice <= 0) return null;

  return (
    <div style={{
      background: "var(--color-background-secondary)",
      border: "1px solid var(--color-border-secondary)",
      borderRadius: 10, padding: "14px 16px", marginTop: 8,
    }}>
      <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
        <span>✦</span>
        <span>AI reserve price suggestion</span>
        {suggestion && <span style={{ marginLeft: "auto", fontSize: 11 }}>Model: {suggestion.model_version}</span>}
      </div>

      {loading && (
        <div style={{ fontSize: 14, color: "var(--color-text-secondary)" }}>Analysing market comps…</div>
      )}

      {error && !loading && (
        <div style={{ fontSize: 13, color: "var(--color-text-warning)" }}>{error}</div>
      )}

      {suggestion && !loading && (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 22, fontWeight: 500, color: "var(--color-text-primary)" }}>
              ${suggestion.predicted_price.toLocaleString()}
            </span>
            <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
              predicted final price
            </span>
          </div>
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 12 }}>
            Confidence range: <strong>${suggestion.confidence_low.toLocaleString()}</strong> – <strong>${suggestion.confidence_high.toLocaleString()}</strong>
          </div>

          {/* Visual range bar */}
          <div style={{ position: "relative", height: 6, background: "var(--color-border-tertiary)", borderRadius: 3, marginBottom: 14 }}>
            {(() => {
              const min = suggestion.confidence_low;
              const max = suggestion.confidence_high;
              const range = max - min || 1;
              const predPct = ((suggestion.predicted_price - min) / range) * 100;
              return (
                <>
                  <div style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, background: "var(--color-background-info)", borderRadius: 3, opacity: 0.3 }} />
                  <div style={{
                    position: "absolute", left: `${predPct}%`, top: "50%",
                    transform: "translate(-50%,-50%)",
                    width: 12, height: 12, borderRadius: "50%",
                    background: "var(--color-text-primary)",
                    border: "2px solid var(--color-background-primary)",
                  }} />
                </>
              );
            })()}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => onAccept(Math.round(suggestion.confidence_low))}
              style={{
                flex: 1, padding: "8px 0", borderRadius: 8, border: "1px solid var(--color-border-secondary)",
                background: "none", cursor: "pointer", fontSize: 13, color: "var(--color-text-secondary)",
              }}
            >
              Conservative<br /><strong>${Math.round(suggestion.confidence_low).toLocaleString()}</strong>
            </button>
            <button
              type="button"
              onClick={() => onAccept(Math.round(suggestion.predicted_price))}
              style={{
                flex: 1, padding: "8px 0", borderRadius: 8, border: "1.5px solid var(--color-text-primary)",
                background: "var(--color-text-primary)", cursor: "pointer", fontSize: 13,
                color: "var(--color-background-primary)", fontWeight: 500,
              }}
            >
              Recommended<br /><strong>${Math.round(suggestion.predicted_price).toLocaleString()}</strong>
            </button>
            <button
              type="button"
              onClick={() => onAccept(Math.round(suggestion.confidence_high))}
              style={{
                flex: 1, padding: "8px 0", borderRadius: 8, border: "1px solid var(--color-border-secondary)",
                background: "none", cursor: "pointer", fontSize: 13, color: "var(--color-text-secondary)",
              }}
            >
              Ambitious<br /><strong>${Math.round(suggestion.confidence_high).toLocaleString()}</strong>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
export default ReservePriceSuggester;
