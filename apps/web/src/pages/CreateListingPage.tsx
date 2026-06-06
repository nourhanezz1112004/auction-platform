// apps/web/src/pages/CreateListingPage.tsx
// Updated: added AutoCategorizer (step 0) + SmartPriceSuggester (step 1)
// Both are non-blocking — seller can ignore them

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, X, Check, ChevronRight, Loader2, ImagePlus } from 'lucide-react'
import { createAuction } from '@/api/auctions'
import { apiClient, getErrorMessage } from '@/api/client'
import toast from 'react-hot-toast'
import axios from 'axios'
import { ReserveSuggester, ListingGuard } from '@/components/ai'
import { SmartPriceSuggester } from '@/components/ai/SmartPriceSuggester'
import { AutoCategorizer } from '@/components/ai/AutoCategorizer'

const CATEGORIES = ['watches', 'cameras', 'art', 'jewellery', 'electronics']
const CONDITIONS  = ['poor', 'fair', 'good', 'very good', 'excellent', 'mint']
const STEPS = ['Details', 'Pricing', 'Images', 'Review']

type ListingFormData = {
  title: string
  description: string
  category: string
  condition: string
  startingPrice: string
  reservePrice: string
  startsAt: string
  endsAt: string
  imageUrls: string[]
}

const initial: ListingFormData = {
  title: '',
  description: '',
  category: '',
  condition: 'good',
  startingPrice: '',
  reservePrice: '',
  startsAt: '',
  endsAt: '',
  imageUrls: [],
}

