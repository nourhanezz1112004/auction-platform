import { apiClient } from './client'

export type Review = {
  id: string
  auctionId: string
  userId: string
  rating: number
  comment: string | null
  createdAt: string
  user: { id: string; name: string }
}

export async function getReviews(auctionId: string): Promise<Review[]> {
  const res = await apiClient.get<{ reviews: Review[] }>(`/reviews/auction/${auctionId}`)
  return res.data.reviews
}

export async function createReview(data: {
  auctionId: string
  rating: number
  comment?: string
}): Promise<Review> {
  const res = await apiClient.post<{ review: Review }>('/reviews', data)
  return res.data.review
}