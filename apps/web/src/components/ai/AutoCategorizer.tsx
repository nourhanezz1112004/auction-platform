// apps/web/src/components/ai/AutoCategorizer.tsx
// Detects category automatically from the listing title + description.
// Shows a suggestion banner the seller can accept or dismiss.

import { useEffect, useState } from "react";
import { Sparkles, Check, X } from "lucide-react";

const AI_URL = (import.meta as any).env?.VITE_AI_SERVICE_URL ?? "http://localhost:8000";

interface AutoCategorizeResponse {
  category: string;
  confidence: number;
  runner_up: string | null;
  method: string;
  reasoning: string;
}

interface Props {
  title: string;
  description?: string;
  currentCategory: string;
  onAccept: (category: string) => void;
}

const CATEGORIES = ["watches", "cameras", "art", "jewelry", "electronics", "other"];

export function AutoCategorizer({ title, description, currentCategory, onAccept }: Props) {
  const [suggestion, setSuggestion] = useState<AutoCategorizeResponse | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (title.length < 5) { setSuggestion(null); return; }
    setDismissed(false);

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`${AI_URL}/listing/auto-categorize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, description: description ?? "" }),
        });
        if (res.ok) {
          const data: AutoCategorizeResponse = await res.json();
          // Only suggest if different from current and confidence is reasonable
          if (data.category !== currentCategory && data.confidence >= 0.45) {
            setSuggestion(data);
          } else {
            setSuggestion(null);
          }
        }
      } catch {
        // AI unavailable — silent fail
      } finally {
        setLoading(false);
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [title, description]);

  if (dismissed || !suggestion || loading) return null;

  const confidencePct = Math.round(suggestion.confidence * 100);

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-none bg-primary/5 border border-primary/20">
      <Sparkles className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-text-primary">
          AI suggests:{" "}
          <span className="font-bold capitalize">{suggestion.category}</span>
          <span className="font-mono text-text-tertiary ml-1.5 text-[10px]">({confidencePct}% confidence)</span>
        </p>
        {suggestion.runner_up && (
          <p className="text-[9px] text-text-tertiary font-mono mt-0.5">
            Runner-up: {suggestion.runner_up}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => { onAccept(suggestion.category); setSuggestion(null); }}
          className="flex items-center gap-1 px-3 py-1.5 rounded-none bg-primary text-white text-[9px] font-bold uppercase tracking-widest hover:bg-primary-dark transition-all cursor-pointer"
        >
          <Check className="w-3 h-3" /> Apply
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="p-1.5 rounded-none text-text-tertiary hover:text-text-primary transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export default AutoCategorizer;
