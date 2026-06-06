import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAuctionSocket } from '../useSocket';
import { useQueryClient } from '@tanstack/react-query'; // Assume this exists
import toast from 'react-hot-toast'; // Assume this exists
import { useAuthStore } from '@/store/authStore';

// Mock dependencies
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    info: vi.fn(),
    custom: vi.fn(),
  },
}));

vi.mock('@/store/authStore', () => ({
  useAuthStore: Object.assign(vi.fn(), {
    getState: vi.fn(() => ({ accessToken: 'test-token' }))
  })
}));

// Mock socket.io-client
const mockSocket = {
  on: vi.fn(),
  once: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  connected: true,
};

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocket),
}));

describe('useAuctionSocket', () => {
  let queryClientMock: any;
  let socketCallbacks: Record<string, Function> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    socketCallbacks = {};

    mockSocket.on.mockImplementation((event, cb) => {
      socketCallbacks[event] = cb;
    });
    mockSocket.once.mockImplementation((event, cb) => {
      socketCallbacks[event] = cb;
    });

    queryClientMock = {
      setQueryData: vi.fn(),
      invalidateQueries: vi.fn(),
    };
    vi.mocked(useQueryClient).mockReturnValue(queryClientMock);
    vi.mocked(useAuthStore).mockReturnValue({ id: 'user-1' } as any);
  });

  it('bid:new event -> updates React Query cache with new bid', () => {
    renderHook(() => useAuctionSocket('auction-1'));
    
    // Simulate bid:new event
    act(() => {
      socketCallbacks['bid:new']?.({
        bid: {
          id: 'bid-1',
          auctionId: 'auction-1',
          bidderId: 'user-2',
          amount: 150,
        }
      });
    });

    expect(queryClientMock.setQueryData).toHaveBeenCalledWith(
      ['auction', 'auction-1'],
      expect.any(Function)
    );
  });

  it('bid:new event -> shows toast for bids placed by other users', () => {
    renderHook(() => useAuctionSocket('auction-1'));
    
    act(() => {
      socketCallbacks['bid:new']?.({
        bid: {
          bidderId: 'user-2', // Different from current user (user-1)
          amount: 150,
        }
      });
    });

    expect(toast.custom).toHaveBeenCalled();
  });

  it('bid:new event -> does NOT show toast for own bids', () => {
    renderHook(() => useAuctionSocket('auction-1'));
    
    act(() => {
      socketCallbacks['bid:new']?.({
        bid: {
          bidderId: 'user-1', // Same as current user
          amount: 150,
        }
      });
    });

    expect(toast.custom).not.toHaveBeenCalled();
  });

  it('auction:ended event -> updates auction status in cache', () => {
    renderHook(() => useAuctionSocket('auction-1'));
    
    act(() => {
      socketCallbacks['auction:ended']?.({
        auction: {
          id: 'auction-1',
          winnerId: 'user-1',
          currentPrice: 150,
        }
      });
    });

    expect(queryClientMock.setQueryData).toHaveBeenCalledWith(
      ['auction', 'auction-1'],
      expect.any(Function)
    );
  });

  it('auction:extended event -> updates endsAt in React Query cache', () => {
    renderHook(() => useAuctionSocket('auction-1'));
    
    const newEndsAt = new Date().toISOString();
    
    act(() => {
      socketCallbacks['auction:extended']?.({
        auctionId: 'auction-1',
        newEndsAt,
      });
    });

    expect(queryClientMock.setQueryData).toHaveBeenCalledWith(
      ['auction', 'auction-1'],
      expect.any(Function)
    );
  });

  it('Socket disconnects and reconnects -> rejoins correct room', () => {
    mockSocket.connected = false;
    renderHook(() => useAuctionSocket('auction-1'));
    
    // Simulate initial connect
    act(() => {
      socketCallbacks['connect']?.();
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('join:auction', 'auction-1');
  });
});
