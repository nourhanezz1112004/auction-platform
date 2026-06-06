// apps/web/src/components/BidPaceSparkline.tsx
// Real-time sparkline of bid activity powered by existing Socket.io bid events.
// No new backend endpoints needed — derives everything from the live bid stream.

import { useState, useEffect, useRef } from "react";
import { Socket } from "socket.io-client";

interface BidEvent {
  auctionId: string;
  amount: number;
  bidCount: number;
  ts: number;
  newEndTime?: string;
  extended?: boolean;
}

interface BucketData {
  label: string;       // e.g. "14:35"
  windowStart: number; // epoch ms
  count: number;
}

interface Props {
  auctionId: string;
  socket: Socket;
  windowMinutes?: number; // total time window to display (default 30)
  bucketMinutes?: number; // each bucket size (default 5)
  height?: number;
}

const COLORS = {
  bar:        "var(--color-text-primary)",
  barHover:   "var(--color-text-info)",
  axis:       "var(--color-border-secondary)",
  label:      "var(--color-text-tertiary)",
  extended:   "var(--color-text-warning)",
};

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function BidPaceSparkline({
  auctionId, socket,
  windowMinutes = 30,
  bucketMinutes = 5,
  height = 80,
}: Props) {
  const numBuckets = windowMinutes / bucketMinutes;
  const bucketMs   = bucketMinutes * 60_000;

  const [buckets, setBuckets] = useState<BucketData[]>(() => initBuckets(numBuckets, bucketMs));
  const [totalBids, setTotalBids] = useState(0);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [extended, setExtended] = useState(false);
  const bucketsRef = useRef(buckets);
  bucketsRef.current = buckets;

  function initBuckets(n: number, bMs: number): BucketData[] {
    const now = Date.now();
    return Array.from({ length: n }, (_, i) => {
      const windowStart = now - (n - 1 - i) * bMs;
      return { label: fmtTime(windowStart), windowStart, count: 0 };
    });
  }

  // Slide buckets forward when a new bucket period starts
  useEffect(() => {
    const tick = setInterval(() => {
      setBuckets((prev) => {
        const now = Date.now();
        const newest = prev[prev.length - 1];
        if (now - newest.windowStart < bucketMs) return prev;
        const next = [...prev.slice(1), { label: fmtTime(now), windowStart: now, count: 0 }];
        return next;
      });
    }, 10_000); // check every 10s
    return () => clearInterval(tick);
  }, [bucketMs]);

  // Listen to live bid events from Socket.io
  useEffect(() => {
    const handler = (data: BidEvent) => {
      if (data.auctionId !== auctionId) return;
      if (data.extended) setExtended(true);

      setBuckets((prev) => {
        const now = Date.now();
        const updated = [...prev];
        // Find which bucket this bid falls into
        for (let i = updated.length - 1; i >= 0; i--) {
          if (now >= updated[i].windowStart) {
            updated[i] = { ...updated[i], count: updated[i].count + 1 };
            break;
          }
        }
        return updated;
      });

      setTotalBids((n) => n + 1);
    };

    socket.on("auction:bid", handler);
    return () => { socket.off("auction:bid", handler); };
  }, [socket, auctionId]);

  const maxCount = Math.max(...buckets.map((b) => b.count), 1);
  const barWidth = 100 / buckets.length;

  return (
    <div style={{ userSelect: "none" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: COLORS.label }}>
          Bid activity — last {windowMinutes} min
        </span>
        <span style={{ fontSize: 12, color: COLORS.label }}>
          {totalBids} bids total
          {extended && (
            <span style={{ marginLeft: 8, color: COLORS.extended, fontWeight: 500 }}>
              ⏱ Extended
            </span>
          )}
        </span>
      </div>

      {/* Sparkline SVG */}
      <svg width="100%" height={height} viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none" style={{ display: "block" }}>
        {buckets.map((b, i) => {
          const barH = Math.max((b.count / maxCount) * (height - 16), b.count > 0 ? 4 : 0);
          const x = i * barWidth + barWidth * 0.1;
          const w = barWidth * 0.8;
          const y = height - barH - 14;
          const isHovered = hoveredIdx === i;

          return (
            <g key={b.windowStart}>
              <rect
                x={`${x}%`} y={y} width={`${w}%`} height={barH}
                rx={1.5}
                fill={isHovered ? COLORS.barHover : COLORS.bar}
                opacity={b.count === 0 ? 0.12 : isHovered ? 1 : 0.75}
                style={{ transition: "opacity .15s, fill .15s" }}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              />
              {/* Axis label every other bucket */}
              {i % 2 === 0 && (
                <text x={`${i * barWidth + barWidth / 2}%`} y={height - 2}
                  textAnchor="middle" fontSize={7} fill={COLORS.label}>
                  {b.label}
                </text>
              )}
            </g>
          );
        })}
        {/* Axis line */}
        <line x1="0" y1={height - 14} x2="100%" y2={height - 14}
          stroke={COLORS.axis} strokeWidth={0.5} />
      </svg>

      {/* Tooltip */}
      {hoveredIdx !== null && (
        <div style={{ textAlign: "center", fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4 }}>
          {buckets[hoveredIdx].label} — {buckets[hoveredIdx].count} bid{buckets[hoveredIdx].count !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}
export default BidPaceSparkline;
