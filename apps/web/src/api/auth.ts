import { apiClient } from './client'
import type { AuthUser } from '@/store/authStore'

export interface LoginRequest {
  email: string
  password: string
}

export interface RegisterRequest {
  email: string
  password: string
  name: string
  phone?: string
}

export interface AuthResponse {
  user: AuthUser
  accessToken: string
  refreshToken: string
}

export interface UpdateProfileRequest {
  name?: string
  phone?: string
  bio?: string
  avatarUrl?: string
}

export async function login(data: LoginRequest): Promise<AuthResponse> {
  const res = await apiClient.post<AuthResponse>('/auth/login', data)
  return res.data
}

export async function register(data: RegisterRequest): Promise<AuthResponse> {
  const res = await apiClient.post<AuthResponse>('/auth/register', data)
  return res.data
}

export async function logout(): Promise<void> {
  await apiClient.post('/auth/logout')
}

export async function getMe(): Promise<AuthUser> {
  const res = await apiClient.get<{ user: AuthUser }>('/auth/me')
  return res.data.user
}

export async function updateMe(data: UpdateProfileRequest): Promise<AuthUser> {
  const res = await apiClient.patch<{ user: AuthUser }>('/users/me', data)
  return res.data.user
}

export async function forgotPassword(email: string): Promise<void> {
  await apiClient.post('/auth/forgot-password', { email })
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await apiClient.post('/auth/reset-password', { token, newPassword })
}