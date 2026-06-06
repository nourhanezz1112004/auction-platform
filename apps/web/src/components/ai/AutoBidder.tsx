/**
 * AutoBidder — AI-powered autobidding widget.
 * User sets max budget + strategy, the component polls the AI every N seconds
 * and automatically calls placeBid() when the AI says should_bid = true.
 */

import { useState, useEffect, useRef } from 'react'
import { Bot, Play, Square, ChevronDown } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { getAutobidDecision } from '@/api/ai'
import { placeBid } from '@/api/bids'
import type { AutobidStrategy } from '@/api/ai'
import type { Auction } from '@/api/auctions'

interface Props {
  auction: Auction
  bidCount: number
}

const STRATEGIES: { value: AutobidStrategy; label: string; desc: string }[] = [
  { value: 'conservative', label: 'Conservative', desc: 'Bid only with ample budget headroom' },
  { value: 'value',        label: 'Value',        desc: 'Bid while price is well below budget' },
  { value: 'aggressive',   label: 'Aggressive',   desc: 'Stay at the top regardless of competition' },
  { value: 'sniper',       label: 'Sniper',       desc: 'Wait until the final hour' },
]

export function AutoBidder({ auction, bidCount }: Props) {
  const [enabled,    setEnabled]    = useState(false)
  const [maxBudget,  setMaxBudget]  = useState('')
  const [strategy,   setStrategy]   = useState<AutobidStrategy>('conservative')
  const [statusMsg,  setStatusMsg]  = useState<string>('')
  const [open,       setOpen]       = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const queryClient = useQueryClient()

  const budgetNum = Number(maxBudget)
  const valid = budgetNum > auction.currentPrice && !isNaN(budgetNum)

  const bidMutation = useMutation({
    mutationFn: (amount: number) => placeBid({ auctionId: auction.id, amount }),
    onSuccess: (data) => {
      queryClient.setQueryData(['auction', auction.id], (old: any) => ({
        ...old,
        currentPrice: data.newHighestBid,
      }))
      toast.success(`AutoBid placed: $${data.newHighestBid.toLocaleString()}`)
    },
    onError: () => {
      setEnabled(false)
      setStatusMsg('AutoBidder stopped — bid was rejected.')
    },
  })

  // Main polling loop
  useEffect(() => {
    if (!enabled || !valid) return

    const evaluate = async () => {
      try {
        const decision = await getAutobidDecision({
          auctionId:    auction.id,
          currentPrice: auction.currentPrice,
          maxBudget:    budgetNum,
          strategy,
          endsAt:       auction.endsAt,
          bidCount,
        })

        setStatusMsg(decision.reasoning)

        if (decision.should_bid && decision.bid_amount > auction.currentPrice) {
          await bidMutation.mutateAsync(decision.bid_amount)
        }

        timerRef.current = setTimeout(evaluate, decision.next_check_s * 1000)
      } catch {
        timerRef.current = setTimeout(evaluate, 60_000)
      }
    }

    evaluate()

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, strategy, budgetNum, auction.currentPrice])

  if (auction.status !== 'ACTIVE') return null

  return (
    <div className="border border-border-base rounded-none bg-bg-surface">
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <Bot className={`w-3.5 h-3.5 ${enabled ? 'text-primary animate-pulse' : 'text-text-tertiary'}`} />
          <span className="text-[9px] font-bold uppercase tracking-widest font-mono text-text-secondary">
            AI AutoBidder {enabled ? '— Active' : ''}
          </span>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-text-tertiary transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-border-base pt-4">
          {/* Budget input */}
          <div>
            <label className="text-[9px] font-bold uppercase tracking-widest text-text-tertiary font-mono block mb-1.5">
              Max Budget (USD)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary text-xs font-mono">$</span>
              <input
                type="number"
                value={maxBudget}
                onChange={e => setMaxBudget(e.target.value)}
                disabled={enabled}
                placeholder={`${auction.currentPrice + 50}`}
                className="w-full pl-7 pr-3 py-2.5 rounded-none border border-border-base bg-white text-xs font-mono text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-primary transition-all disabled:opacity-50"
              />
            </div>
          </div>

          {/* Strategy selector */}
          <div>
            <label className="text-[9px] font-bold uppercase tracking-widest text-text-tertiary font-mono block mb-1.5">
              Strategy
            </label>
            <div className="grid grid-cols-2 gap-2">
              {STRATEGIES.map(s => (
                <button
                  key={s.value}
                  onClick={() => !enabled && setStrategy(s.value)}
                  disabled={enabled}
                  className={`text-left px-3 py-2 rounded-none border text-[9px] font-mono uppercase tracking-widest transition-all cursor-pointer disabled:opacity-50 ${
                    strategy === s.value
                      ? 'border-primary bg-primary/5 text-primary font-bold'
                      : 'border-border-base text-text-tertiary hover:border-text-secondary'
                  }`}
                >
                  <span className="block font-bold">{s.label}</span>
                  <span className="block text-[8px] normal-case tracking-normal mt-0.5 opacity-70">{s.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Status message */}
          {statusMsg && (
            <p className="text-[9px] font-mono text-text-secondary bg-bg-tertiary/30 px-3 py-2 border border-border-base rounded-none">
              {statusMsg}
            </p>
          )}

          {/* Toggle button */}
          <button
            onClick={() => {
              if (!valid && !enabled) {
                toast.error('Set a valid max budget first')
                return
              }
              setEnabled(e => !e)
              if (enabled) setStatusMsg('')
            }}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-none text-[9px] font-bold uppercase tracking-widest font-mono transition-all cursor-pointer border ${
              enabled
                ? 'bg-danger-light border-danger/30 text-danger hover:bg-danger hover:text-white'
                : 'bg-primary border-primary text-white hover:bg-primary-dark'
            }`}
          >
            {enabled ? <><Square className="w-3 h-3" /> Stop AutoBidder</> : <><Play className="w-3 h-3" /> Start AutoBidder</>}
          </button>
        </div>
      )}
    </div>
  )
}
export default AutoBidder;
