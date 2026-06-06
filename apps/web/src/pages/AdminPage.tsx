// apps/web/src/pages/AdminPage.tsx
// Updated: added "AI Dashboard" and "Disputes" tabs using existing AI components

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Shield, Users, Gavel, TrendingUp, AlertTriangle,
  Bot, CheckCircle, Activity, Ban, RotateCcw,
  ChevronRight, Loader2, FlaskConical, BarChart2, Scale
} from 'lucide-react'
import {
  getAdminStats, getAdminFraudFlags, getAdminUsers,
  getAdminActivity, banUser, unbanUser, updateFraudFlag, getAdminHealth
} from '@/api/admin'
import { formatDistanceToNow } from 'date-fns'
import { fadeUp, smooth } from '@/lib/animations'
import toast from 'react-hot-toast'
import { AdminDashboard } from '@/components/ai/AdminDashboard'
import { AdminDisputePanel } from '@/components/ai/AdminDisputePanel'

type Tab = 'overview' | 'fraud' | 'users' | 'activity' | 'ai-dashboard' | 'disputes'

export function AdminPage() {
  const [tab, setTab] = useState<Tab>('overview')
  const queryClient = useQueryClient()

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: getAdminStats,
    refetchInterval: 30000,
  })

  const { data: health } = useQuery({
    queryKey: ['admin-health'],
    queryFn: getAdminHealth,
    refetchInterval: 10000,
    enabled: tab === 'overview',
  })

  const { data: fraudData, isLoading: fraudLoading } = useQuery({
    queryKey: ['admin-fraud'],
    queryFn: () => getAdminFraudFlags(),
    enabled: tab === 'fraud' || tab === 'overview',
  })

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => getAdminUsers(),
    enabled: tab === 'users',
  })

  const { data: activityData, isLoading: activityLoading } = useQuery({
    queryKey: ['admin-activity'],
    queryFn: getAdminActivity,
    enabled: tab === 'activity',
    refetchInterval: 15000,
  })

  const banMutation = useMutation({
    mutationFn: ({ id, banned }: { id: string; banned: boolean }) => banned ? unbanUser(id) : banUser(id),
    onSuccess: (_, { banned }) => { queryClient.invalidateQueries({ queryKey: ['admin-users'] }); toast.success(banned ? 'User unbanned' : 'User banned') },
    onError: () => toast.error('Action failed'),
  })

  const fraudMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'allow' | 'review' | 'escalate' }) => updateFraudFlag(id, action),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-fraud'] }); toast.success('Flag updated') },
    onError: () => toast.error('Action failed'),
  })

  const tabs: { key: Tab; label: string; icon: typeof Shield }[] = [
    { key: 'overview',     label: 'Overview',      icon: TrendingUp  },
    { key: 'fraud',        label: 'Fraud Queue',   icon: Shield      },
    { key: 'users',        label: 'Users',         icon: Users       },
    { key: 'activity',     label: 'Activity',      icon: Activity    },
    { key: 'ai-dashboard', label: 'AI Dashboard',  icon: BarChart2   },
    { key: 'disputes',     label: 'Disputes',      icon: Scale       },
  ]

  const flags = fraudData?.flags ?? []
  const users = usersData?.users ?? []
  const activity = activityData?.activity ?? []
  const pendingFlags = flags.filter(f => f.status === 'pending').length

  return (
    <div className="space-y-8 py-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border-base pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Shield className="w-5 h-5 text-primary" />
            <h1 className="font-serif italic text-3xl md:text-5xl text-text-primary font-medium">Registry Command</h1>
          </div>
          <p className="font-mono text-[10px] tracking-widest text-text-secondary uppercase">Platform monitoring, fraud assessment, and user controls</p>
        </div>
        {pendingFlags > 0 && (
          <motion.div initial={{ scale: 0.98, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex items-center gap-2 px-3 py-1.5 rounded-none bg-danger-light border border-danger/20 font-mono text-[9px] uppercase tracking-widest text-danger font-bold shrink-0">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>{pendingFlags} pending fraud {pendingFlags === 1 ? 'flag' : 'flags'}</span>
          </motion.div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 bg-bg-surface border border-border-base rounded-none p-1.5 shadow-sm">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)} className={`flex-1 min-w-[80px] flex items-center justify-center gap-2 py-3 rounded-none text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${tab === key ? 'bg-primary text-white font-semibold' : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/20'}`}>
            <Icon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{label}</span>
            {key === 'fraud' && pendingFlags > 0 && <span className="font-mono text-[9px] w-4.5 h-4.5 rounded-none bg-danger text-white flex items-center justify-center">{pendingFlags}</span>}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">

        {/* Overview Tab */}
        {tab === 'overview' && (
          <motion.div key="overview" variants={fadeUp} initial="initial" animate="animate" exit="exit" transition={smooth} className="space-y-6">
            {/* System Health */}
            <div className="bg-bg-surface border border-border-base p-4 rounded-none shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary animate-pulse" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-text-primary font-sans">System Service Status</span>
              </div>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-6">
                {[
                  { name: 'Database (Postgres)', key: 'postgres' },
                  { name: 'Cache (Redis)', key: 'redis' },
                  { name: 'Collector AI Service', key: 'aiService' },
                ].map(({ name, key }) => {
                  const status = health?.[key as keyof typeof health] ?? 'down'
                  return (
                    <div key={name} className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${status === 'up' ? 'bg-primary' : 'bg-danger'} animate-pulse`} />
                      <span className="text-[10px] font-mono tracking-wider text-text-secondary uppercase">{name}: <span className={status === 'up' ? 'text-primary font-bold' : 'text-danger font-bold'}>{status}</span></span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Stats */}
            {statsLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 bg-bg-surface rounded-none border border-border-base animate-pulse" />)}</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
                {[
                  { label: 'Bids Placed Today', value: stats?.bidsToday ?? 0, icon: Gavel, color: 'text-primary', bg: 'bg-primary/10 border-primary/20' },
                  { label: 'Active Listings', value: stats?.activeAuctions ?? 0, icon: TrendingUp, color: 'text-primary', bg: 'bg-primary/10 border-primary/20' },
                  { label: 'Fraud Flagged', value: stats?.fraudFlagged ?? 0, icon: AlertTriangle, color: 'text-danger', bg: 'bg-danger/10 border-danger/20' },
                  { label: 'Bots Repelled', value: stats?.botsBlocked ?? 0, icon: Bot, color: 'text-warning', bg: 'bg-warning/10 border-warning/20' },
                ].map(({ label, value, icon: Icon, color, bg }) => (
                  <motion.div key={label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-bg-surface rounded-none border border-border-base p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary font-sans">{label}</span>
                      <div className={`w-8 h-8 rounded-none border flex items-center justify-center ${bg}`}><Icon className={`w-3.5 h-3.5 ${color}`} /></div>
                    </div>
                    <p className="font-mono text-2xl font-bold tracking-tight text-text-primary">{value.toLocaleString()}</p>
                  </motion.div>
                ))}
              </div>
            )}

            {/* Quick link to AI Dashboard */}
            <div className="bg-primary/5 border border-primary/20 rounded-none p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-primary" />
                <span className="text-xs text-text-primary font-medium">Full AI platform health and model status</span>
              </div>
              <button onClick={() => setTab('ai-dashboard')} className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-widest text-primary hover:text-primary-dark transition-all cursor-pointer">
                View AI Dashboard <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Recent fraud flags */}
            {flags.length > 0 && (
              <div className="bg-bg-surface rounded-none border border-border-base overflow-hidden shadow-sm">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border-base">
                  <h2 className="text-[10px] font-bold uppercase tracking-widest text-text-primary font-sans">Recent Security Flags</h2>
                  <button onClick={() => setTab('fraud')} className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-widest text-primary hover:text-primary-dark transition-all cursor-pointer">
                    View fraud queue <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="divide-y divide-border-base">
                  {flags.slice(0, 3).map((flag) => (
                    <div key={flag.id} className="flex items-center justify-between px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-none bg-danger/10 border border-danger/20 flex items-center justify-center"><AlertTriangle className="w-4 h-4 text-danger" /></div>
                        <div>
                          <p className="text-xs font-semibold text-text-primary">Score: {Math.round(flag.score * 100)}%</p>
                          <p className="text-[10px] font-mono tracking-wider text-text-secondary">${flag.bid.amount.toLocaleString()} · {formatDistanceToNow(new Date(flag.createdAt), { addSuffix: true })}</p>
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 rounded-none text-[8px] font-mono uppercase tracking-widest border font-bold ${flag.status === 'pending' ? 'bg-warning-light border-warning/20 text-warning' : flag.status === 'allow' ? 'bg-primary-light border-primary/20 text-primary' : 'bg-danger-light border-danger/20 text-danger'}`}>{flag.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* Fraud Tab */}
        {tab === 'fraud' && (
          <motion.div key="fraud" variants={fadeUp} initial="initial" animate="animate" exit="exit" transition={smooth}>
            {fraudLoading ? (
              <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 bg-bg-surface rounded-none border border-border-base animate-pulse" />)}</div>
            ) : flags.length === 0 ? (
              <div className="text-center py-20 bg-bg-surface rounded-none border border-border-base border-dashed">
                <CheckCircle className="w-8 h-8 text-primary mx-auto mb-4" />
                <p className="text-xs uppercase font-bold tracking-wider text-text-secondary">Security Queue Clear</p>
              </div>
            ) : (
              <div className="space-y-4">
                {flags.map((flag) => (
                  <motion.div key={flag.id} layout className="bg-bg-surface rounded-none border border-border-base p-6">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-none bg-danger/10 border border-danger/20 flex items-center justify-center shrink-0"><AlertTriangle className="w-5 h-5 text-danger" /></div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2.5 mb-1.5">
                            <span className="text-xs uppercase font-bold tracking-wider text-text-primary">Threat Flagged: {Math.round(flag.score * 100)}% Confidence</span>
                            <span className={`px-2 py-0.5 rounded-none text-[8px] font-mono uppercase tracking-widest border font-bold ${flag.status === 'pending' ? 'bg-warning-light border-warning/20 text-warning' : flag.status === 'allow' ? 'bg-primary-light border-primary/20 text-primary' : 'bg-danger-light border-danger/20 text-danger'}`}>{flag.status}</span>
                          </div>
                          <p className="text-[10px] font-mono tracking-widest uppercase text-text-secondary mb-1">Bid: ${flag.bid.amount.toLocaleString()} · {formatDistanceToNow(new Date(flag.createdAt), { addSuffix: true })}</p>
                          <p className="text-xs text-text-secondary italic mb-3">"{flag.reason}"</p>
                          {flag.signals.filter((s: string) => s !== 'service_unavailable').length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {flag.signals.filter((s: string) => s !== 'service_unavailable').map((signal: string) => (
                                <span key={signal} className="px-2 py-0.5 rounded-none bg-danger/10 border border-danger/20 text-[8px] font-bold uppercase tracking-widest text-danger font-mono">{signal.replace(/_/g, ' ')}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      {flag.status === 'pending' && (
                        <div className="flex gap-2 shrink-0 md:self-center">
                          <button onClick={() => fraudMutation.mutate({ id: flag.id, action: 'allow' })} disabled={fraudMutation.isPending} className="flex items-center gap-1.5 px-4 py-2 rounded-none bg-primary-light border border-primary/20 text-[10px] uppercase font-bold tracking-widest text-primary hover:border-primary transition-all cursor-pointer"><CheckCircle className="w-3.5 h-3.5" /> Allow</button>
                          <button onClick={() => fraudMutation.mutate({ id: flag.id, action: 'escalate' })} disabled={fraudMutation.isPending} className="flex items-center gap-1.5 px-4 py-2 rounded-none bg-danger/10 border border-danger/20 text-[10px] uppercase font-bold tracking-widest text-danger hover:border-danger transition-all cursor-pointer"><AlertTriangle className="w-3.5 h-3.5" /> Escalate</button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* Users Tab */}
        {tab === 'users' && (
          <motion.div key="users" variants={fadeUp} initial="initial" animate="animate" exit="exit" transition={smooth}>
            {usersLoading ? (
              <div className="space-y-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 bg-bg-surface rounded-none border border-border-base animate-pulse" />)}</div>
            ) : (
              <div className="bg-bg-surface rounded-none border border-border-base overflow-x-auto shadow-sm">
                <table className="w-full text-sm text-left">
                  <thead className="text-[10px] uppercase font-bold tracking-widest bg-bg-tertiary border-b border-border-base text-text-secondary">
                    <tr>
                      <th className="px-5 py-4 font-bold">User Identity</th>
                      <th className="px-5 py-4 font-bold">Status</th>
                      <th className="px-5 py-4 font-bold">Joined</th>
                      <th className="px-5 py-4 font-bold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="font-sans text-xs">
                    {users.map((user: any) => (
                      <tr key={user.id} className="border-b border-border-base last:border-0 hover:bg-bg-tertiary/10 transition-all">
                        <td className="px-5 py-3.5"><p className="font-semibold text-text-primary">{user.name}</p><p className="font-mono text-[9px] tracking-wider text-text-tertiary uppercase mt-0.5">{user.email}</p></td>
                        <td className="px-5 py-3.5">{user.banned ? <span className="px-2 py-0.5 rounded-none bg-danger/10 border border-danger/20 text-danger text-[8px] font-bold uppercase tracking-widest font-mono">Banned</span> : user.isAdmin ? <span className="px-2 py-0.5 rounded-none bg-primary text-white text-[8px] font-bold uppercase tracking-widest font-mono">Admin</span> : <span className="px-2 py-0.5 rounded-none bg-primary-light border border-primary/25 text-primary text-[8px] font-bold uppercase tracking-widest font-mono">Active</span>}</td>
                        <td className="px-5 py-3.5 text-text-tertiary font-mono text-[10px]">{formatDistanceToNow(new Date(user.createdAt), { addSuffix: true })}</td>
                        <td className="px-5 py-3.5 text-right">{!user.isAdmin && <button onClick={() => banMutation.mutate({ id: user.id, banned: user.banned })} disabled={banMutation.isPending} className={`text-[9px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-none transition-all cursor-pointer border ${user.banned ? 'bg-bg-surface border-border-base text-text-primary hover:border-text-secondary' : 'bg-danger/10 border border-danger/20 text-danger hover:bg-danger/20'}`}>{user.banned ? 'Unban' : 'Ban'}</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        )}

        {/* Activity Tab */}
        {tab === 'activity' && (
          <motion.div key="activity" variants={fadeUp} initial="initial" animate="animate" exit="exit" transition={smooth}>
            {activityLoading ? (
              <div className="space-y-4">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 bg-bg-surface rounded-none border border-border-base animate-pulse" />)}</div>
            ) : activity.length === 0 ? (
              <div className="text-center py-20 bg-bg-surface rounded-none border border-border-base border-dashed"><Activity className="w-8 h-8 text-text-tertiary mx-auto mb-4 opacity-30" /><p className="text-xs uppercase font-bold tracking-wider text-text-secondary">No Recent Activity</p></div>
            ) : (
              <div className="bg-bg-surface rounded-none border border-border-base overflow-x-auto shadow-sm">
                <table className="w-full text-sm text-left">
                  <thead className="text-[10px] uppercase font-bold tracking-widest bg-bg-tertiary border-b border-border-base text-text-secondary"><tr><th className="px-5 py-4 font-bold">Event</th><th className="px-5 py-4 font-bold text-right">Time</th></tr></thead>
                  <tbody className="font-sans text-xs">
                    {activity.map((item: any) => (
                      <tr key={item.id} className="border-b border-border-base last:border-0 hover:bg-bg-tertiary/10 transition-all">
                        <td className="px-5 py-4"><div className="flex items-center gap-3"><div className={`w-8 h-8 rounded-none border flex items-center justify-center shrink-0 ${item.type === 'bid' ? 'bg-primary-light border-primary/20 text-primary' : item.type === 'fraud' ? 'bg-danger/10 border border-danger/20 text-danger' : 'bg-primary-light border-primary/20 text-primary'}`}>{item.type === 'bid' ? <Gavel className="w-4 h-4" /> : item.type === 'fraud' ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}</div><span className="text-text-primary font-medium">{item.message}</span></div></td>
                        <td className="px-5 py-4 text-right text-[10px] text-text-tertiary whitespace-nowrap font-mono">{formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        )}

        {/* AI Dashboard Tab — NEW */}
        {tab === 'ai-dashboard' && (
          <motion.div key="ai-dashboard" variants={fadeUp} initial="initial" animate="animate" exit="exit" transition={smooth}>
            <AdminDashboard />
          </motion.div>
        )}

        {/* Disputes Tab — NEW */}
        {tab === 'disputes' && (
          <motion.div key="disputes" variants={fadeUp} initial="initial" animate="animate" exit="exit" transition={smooth}>
            <AdminDisputePanel />
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  )
}
