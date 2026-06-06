/**
 * ReserveSuggester — AI reserve price suggestion widget for CreateListingPage.
 * Shown after the user fills in category + starting price in step 1.
 */

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Sparkles, ChevronDown, Check } from 'lucide-react'
import { getReserveSuggestion } from '@/api/ai'
import type { ItemCondition } from '@/api/ai'

interface Props {
  category:      string
  startingPrice: number
  title:         string
  onApply:       (value: string) => void
}

const CONDITIONS: { value: ItemCondition; label: string }[] = [
  { value: 'poor',      label: 'Poor' },
  { value: 'fair',      label: 'Fair' },
  { value: 'good',      label: 'Good' },
  { value: 'excellent', label: 'Excellent' },
  { value: 'mint',      label: 'Mint' },
]

const CONFIDENCE_COLORS = {
  low:    'text-text-tertiary',
  medium: 'text-warning',
  high:   'text-primary',
}

export function ReserveSuggester({ category, startingPrice, title, onApply }: Props) {
  const [condition, setCondition] = useState<ItemCondition>('good')
  const [applied,   setApplied]   = useState(false)

  const enabled = !!category && startingPrice > 0 && title.length > 2

  const { data, isLoading, isFetching } = useQuery({
    queryKey:  ['reserve-suggestion', category, startingPrice, title, condition],
    queryFn:   () => getReserveSuggestion({ category, startingPrice, title, condition }),
    enabled,
    staleTime: 60_000,
  })

  if (!enabled) return null

  function handleApply(value: number) {
    onApply(String(Math.round(value)))
    setApplied(true)
    setTimeout(() => setApplied(false), 2000)
  }

  return (
    <div className="border border-primary/20 bg-primary/3 rounded-none p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-primary" />
        <span className="text-[9px] font-bold uppercase tracking-widest text-primary font-mono">
          AI Reserve Suggestion
        </span>
        {(isLoading || isFetching) && (
          <span className="w-3 h-3 border border-primary/30 border-t-primary rounded-none animate-spin ml-auto" />
        )}
      </div>

      {/* Condition selector */}
      <div className="flex gap-1.5 flex-wrap">
        {CONDITIONS.map(c => (
          <button
            key={c.value}
            onClick={() => setCondition(c.value)}
            className={`px-2.5 py-1 rounded-none text-[8px] font-bold uppercase tracking-widest font-mono border transition-all cursor-pointer ${
              condition === c.value
                ? 'bg-primary text-white border-primary'
                : 'bg-white border-border-base text-text-tertiary hover:border-primary/50'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {data && data.suggested_low > 0 && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-mono text-lg font-bold text-text-primary">
                ${data.suggested_low.toLocaleString()} – ${data.suggested_high.toLocaleString()}
              </p>
              <p className={`text-[8px] font-mono uppercase tracking-widest mt-0.5 ${CONFIDENCE_COLORS[data.confidence]}`}>
                {data.confidence} confidence
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => handleApply(data.suggested_low)}
                className="px-3 py-1.5 rounded-none text-[8px] font-bold uppercase tracking-widest font-mono border border-border-base bg-white text-text-secondary hover:border-primary/50 transition-all cursor-pointer"
              >
                Low
              </button>
              <button
                onClick={() => handleApply(data.suggested_high)}
                className={`px-3 py-1.5 rounded-none text-[8px] font-bold uppercase tracking-widest font-mono border transition-all cursor-pointer flex items-center gap-1 ${
                  applied
                    ? 'bg-primary border-primary text-white'
                    : 'bg-primary/5 border-primary/30 text-primary hover:bg-primary hover:text-white'
                }`}
              >
                {applied && <Check className="w-2.5 h-2.5" />}
                {applied ? 'Applied' : 'High'}
              </button>
            </div>
          </div>

          <p className="text-[8px] font-mono text-text-tertiary leading-relaxed border-t border-border-base/50 pt-2">
            {data.reasoning}
          </p>
        </>
      )}
    </div>
  )
}
export default ReserveSuggester;
