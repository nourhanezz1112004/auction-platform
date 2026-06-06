import { apiClient } from './client'
import type { Auction } from './auctions'

export type AdminStats = {
  bidsToday: number
  activeAuctions: number
  fraudFlagged: number
  botsBlocked: number
  cleanPct: number
  captchaPct: number
  blockedPct: number
  abGroupA: { bidsPerSession: number }
  abGroupB: { bidsPerSession: number }
}

export type AdminHealth = {
  postgres: 'up' | 'down'
  redis: 'up' | 'down'
  aiService: 'up' | 'down'
}

export type AdminUser = {
  id: string
  email: string
  name: string
  phone: string | null
  rating: number
  isAdmin: boolean
  banned: boolean
  createdAt: string
  deletedAt: string | null
  abGroup: string
  _count?: { bids: number; auctions: number }
}

export type FraudFlag = {
  id: string
  bidId: string
  score: number
  signals: string[]
  reason: string
  status: 'pending' | 'allow' | 'review' | 'escalate'
  createdAt: string
  bid: {
    id: string
    amount: number
    userId: string
    auctionId: string
  }
}

export type ActivityItem = {
  id: string
  type: 'bid' | 'fraud' | 'auction'
  message: string
  createdAt: string
}

export async function getAdminStats(): Promise<AdminStats> {
  const res = await apiClient.get<AdminStats>('/admin/stats')
  return res.data
}

export async function getAdminFraudFlags(page = 1): Promise<{ flags: FraudFlag[]; total: number }> {
  const res = await apiClient.get('/admin/fraud-flags', { params: { page, limit: 20 } })
  return res.data
}

export async function getAdminUsers(page = 1): Promise<{ users: AdminUser[]; total: number }> {
  const res = await apiClient.get('/admin/users', { params: { page, limit: 20 } })
  return res.data
}

export async function banUser(id: string): Promise<void> {
  await apiClient.patch(`/admin/users/${id}/ban`)
}

export async function unbanUser(id: string): Promise<void> {
  await apiClient.patch(`/admin/users/${id}/unban`)
}

export async function updateFraudFlag(id: string, action: 'allow' | 'review' | 'escalate'): Promise<void> {
  await apiClient.patch(`/admin/fraud-flags/${id}`, { action })
}

export async function getAdminActivity(): Promise<{ activity: ActivityItem[] }> {
  const res = await apiClient.get('/admin/activity', { params: { limit: 20 } })
  return res.data
}

export async function getAdminHealth(): Promise<AdminHealth> {
  const res = await apiClient.get<AdminHealth>('/admin/health')
  return res.data
}