import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Star, Send, Loader2 } from 'lucide-react'
import { useReviews, useCreateReview } from '@/hooks/useAuctions'
import { useAuthStore } from '@/store/authStore'
import { formatDistanceToNow } from 'date-fns'
import { getErrorMessage } from '@/api/client'
import toast from 'react-hot-toast'
import { useAuctionBids } from '@/hooks/useAuctions'
import { getMyBids } from '@/api/bids'
import { useQuery } from '@tanstack/react-query'

type Props = {
  auctionId: string
  winnerId: string | null
  status: string
}

function StarRating({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  const [hover, setHover] = useState(0)
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange?.(star)}
          onMouseEnter={() => onChange && setHover(star)}
          onMouseLeave={() => onChange && setHover(0)}
          className={onChange ? 'cursor-pointer' : 'cursor-default'}
        >
          <Star
            className={`w-5 h-5 transition-colors ${
              star <= (hover || value)
                ? 'text-warning fill-warning'
                : 'text-border'
            }`}
          />
        </button>
      ))}
    </div>
  )
}

export function ReviewSection({ auctionId, winnerId, status }: Props) {
  const user = useAuthStore((s) => s.user)
  const { data: reviews = [], isLoading } = useReviews(auctionId)
  const { data: bidsData } = useAuctionBids(auctionId)
  const createReview = useCreateReview(auctionId)

  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const isEnded = status === 'ENDED'
  const isWinner = user?.id === winnerId

  const { data: myBids } = useQuery({
    queryKey: ['myBids', auctionId],
    queryFn: () => getMyBids(1, 1, auctionId),
    enabled: !!user && isEnded,
  })

  const hasParticipated = (myBids && myBids.total > 0) || isWinner
  const hasReviewed = reviews.some((r) => r.userId === user?.id)
  
  // The backend allows ANY participant to leave a review (not just the winner)
  const canReview = isEnded && hasParticipated && !hasReviewed

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (rating === 0) {
      toast.error('Please select a rating')
      return
    }
    setSubmitting(true)
    try {
      await createReview.mutateAsync({
        auctionId,
        rating,
        comment: comment || undefined,
      })
      setRating(0)
      setComment('')
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  // if (!isEnded && reviews.length === 0) return null

  return (
    <div className="mt-8">
      <h2 className="text-base font-semibold text-text-primary mb-4">Reviews</h2>

      {/* Review form */}
      <AnimatePresence>
        {canReview && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="bg-bg-surface rounded-2xl border border-border-base p-5 mb-4 shadow-sm"
          >
            <p className="text-sm font-medium text-text-primary mb-3">
              {isWinner ? '🎉 You won this auction — leave a review' : '📝 Thanks for participating — leave a review'}
            </p>
            <form onSubmit={handleSubmit} className="space-y-3">
              <StarRating value={rating} onChange={setRating} />
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Share your experience (optional)"
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-border-base bg-bg-tertiary text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors resize-none"
              />
              <button
                type="submit"
                disabled={submitting || createReview.isPending || rating === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-dark disabled:opacity-50 transition-colors"
              >
                {submitting || createReview.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {submitting || createReview.isPending ? 'Submitting...' : 'Submit review'}
              </button>
            </form>
          </motion.div>
        )}
        
        {isEnded && !hasParticipated && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-bg-tertiary rounded-xl p-4 mb-4 text-center border border-border-base"
          >
            <p className="text-sm font-medium text-text-secondary">
              This auction has ended.
            </p>
            <p className="text-xs text-text-tertiary mt-1">
              Only users who participated in this auction can leave a review.
            </p>
          </motion.div>
        )}
        
        {!isEnded && (
          <div className="text-xs text-text-tertiary mb-4 hidden">
            [Debug] Auction status is {status}, so review form is hidden.
          </div>
        )}
      </AnimatePresence>

      {/* Reviews list */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-20 bg-surface-tertiary rounded-xl animate-pulse" />
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <div className="text-center py-12 bg-bg-surface rounded-3xl border border-border-base border-dashed">
          <p className="text-sm text-text-tertiary font-medium">No reviews yet — be the first to share your experience!</p>
        </div>
      ) : (
        <div className="bg-bg-surface rounded-2xl border border-border-base divide-y divide-border-base/50 overflow-hidden shadow-sm">
          {reviews.map((review) => (
            <div key={review.id} className="px-4 py-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-primary-light flex items-center justify-center">
                    <span className="text-xs font-semibold text-primary-dark">
                      {review.user.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-text-primary">{review.user.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <StarRating value={review.rating} />
                  <span className="text-xs text-text-tertiary">
                    {formatDistanceToNow(new Date(review.createdAt), { addSuffix: true })}
                  </span>
                </div>
              </div>
              {review.comment && (
                <p className="text-sm text-text-secondary ml-9">{review.comment}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}