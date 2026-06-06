// apps/web/src/components/ai/ListingGuard.tsx
// Pre-listing AI safety panel — drop into your CreateListing form.
// Shows photo quality score, counterfeit risk, and duplicate detection in real time.
// All three checks run in parallel when the seller uploads photos.

import { useState, useCallback } from "react";

const AI = import.meta.env.VITE_AI_SERVICE_URL ?? "http://localhost:8000";

// ── Types ─────────────────────────────────────────────────────────
interface PhotoQuality {
  overall_score: number;
  lighting_score: number;
  clarity_score: number;
  background_score: number;
  issues: string[];
  suggestions: string[];
  approved: boolean;
  estimated_price_impact: string;
}

interface CounterfeitResult {
  is_authentic: boolean;
  confidence: number;
  risk_level: string;
  flags: string[];
  recommendation: string;
  reasoning: string;
}

interface DuplicateResult {
  has_duplicates: boolean;
  duplicate_auction_ids: string[];
  similarity_scores: number[];
  recommendation: string;
}

interface ListingGuardProps {
  imageFile: File | null;
  title: string;
  description: string;
  category: string;
  sellerId: string;
  startingPrice: number;
  onApproved: (approved: boolean) => void;
}

// ── Score ring component ──────────────────────────────────────────
function ScoreRing({ score, max = 10, label, color }: {
  score: number; max?: number; label: string; color: string;
}) {
  const r = 20;
  const circ = 2 * Math.PI * r;
  const pct  = score / max;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="56" height="56" viewBox="0 0 56 56">
        <circle cx="28" cy="28" r={r} fill="none" stroke="#f3f4f6" strokeWidth="4" />
        <circle
          cx="28" cy="28" r={r} fill="none"
          stroke={color} strokeWidth="4"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
          strokeLinecap="round"
          transform="rotate(-90 28 28)"
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
        <text x="28" y="33" textAnchor="middle" fontSize="13" fontWeight="600" fill={color}>
          {score.toFixed(1)}
        </text>
      </svg>
      <span className="text-[10px] text-neutral-500">{label}</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────
export function ListingGuard({
  imageFile, title, description, category, sellerId, startingPrice, onApproved
}: ListingGuardProps) {
  const [loading, setLoading] = useState(false);
  const [quality, setQuality]     = useState<PhotoQuality | null>(null);
  const [counterfeit, setCounterfeit] = useState<CounterfeitResult | null>(null);
  const [duplicate, setDuplicate] = useState<DuplicateResult | null>(null);
  const [error, setError]         = useState<string | null>(null);

  const runChecks = useCallback(async () => {
    if (!imageFile || !title) return;
    setLoading(true);
    setError(null);

    try {
      // Run all 3 checks in parallel
      const [qualityRes, counterfeitRes, duplicateRes] = await Promise.allSettled([
        // Photo quality
        (async () => {
          const fd = new FormData();
          fd.append("image", imageFile);
          const r = await fetch(`${AI}/photo/quality-score`, { method: "POST", body: fd });
          return r.json() as Promise<PhotoQuality>;
        })(),

        // Counterfeit check
        (async () => {
          const fd = new FormData();
          fd.append("image", imageFile);
          fd.append("title", title);
          fd.append("description", description);
          fd.append("category", category);
          const r = await fetch(`${AI}/listing-guard/counterfeit-check`, { method: "POST", body: fd });
          return r.json() as Promise<CounterfeitResult>;
        })(),

        // Duplicate check
        fetch(`${AI}/listing-guard/duplicate-check`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title, description, category,
            seller_id: sellerId,
            starting_price: startingPrice,
          }),
        }).then(r => r.json() as Promise<DuplicateResult>),
      ]);

      const q = qualityRes.status === "fulfilled" ? qualityRes.value : null;
      const c = counterfeitRes.status === "fulfilled" ? counterfeitRes.value : null;
      const d = duplicateRes.status === "fulfilled" ? duplicateRes.value : null;

      setQuality(q);
      setCounterfeit(c);
      setDuplicate(d);

      // Determine overall approval
      const photoOk      = !q || q.approved;
      const counterfeitOk = !c || c.recommendation !== "reject";
      const duplicateOk  = !d || !d.has_duplicates;
      onApproved(photoOk && counterfeitOk && duplicateOk);

    } catch {
      setError("AI check failed — you can still submit manually.");
      onApproved(true); // don't block on AI failure
    } finally {
      setLoading(false);
    }
  }, [imageFile, title, description, category, sellerId, startingPrice]);

  // Auto-run when image + title are ready
  if (imageFile && title && !quality && !loading) {
    runChecks();
  }

  if (!imageFile && !title) return null;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 mt-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">AI listing check</span>
          {loading && (
            <div className="w-4 h-4 border-2 border-neutral-200 border-t-neutral-700 rounded-full animate-spin" />
          )}
        </div>
        {!loading && (quality || counterfeit || duplicate) && (
          <button onClick={runChecks} className="text-xs text-neutral-500 hover:text-neutral-700 underline">
            Re-check
          </button>
        )}
      </div>

      {error && <p className="text-xs text-amber-600">{error}</p>}

      {/* Photo Quality */}
      {quality && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-neutral-600">Photo quality</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              quality.approved ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
            }`}>
              {quality.approved ? "✓ Approved" : "✗ Needs improvement"}
            </span>
          </div>

          <div className="flex gap-4 justify-around mb-3">
            <ScoreRing score={quality.overall_score}   label="Overall"    color={quality.overall_score >= 7 ? "#16a34a" : "#ef4444"} />
            <ScoreRing score={quality.lighting_score}  label="Lighting"   color="#3b82f6" />
            <ScoreRing score={quality.clarity_score}   label="Clarity"    color="#8b5cf6" />
            <ScoreRing score={quality.background_score} label="Background" color="#f59e0b" />
          </div>

          {quality.issues.length > 0 && (
            <div className="space-y-1 mb-2">
              {quality.issues.map((issue, i) => (
                <div key={i} className="flex gap-2 text-xs text-red-600">
                  <span>✗</span><span>{issue}</span>
                </div>
              ))}
            </div>
          )}
          {quality.suggestions.length > 0 && (
            <div className="space-y-1">
              {quality.suggestions.map((s, i) => (
                <div key={i} className="flex gap-2 text-xs text-neutral-500">
                  <span>→</span><span>{s}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Counterfeit check */}
      {counterfeit && (
        <div className={`rounded-lg p-3 ${
          counterfeit.recommendation === "reject" ? "bg-red-50 border border-red-200" :
          counterfeit.recommendation === "review" ? "bg-amber-50 border border-amber-200" :
          "bg-green-50 border border-green-200"
        }`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium">Authenticity check</span>
            <span className={`text-xs font-medium ${
              counterfeit.recommendation === "reject" ? "text-red-700" :
              counterfeit.recommendation === "review" ? "text-amber-700" :
              "text-green-700"
            }`}>
              {counterfeit.recommendation === "approve" ? "✓ Looks authentic" :
               counterfeit.recommendation === "review"  ? "⚠ Needs review" : "✗ High risk"}
            </span>
          </div>
          <p className="text-xs text-neutral-600">{counterfeit.reasoning}</p>
          {counterfeit.flags.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {counterfeit.flags.map((f, i) => (
                <li key={i} className="text-xs text-red-600">• {f}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Duplicate check */}
      {duplicate && duplicate.has_duplicates && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
          <div className="text-xs font-medium text-amber-800 mb-1">Similar listing detected</div>
          <p className="text-xs text-amber-700">{duplicate.recommendation}</p>
          <p className="text-[11px] text-amber-600 mt-1">
            {duplicate.duplicate_auction_ids.length} similar active listing(s) found
          </p>
        </div>
      )}
    </div>
  );
}
export default ListingGuard;
