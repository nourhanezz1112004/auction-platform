import { create } from 'zustand'
import { io, Socket } from 'socket.io-client'
import { useAuthStore } from './authStore'

const SOCKET_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

type SocketState = {
  socket: Socket | null
  connected: boolean
  connect: () => void
  disconnect: () => void
}

export const useSocketStore = create<SocketState>((set, get) => ({
  socket: null,
  connected: false,

  connect: () => {
    const existing = get().socket
    if (existing?.connected) return
    if (existing) {
      existing.disconnect()
    }

    const socket = io(SOCKET_URL, {
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      forceNew: true,
      withCredentials: false,
      auth: {
        token: useAuthStore.getState().accessToken,
      },
    })

    socket.on('connect', () => {
      set({ connected: true })
    })

    socket.on('disconnect', (reason) => {
      set({ connected: false })
    })

    socket.on('connect_error', (err) => {
    })

    set({ socket })
  },

  disconnect: () => {
    get().socket?.disconnect()
    set({ socket: null, connected: false })
  },
}))
