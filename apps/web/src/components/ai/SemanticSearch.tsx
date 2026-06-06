// apps/web/src/components/ai/SemanticSearch.tsx
// Replaces keyword search with vector-based semantic search.
// Uses TanStack Query + your Axios interceptor + TailwindCSS v4.
// Drop into your header/navigation as the primary search bar.

import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { apiClient as axios } from "@/api/client";

interface SearchResult {
  id: string;
  title: string;
  category: string;
  condition: string;
  current_price: number;
  end_time: string;
  similarity: number;
  image_urls: string[];
}

const AI_SERVICE = import.meta.env.VITE_AI_SERVICE_URL ?? "http://localhost:8000";

function useSemanticSearch(query: string, enabled: boolean) {
  return useQuery<{ results: SearchResult[]; total: number }>({
    queryKey: ["semantic-search", query],
    queryFn: async () => {
      const res = await fetch(`${AI_SERVICE}/search/semantic`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, limit: 8, status: "ACTIVE" }),
      });
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled: enabled && query.length >= 2,
    staleTime: 30_000,
  });
}

function timeLeft(endTime: string): string {
  const diff = new Date(endTime).getTime() - Date.now();
  if (diff <= 0) return "Ended";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return h > 24 ? `${Math.floor(h / 24)}d` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function SemanticSearch() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const navigate = useNavigate();

  const { data, isFetching } = useSemanticSearch(debouncedQuery, open);

  function handleChange(val: string) {
    setQuery(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(val), 400);
    setOpen(val.length >= 2);
  }

  function handleSelect(id: string) {
    setOpen(false);
    setQuery("");
    navigate(`/auctions/${id}`);
  }

  return (
    <div className="relative w-full max-w-xl">
      {/* Search input */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={e => handleChange(e.target.value)}
          onFocus={() => query.length >= 2 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search auctions… try 'vintage Japanese camera'"
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-neutral-200 bg-white text-sm placeholder-neutral-400 focus:outline-none focus:border-neutral-400 focus:ring-2 focus:ring-neutral-100"
        />
        {isFetching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-neutral-300 border-t-neutral-700 rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* AI label */}
      {query.length >= 2 && (
        <div className="absolute -bottom-5 left-0 text-[11px] text-neutral-400 flex items-center gap-1">
          <span>✦</span><span>AI semantic search</span>
        </div>
      )}

      {/* Dropdown results */}
      {open && data && (
        <div className="absolute top-full left-0 right-0 mt-2 rounded-xl border border-neutral-200 bg-white shadow-lg overflow-hidden z-50">
          {data.results.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-neutral-500">
              No matching auctions found
            </div>
          ) : (
            <>
              <div className="px-4 py-2 text-xs text-neutral-400 border-b border-neutral-100">
                {data.total} results for "{debouncedQuery}"
              </div>
              <ul>
                {data.results.map(result => (
                  <li
                    key={result.id}
                    onMouseDown={() => handleSelect(result.id)}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 cursor-pointer border-b border-neutral-100 last:border-0"
                  >
                    {/* Thumbnail */}
                    <div className="w-10 h-10 rounded-lg bg-neutral-100 overflow-hidden flex-shrink-0">
                      {result.image_urls[0] ? (
                        <img src={result.image_urls[0]} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-neutral-300 text-lg">📦</div>
                      )}
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{result.title}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-neutral-500 capitalize">{result.category}</span>
                        <span className="text-neutral-300">·</span>
                        <span className="text-xs text-neutral-500 capitalize">{result.condition}</span>
                        <span className="text-neutral-300">·</span>
                        <span className="text-xs text-neutral-500">{timeLeft(result.end_time)} left</span>
                      </div>
                    </div>

                    {/* Price + similarity */}
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm font-medium">${result.current_price.toLocaleString()}</div>
                      <div className="text-[10px] text-neutral-400 mt-0.5">
                        {Math.round(result.similarity * 100)}% match
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <div
                onMouseDown={() => { setOpen(false); navigate(`/search?q=${encodeURIComponent(query)}`); }}
                className="px-4 py-2.5 text-xs text-center text-neutral-500 hover:bg-neutral-50 cursor-pointer border-t border-neutral-100"
              >
                See all results for "{debouncedQuery}" →
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
export default SemanticSearch;
