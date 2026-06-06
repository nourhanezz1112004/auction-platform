// apps/web/src/pages/CreateListing.tsx
// Full listing creation page with all AI pre-listing checks:
// - Photo quality score (auto-runs on upload)
// - Counterfeit detection (Claude vision)
// - Duplicate detector (pgvector)
// - Reserve price AI suggester
// - Optimal end-time recommender
// - Category auto-tagger (via describe endpoint)

import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient as axios } from "@/api/client";
import { useAuthStore } from "@/store/authStore";
import { ListingGuard } from "./ListingGuard";
import { ReservePriceSuggester } from "./ReservePriceSuggester";

const AI = import.meta.env.VITE_AI_SERVICE_URL ?? "http://localhost:8000";

const CATEGORIES = ["watches","cameras","art","jewelry","electronics","other"] as const;
const CONDITIONS = ["poor","fair","good","very good","excellent","mint"] as const;

interface OptimalTiming {
  best_day_of_week: string;
  best_hour: number;
  best_hour_label: string;
  estimated_premium_pct: number;
  reasoning: string;
}

export function CreateListing() {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  // Form state
  const [title, setTitle]             = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory]       = useState<typeof CATEGORIES[number]>("other");
  const [condition, setCondition]     = useState<typeof CONDITIONS[number]>("good");
  const [startingPrice, setStartingPrice] = useState("");
  const [reservePrice, setReservePrice]   = useState("");
  const [startTime, setStartTime]     = useState("");
  const [endTime, setEndTime]         = useState("");
  const [imageFiles, setImageFiles]   = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [aiApproved, setAiApproved]   = useState(true);
  const [autoDescribed, setAutoDescribed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch optimal timing
  const { data: timing } = useQuery<OptimalTiming>({
    queryKey: ["optimal-timing", category, condition, startingPrice],
    queryFn: () =>
      fetch(`${AI}/timing/optimal-end-time`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category, condition,
          starting_price: parseFloat(startingPrice) || 100,
          reserve_price: parseFloat(reservePrice) || 200,
        }),
      }).then(r => r.json()),
    enabled: !!category && !!condition && !!startingPrice,
    staleTime: 5 * 60_000,
  });

  // Auto-describe from first photo
  const autoDescribe = async (file: File) => {
    if (autoDescribed || !file) return;
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch(`${AI}/describe/item`, { method: "POST", body: fd });
      const data = await res.json();
      if (data.title && !title) setTitle(data.title);
      if (data.suggested_description && !description) setDescription(data.suggested_description);
      if (data.category) setCategory(data.category as any);
      if (data.condition) setCondition(data.condition as any);
      setAutoDescribed(true);
    } catch { /* silent fail */ }
  };

  // Handle image upload
  const handleImages = async (files: FileList) => {
    const arr = Array.from(files).slice(0, 10);
    setImageFiles(arr);
    const previews = await Promise.all(
      arr.map(f => new Promise<string>(resolve => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target?.result as string);
        reader.readAsDataURL(f);
      }))
    );
    setImagePreviews(previews);
    if (arr[0]) autoDescribe(arr[0]);
  };

  // Apply optimal timing suggestion
  const applyTiming = () => {
    if (!timing) return;
    const now = new Date();
    // Find next occurrence of best day
    const targetDow = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]
      .indexOf(timing.best_day_of_week);
    const daysUntil = (targetDow - now.getDay() + 7) % 7 || 7;
    const start = new Date(now.getTime() + 3_600_000); // start in 1h
    const end = new Date(now);
    end.setDate(end.getDate() + daysUntil);
    end.setHours(timing.best_hour, 0, 0, 0);
    setStartTime(start.toISOString().slice(0, 16));
    setEndTime(end.toISOString().slice(0, 16));
  };

  // Submit listing
  const createListing = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append("title", title);
      fd.append("description", description);
      fd.append("category", category);
      fd.append("condition", condition);
      fd.append("startingPrice", startingPrice);
      fd.append("reservePrice", reservePrice);
      fd.append("startTime", new Date(startTime).toISOString());
      fd.append("endTime", new Date(endTime).toISOString());
      imageFiles.forEach(f => fd.append("images", f));
      const res = await axios.post("/api/listings", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return res.data;
    },
    onSuccess: (data) => navigate(`/auctions/${data.id}`),
  });

  const canSubmit = title && description && startingPrice && reservePrice
    && startTime && endTime && imageFiles.length > 0 && aiApproved;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-xl font-semibold mb-6">Create listing</h1>

      <div className="space-y-5">
        {/* Photos */}
        <div>
          <label className="text-sm font-medium text-neutral-700 block mb-2">
            Photos <span className="text-red-500">*</span>
          </label>
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-neutral-300 rounded-xl p-6 text-center cursor-pointer hover:border-neutral-400 transition-colors"
          >
            {imagePreviews.length > 0 ? (
              <div className="grid grid-cols-4 gap-2">
                {imagePreviews.map((src, i) => (
                  <img key={i} src={src} alt="" className="aspect-square object-cover rounded-lg" />
                ))}
              </div>
            ) : (
              <div className="text-neutral-400">
                <div className="text-3xl mb-2">📸</div>
                <div className="text-sm">Click to upload photos (max 10)</div>
                <div className="text-xs mt-1">AI will auto-fill title and description</div>
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple accept="image/*"
            className="hidden"
            onChange={e => e.target.files && handleImages(e.target.files)}
          />
        </div>

        {/* AI listing guard — runs automatically on photo upload */}
        {imageFiles[0] && user && (
          <ListingGuard
            imageFile={imageFiles[0]}
            title={title}
            description={description}
            category={category}
            sellerId={user.id}
            startingPrice={parseFloat(startingPrice) || 0}
            onApproved={setAiApproved}
          />
        )}

        {/* Title */}
        <div>
          <label className="text-sm font-medium text-neutral-700 block mb-1.5">
            Title <span className="text-red-500">*</span>
            {autoDescribed && <span className="ml-2 text-xs text-green-600">✦ AI suggested</span>}
          </label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Rolex Submariner 116610LN (2019)"
            maxLength={120}
            className="w-full px-3 py-2.5 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:border-neutral-400"
          />
          <div className="text-xs text-neutral-400 text-right mt-1">{title.length}/120</div>
        </div>

        {/* Description */}
        <div>
          <label className="text-sm font-medium text-neutral-700 block mb-1.5">Description <span className="text-red-500">*</span></label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={4}
            placeholder="Describe the item — condition, provenance, included accessories…"
            className="w-full px-3 py-2.5 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:border-neutral-400 resize-none"
          />
        </div>

        {/* Category + Condition */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-neutral-700 block mb-1.5">Category</label>
            <select value={category} onChange={e => setCategory(e.target.value as any)}
              className="w-full px-3 py-2.5 rounded-xl border border-neutral-200 text-sm focus:outline-none bg-white">
              {CATEGORIES.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-neutral-700 block mb-1.5">Condition</label>
            <select value={condition} onChange={e => setCondition(e.target.value as any)}
              className="w-full px-3 py-2.5 rounded-xl border border-neutral-200 text-sm focus:outline-none bg-white">
              {CONDITIONS.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
            </select>
          </div>
        </div>

        {/* Prices */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-neutral-700 block mb-1.5">Starting price</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">$</span>
              <input type="number" value={startingPrice} onChange={e => setStartingPrice(e.target.value)}
                placeholder="100" min="1"
                className="w-full pl-7 pr-3 py-2.5 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:border-neutral-400" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-neutral-700 block mb-1.5">Reserve price</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">$</span>
              <input type="number" value={reservePrice} onChange={e => setReservePrice(e.target.value)}
                placeholder="500" min="1"
                className="w-full pl-7 pr-3 py-2.5 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:border-neutral-400" />
            </div>
          </div>
        </div>

        {/* AI reserve suggester */}
        {category && condition && startingPrice && (
          <ReservePriceSuggester
            category={category}
            condition={condition}
            startingPrice={parseFloat(startingPrice)}
            onAccept={(val) => setReservePrice(String(val))}
          />
        )}

        {/* Timing */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-neutral-700 block mb-1.5">Start time</label>
            <input type="datetime-local" value={startTime} onChange={e => setStartTime(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:border-neutral-400" />
          </div>
          <div>
            <label className="text-sm font-medium text-neutral-700 block mb-1.5">End time</label>
            <input type="datetime-local" value={endTime} onChange={e => setEndTime(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:border-neutral-400" />
          </div>
        </div>

        {/* AI optimal timing suggestion */}
        {timing && (
          <div className="rounded-xl bg-blue-50 border border-blue-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-medium text-blue-800 mb-1">✦ AI recommends closing on</div>
                <div className="text-sm font-semibold text-blue-900">
                  {timing.best_day_of_week} at {timing.best_hour_label}
                </div>
                <div className="text-xs text-blue-700 mt-1">
                  {timing.estimated_premium_pct > 0
                    ? `+${timing.estimated_premium_pct}% above reserve on average`
                    : timing.reasoning}
                </div>
              </div>
              <button onClick={applyTiming}
                className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-blue-700 text-white text-xs font-medium hover:bg-blue-800">
                Apply
              </button>
            </div>
          </div>
        )}

        {/* Submit */}
        {!aiApproved && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            ✗ AI check failed — please fix the issues above before submitting
          </div>
        )}

        <button
          onClick={() => createListing.mutate()}
          disabled={!canSubmit || createListing.isPending}
          className="w-full py-3.5 rounded-xl bg-neutral-900 text-white font-medium text-sm hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {createListing.isPending ? "Creating listing…" : "Create listing"}
        </button>

        {createListing.isError && (
          <p className="text-sm text-red-600 text-center">
            {(createListing.error as any)?.response?.data?.error ?? "Failed to create listing"}
          </p>
        )}
      </div>
    </div>
  );
}

export default CreateListing;