export function CreateListingPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<ListingFormData>(initial)
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [auctionId, setAuctionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [previewActive, setPreviewActive] = useState(false)

  function set(key: keyof ListingFormData, value: string | string[]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function canNext() {
    if (step === 0) return form.title.length > 3 && form.description.length > 10 && form.category
    if (step === 1) {
      if (!form.startsAt || !form.endsAt) return false
      const start = new Date(form.startsAt).getTime()
      const end = new Date(form.endsAt).getTime()
      const now = Date.now()
      return Number(form.startingPrice) > 0 && start >= now - 60000 && end > start
    }
    return true
  }

  async function handleCreateDraft() {
    setSubmitting(true)
    setError(null)
    try {
      const auction = await createAuction({
        title: form.title,
        description: form.description,
        category: form.category,
        startingPrice: Number(form.startingPrice),
        reservePrice: Number(form.reservePrice) || Number(form.startingPrice),
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
      })
      setAuctionId(auction.id)
      setStep(2)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length || !auctionId) return
    setUploading(true)
    try {
      const urls: string[] = []
      for (const file of files) {
        if (file.size > 10 * 1024 * 1024) { toast.error('Image must be under 10 MB'); continue }
        const formData = new FormData()
        formData.append('file', file)
        formData.append('auctionId', auctionId)
        const res = await apiClient.post<{ url: string }>('/media/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 60000,
        })
        urls.push(res.data.url)
      }
      set('imageUrls', [...form.imageUrls, ...urls])
      toast.success(`${urls.length} image${urls.length !== 1 ? 's' : ''} uploaded`)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setUploading(false)
      if (e.target) e.target.value = ''
    }
  }

  async function handleFinish() {
    setSubmitting(true)
    try {
      if (auctionId) {
        await apiClient.patch(`/auctions/${auctionId}`, { status: 'ACTIVE' })
      }
      toast.success('Listing published!')
      navigate(`/auctions/${auctionId}`)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-10 px-4 space-y-8">

      {/* Header */}
      <div>
        <h1 className="font-serif italic text-3xl md:text-5xl font-medium text-text-primary mb-1">
          Create Listing
        </h1>
        <p className="font-mono text-[10px] tracking-widest text-text-secondary uppercase">
          Consign your item to the archive
        </p>
      </div>

      {/* Step Indicators */}
      <div className="flex items-center gap-0">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center flex-1">
            <div className={`flex items-center justify-center w-7 h-7 rounded-none border text-[10px] font-bold font-mono transition-all ${
              i < step ? 'bg-primary border-primary text-white'
              : i === step ? 'border-primary text-primary bg-primary/5'
              : 'border-border-base text-text-tertiary bg-bg-surface'
            }`}>
              {i < step ? <Check className="w-3.5 h-3.5" /> : i + 1}
            </div>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-px transition-all ${i < step ? 'bg-primary' : 'bg-border-base'}`} />
            )}
          </div>
        ))}
      </div>
      <p className="font-mono text-[10px] tracking-widest text-text-secondary uppercase text-right">
        Step {step + 1} — {STEPS[step]}
      </p>

      {/* Form Steps */}
      <AnimatePresence mode="wait">

        {/* Step 0 — Details */}
        {step === 0 && (
          <motion.div
            key="s0"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.2 }}
            className="space-y-5"
          >
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-text-primary font-sans">Title</label>
              <input
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                placeholder="e.g. Vintage Rolex Submariner 1968"
                className="w-full px-4 py-3 rounded-none border border-border-base bg-bg-surface text-xs uppercase tracking-wider text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-primary transition-all font-sans"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-text-primary font-sans">Description & Provenance</label>
              <textarea
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder="Describe the item's condition, historical provenance, and specifications..."
                rows={5}
                className="w-full px-4 py-3 rounded-none border border-border-base bg-bg-surface text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-primary transition-all resize-none font-sans"
              />
            </div>

            {/* AI — Auto Categorizer */}
            <AutoCategorizer
              title={form.title}
              description={form.description}
              currentCategory={form.category}
              onAccept={(cat) => set('category', cat)}
            />

            <div className="space-y-2.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-text-primary font-sans">Category</label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => set('category', cat)}
                    className={`px-4 py-2 rounded-none text-xs font-bold uppercase tracking-wider transition-all border cursor-pointer ${
                      form.category === cat
                        ? 'bg-primary border-primary text-white'
                        : 'bg-bg-surface border-border-base text-text-secondary hover:border-text-secondary'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-text-primary font-sans">Condition</label>
              <div className="flex flex-wrap gap-2">
                {CONDITIONS.map((cond) => (
                  <button
                    key={cond}
                    onClick={() => set('condition', cond)}
                    className={`px-3 py-1.5 rounded-none text-xs font-bold uppercase tracking-wider transition-all border cursor-pointer capitalize ${
                      form.condition === cond
                        ? 'bg-primary border-primary text-white'
                        : 'bg-bg-surface border-border-base text-text-secondary hover:border-text-secondary'
                    }`}
                  >
                    {cond}
                  </button>
                ))}
              </div>
            </div>

            {/* AI — Listing Guard */}
            <ListingGuard
              title={form.title}
              description={form.description}
              category={form.category}
            />
          </motion.div>
        )}

        {/* Step 1 — Pricing */}
        {step === 1 && (
          <motion.div
            key="s1"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.2 }}
            className="space-y-5"
          >
            {/* AI Smart Price Suggester — shown first, before inputs */}
            {form.category && (
              <SmartPriceSuggester
                title={form.title}
                category={form.category}
                condition={form.condition}
                onApply={(starting, reserve) => {
                  set('startingPrice', String(starting))
                  set('reservePrice', String(reserve))
                }}
              />
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-text-primary font-sans">Starting Price</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary text-xs font-mono">$</span>
                  <input
                    type="number"
                    value={form.startingPrice}
                    onChange={(e) => set('startingPrice', e.target.value)}
                    placeholder="100"
                    min="1"
                    className="w-full pl-8 pr-4 py-3 rounded-none border border-border-base bg-bg-surface text-xs uppercase tracking-wider text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-primary transition-all font-sans"
                  />
                </div>
                <p className="text-[9px] text-text-tertiary font-sans leading-relaxed">Minimum amount for the first bid.</p>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-text-primary font-sans">
                  Reserve Price <span className="text-text-tertiary font-normal text-[9px] font-mono normal-case">(optional)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary text-xs font-mono">$</span>
                  <input
                    type="number"
                    value={form.reservePrice}
                    onChange={(e) => set('reservePrice', e.target.value)}
                    placeholder="500"
                    min="0"
                    className="w-full pl-8 pr-4 py-3 rounded-none border border-border-base bg-bg-surface text-xs uppercase tracking-wider text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-primary transition-all font-sans"
                  />
                </div>
                <p className="text-[9px] text-text-tertiary font-sans leading-relaxed">Hidden minimum. Item only sells if reserve is met.</p>
              </div>

              {/* AI Reserve Suggester (existing) */}
              {form.category && Number(form.startingPrice) > 0 && (
                <div className="col-span-full">
                  <ReserveSuggester
                    category={form.category}
                    startingPrice={Number(form.startingPrice)}
                    title={form.title}
                    onApply={(value) => set('reservePrice', value)}
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-text-primary font-sans">Auction Start</label>
                <input
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) => set('startsAt', e.target.value)}
                  className="w-full px-4 py-3 rounded-none border border-border-base bg-bg-surface text-xs uppercase tracking-wider text-text-primary focus:outline-none focus:border-primary transition-all font-sans"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-text-primary font-sans">Auction End</label>
                <input
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(e) => set('endsAt', e.target.value)}
                  className="w-full px-4 py-3 rounded-none border border-border-base bg-bg-surface text-xs uppercase tracking-wider text-text-primary focus:outline-none focus:border-primary transition-all font-sans"
                />
              </div>
            </div>

            {error && (
              <div className="px-4 py-3 border border-danger/30 bg-danger/5 text-danger text-xs rounded-none">
                {error}
              </div>
            )}

            <button
              onClick={handleCreateDraft}
              disabled={!canNext() || submitting}
              className="w-full py-3.5 rounded-none bg-primary text-white text-[10px] font-bold uppercase tracking-widest hover:bg-primary-dark disabled:opacity-40 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Save & Continue to Images
              <ChevronRight className="w-4 h-4" />
            </button>
          </motion.div>
        )}

        {/* Step 2 — Images */}
        {step === 2 && (
          <motion.div
            key="s2"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.2 }}
            className="space-y-5"
          >
            <div className="border-2 border-dashed border-border-base rounded-none p-10 text-center bg-bg-surface">
              <ImagePlus className="w-10 h-10 text-text-tertiary mx-auto mb-4 opacity-50" />
              <p className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-2">Upload Item Photos</p>
              <p className="text-[9px] font-mono text-text-tertiary uppercase tracking-widest mb-5">JPEG or PNG · Max 10 MB each</p>
              <label className="cursor-pointer px-6 py-2.5 rounded-none bg-primary text-white text-[10px] font-bold uppercase tracking-widest hover:bg-primary-dark transition-all">
                {uploading ? 'Uploading…' : 'Select Images'}
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageUpload}
                  disabled={uploading}
                />
              </label>
            </div>

            {form.imageUrls.length > 0 && (
              <div className="grid grid-cols-3 gap-3">
                {form.imageUrls.map((url, i) => (
                  <div key={i} className="relative aspect-square bg-bg-tertiary rounded-none overflow-hidden border border-border-base">
                    <img src={url} alt={`Image ${i + 1}`} className="w-full h-full object-cover" />
                    <button
                      onClick={() => set('imageUrls', form.imageUrls.filter((_, idx) => idx !== i))}
                      className="absolute top-1.5 right-1.5 w-6 h-6 rounded-none bg-danger text-white flex items-center justify-center hover:bg-danger/90 transition-all cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => setStep(3)}
              className="w-full py-3.5 rounded-none bg-primary text-white text-[10px] font-bold uppercase tracking-widest hover:bg-primary-dark transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              Continue to Review
              <ChevronRight className="w-4 h-4" />
            </button>
          </motion.div>
        )}

        {/* Step 3 — Review */}
        {step === 3 && (
          <motion.div
            key="s3"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            <div className="bg-bg-surface border border-border-base rounded-none p-6 space-y-4">
              <h2 className="font-serif italic text-xl font-medium text-text-primary">{form.title}</h2>
              <p className="text-xs text-text-secondary leading-relaxed">{form.description}</p>
              <div className="grid grid-cols-2 gap-3 pt-2">
                {[
                  ['Category', form.category],
                  ['Condition', form.condition],
                  ['Starting Price', `$${Number(form.startingPrice).toLocaleString()}`],
                  ['Reserve Price', form.reservePrice ? `$${Number(form.reservePrice).toLocaleString()}` : 'None'],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-text-tertiary">{label}</p>
                    <p className="text-xs font-mono text-text-primary capitalize">{value}</p>
                  </div>
                ))}
              </div>
              {form.imageUrls.length > 0 && (
                <div className="flex gap-2 pt-2 overflow-x-auto">
                  {form.imageUrls.slice(0, 4).map((url, i) => (
                    <img key={i} src={url} alt="" className="w-16 h-16 object-cover rounded-none border border-border-base shrink-0" />
                  ))}
                  {form.imageUrls.length > 4 && (
                    <div className="w-16 h-16 bg-bg-tertiary border border-border-base flex items-center justify-center shrink-0">
                      <span className="text-[10px] font-mono text-text-tertiary">+{form.imageUrls.length - 4}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={handleFinish}
              disabled={submitting}
              className="w-full py-3.5 rounded-none bg-primary text-white text-[10px] font-bold uppercase tracking-widest hover:bg-primary-dark disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Publish Listing
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Back Button */}
      {step > 0 && step < 3 && (
        <button
          onClick={() => setStep(s => s - 1)}
          className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary hover:text-text-primary transition-colors cursor-pointer"
        >
          ← Back
        </button>
      )}
    </div>
  )
}
