import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getNotifications, getUnreadCount, markAllRead, markOneRead } from '@/api/notifications'
import { useAuthStore } from '@/store/authStore'

export function useNotifications() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => getNotifications(),
    enabled: isAuthenticated,
    refetchInterval: 30000,
  })
}

export function useUnreadCount() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  return useQuery({
    queryKey: ['notifications-unread'],
    queryFn: getUnreadCount,
    enabled: isAuthenticated,
    refetchInterval: 15000,
  })
}

export function useMarkAllRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: markAllRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread'] })
    },
  })
}

export function useMarkOneRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: markOneRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread'] })
    },
  })
}