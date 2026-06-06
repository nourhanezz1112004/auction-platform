import { apiClient } from './client'

export type Notification = {
  id: string
  userId: string
  auctionId?: string
  type: 'outbid' | 'won' | 'sold' | 'flagged' | 'info'
  title: string
  message: string
  read: boolean
  createdAt: string
}

export async function getNotifications(page = 1): Promise<{ notifications: Notification[]; total: number }> {
  const res = await apiClient.get('/notifications', { params: { page, limit: 50 } })
  return res.data
}

export async function getUnreadCount(): Promise<number> {
  const res = await apiClient.get<{ count: number }>('/notifications/unread-count')
  return res.data.count
}

export async function markAllRead(): Promise<void> {
  await apiClient.patch('/notifications/read-all')
}

export async function markOneRead(id: string): Promise<void> {
  await apiClient.patch(`/notifications/${id}/read`)
}