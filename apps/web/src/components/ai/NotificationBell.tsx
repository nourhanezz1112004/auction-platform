// apps/web/src/components/NotificationBell.tsx
// In-app notification bell with unread badge.
// Shows all notification types: OUTBID, AUTOBID_PLACED, DEMAND_SURGE,
// WINBACK, AUCTION_WON, SHILL_ALERT, AUCTION_EXTENDED.
// Uses TanStack Query with polling + marks read on open.

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiClient as axios } from "@/api/client";
import { useAuthStore } from "@/store/authStore";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  createdAt: string;
  readAt: string | null;
  metadata: Record<string, any> | null;
}

interface NotifData {
  notifications: Notification[];
  nextCursor: string | null;
  unreadCount: number;
}

const TYPE_ICONS: Record<string, string> = {
  OUTBID:           "⚡",
  AUTOBID_PLACED:   "🤖",
  DEMAND_SURGE:     "🔥",
  WINBACK:          "👋",
  AUCTION_WON:      "🏆",
  SHILL_ALERT:      "⚠️",
  AUCTION_EXTENDED: "⏱",
  AUCTION_SOLD:     "✅",
  PAYMENT_RECEIVED: "💰",
  default:          "🔔",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60_000);
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(diff / 86_400_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${d}d ago`;
}

export function NotificationBell() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery<NotifData>({
    queryKey: ["notifications"],
    queryFn: () => axios.get("/api/notifications?limit=20").then(r => r.data),
    enabled: !!user,
    refetchInterval: 30_000,   // poll every 30s
    staleTime: 25_000,
  });

  const markAllRead = useMutation({
    mutationFn: () => axios.patch("/api/notifications/read-all"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markRead = useMutation({
    mutationFn: (id: string) => axios.patch(`/api/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Mark all read when panel opens
  useEffect(() => {
    if (open && data?.unreadCount) {
      markAllRead.mutate();
    }
  }, [open]);

  const unread = data?.unreadCount ?? 0;

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="relative w-9 h-9 rounded-full flex items-center justify-center hover:bg-neutral-100 transition-colors"
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
      >
        <svg className="w-5 h-5 text-neutral-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center px-0.5">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-11 w-80 rounded-2xl border border-neutral-200 bg-white shadow-xl overflow-hidden z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
            <span className="text-sm font-medium">Notifications</span>
            {unread > 0 && (
              <button
                onClick={() => markAllRead.mutate()}
                className="text-xs text-neutral-500 hover:text-neutral-700"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto divide-y divide-neutral-100">
            {!data?.notifications?.length ? (
              <div className="px-4 py-8 text-center text-sm text-neutral-400">
                No notifications yet
              </div>
            ) : data.notifications.map(n => {
              const icon = TYPE_ICONS[n.type] ?? TYPE_ICONS.default;
              const auctionId = n.metadata?.auctionId as string | undefined;
              const isUnread = !n.readAt;

              const inner = (
                <div
                  className={`flex gap-3 px-4 py-3 hover:bg-neutral-50 transition-colors cursor-pointer ${isUnread ? "bg-blue-50/40" : ""}`}
                  onClick={() => !n.readAt && markRead.mutate(n.id)}
                >
                  <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center text-base flex-shrink-0 mt-0.5">
                    {icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <span className={`text-sm leading-snug ${isUnread ? "font-medium" : ""}`}>
                        {n.title}
                      </span>
                      {isUnread && (
                        <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-1" />
                      )}
                    </div>
                    <p className="text-xs text-neutral-500 mt-0.5 leading-relaxed line-clamp-2">
                      {n.message}
                    </p>
                    <span className="text-[10px] text-neutral-400 mt-1 block">
                      {timeAgo(n.createdAt)}
                    </span>
                  </div>
                </div>
              );

              return auctionId ? (
                <Link key={n.id} to={`/auctions/${auctionId}`} onClick={() => setOpen(false)}>
                  {inner}
                </Link>
              ) : (
                <div key={n.id}>{inner}</div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="border-t border-neutral-100 px-4 py-2.5 text-center">
            <Link
              to="/notifications"
              className="text-xs text-neutral-500 hover:text-neutral-700"
              onClick={() => setOpen(false)}
            >
              View all notifications →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
export default NotificationBell;
