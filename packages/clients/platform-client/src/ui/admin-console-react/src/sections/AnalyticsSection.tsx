import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react'
import {
  Activity, ArrowUpRight, Bot, CheckCheck, Clock, Flag, LayoutGrid, Mail,
  MessageSquare, Phone, Radio, RefreshCw, Smartphone, TriangleAlert,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ChannelIcon } from '../components/ui/ChannelIcon'
import { ConversationPanel } from '../components/ConversationPanel'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Badge, type BadgeVariant } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { CHANNEL_LABELS, END_REASON_LABELS, formatDuration } from '../lib/labels'
import { cn } from '../lib/utils'

// =============================================================================
// TYPES
// =============================================================================

interface RealtimeStats {
  activeConversations: number
  todayTotal: number
  todayCompleted: number
  todayAbandoned: number
  avgDuration: number
  avgMessages: number
}

interface ChannelBreakdown {
  web_text: number
  web_voice: number
  voice: number
  whatsapp: number
  sms: number
  [key: string]: number
}

interface EndReason {
  reason: string
  count: number
}

interface RecentConversation {
  id: string
  channel: string
  status: string
  duration: number
  messages: number
  endReason: string
  time: string
  summary?: string | null
  hasAudio?: boolean
}

interface DashboardData {
  realtime: RealtimeStats
  breakdown: {
    byChannel: ChannelBreakdown
    byEndReason: EndReason[]
  }
  recentConversations: RecentConversation[]
  timestamp: string
}

interface PlatformConfig {
  elevenLabs?: { agentId?: string; apiKey?: string }
  conversationMode?: string
  backendApiUrl?: string
  twilio?: { accountSid?: string; phoneNumber?: string }
  whatsapp?: { enabled?: boolean }
  widget?: { primaryColor?: string; title?: string }
  escalation?: { enabled?: boolean; phoneNumber?: string }
}

type DateRange = 'today' | 'yesterday' | 'week' | 'month' | '30days' | 'custom'

// =============================================================================
// CONSTANTS
// =============================================================================

/** Status maps onto the shared triage ramp rather than its own colour set. */
const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  completed: 'handled',
  abandoned: 'waiting',
  error: 'urgent',
  active: 'neutral',
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function AnalyticsSection() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [platformConfig, setPlatformConfig] = useState<PlatformConfig>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [dateRange, setDateRange] = useState<DateRange>('today')
  const [customDate, setCustomDate] = useState('')
  const [channelFilter, setChannelFilter] = useState<'all' | string>('all')
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [sortField, setSortField] = useState<'time' | 'duration' | 'messages'>('time')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null)

  // ── Data Loading ──────────────────────────────────────────────────────────

  const loadDashboard = useCallback(async () => {
    try {
      let params = ''
      if (dateRange === 'custom' && customDate) {
        params = `?date=${customDate}`
      } else if (dateRange === 'yesterday') {
        const d = new Date()
        d.setDate(d.getDate() - 1)
        params = `?date=${d.toISOString().split('T')[0]}`
      } else if (dateRange !== 'today') {
        params = `?range=${dateRange}`
      }

      const [dashRes, configRes] = await Promise.all([
        fetch(`/api/analytics/dashboard${params}`),
        fetch('/api/admin/config/platform', {
          headers: { Authorization: `Bearer ${localStorage.getItem('admin_token') || ''}` },
        }),
      ])

      if (dashRes.ok) {
        const result = await dashRes.json()
        if (result.success) {
          setData(result.data)
          setError(null)
        }
      } else {
        setError('Could not load the numbers.')
      }

      if (configRes.ok) {
        const cfg = await configRes.json()
        setPlatformConfig(cfg.data || cfg)
      }

      setLastRefresh(new Date())
    } catch (e) {
      setError('Network problem. Check your connection.')
      console.error('Analytics load error:', e)
    } finally {
      setLoading(false)
    }
  }, [dateRange, customDate])

  useEffect(() => {
    setLoading(true)
    loadDashboard()
  }, [loadDashboard])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(loadDashboard, 15000)
    return () => clearInterval(interval)
  }, [autoRefresh, loadDashboard])

  // ── Computed Values ───────────────────────────────────────────────────────

  const filteredConversations = useMemo(() => {
    if (!data) return []
    let list = channelFilter === 'all'
      ? data.recentConversations
      : data.recentConversations.filter(c => c.channel === channelFilter)
    list = [...list].sort((a, b) => {
      let va: number, vb: number
      if (sortField === 'time') { va = new Date(a.time).getTime(); vb = new Date(b.time).getTime() }
      else if (sortField === 'duration') { va = a.duration; vb = b.duration }
      else { va = a.messages; vb = b.messages }
      return sortDir === 'asc' ? va - vb : vb - va
    })
    return list
  }, [data, channelFilter, sortField, sortDir])

  const toggleSort = (field: 'time' | 'duration' | 'messages') => {
    if (sortField === field) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortField(field); setSortDir('desc') }
  }

  const sortArrow = (field: string) => (sortField === field ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '')

  const totalByChannel = useMemo(() => {
    if (!data) return 0
    return Object.values(data.breakdown.byChannel).reduce((a, b) => a + b, 0)
  }, [data])

  const agentConfigured = !!platformConfig.elevenLabs?.agentId
  const voiceConfigured = platformConfig.conversationMode !== 'text_only'
  const whatsappConfigured = !!platformConfig.whatsapp?.enabled
  const smsConfigured = !!platformConfig.twilio?.phoneNumber
  const escalationConfigured = !!platformConfig.escalation?.enabled
  const backendConfigured = !!platformConfig.backendApiUrl

  const configuredChannels = [
    agentConfigured && 'Web Chat',
    voiceConfigured && 'Voice',
    whatsappConfigured && 'WhatsApp',
    smsConfigured && 'SMS',
  ].filter(Boolean)

  const dateRangeLabel =
    dateRange === 'custom' && customDate
      ? new Date(customDate + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
      : dateRange === 'yesterday' ? 'Yesterday'
      : dateRange === 'today' ? 'Today'
      : dateRange === 'week' ? 'This week'
      : dateRange === 'month' ? 'This month'
      : 'Last 30 days'

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading && !data) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-line border-t-flare" />
      </div>
    )
  }

  if (error && !data) {
    return (
      <Card className="border-flare/40">
        <CardContent className="text-center">
          <p className="font-medium text-paper">{error}</p>
          <button
            onClick={loadDashboard}
            className="mt-4 rounded-lg bg-flare px-4 py-2 text-sm font-semibold text-paper transition-colors hover:bg-flare/85"
          >
            Try again
          </button>
        </CardContent>
      </Card>
    )
  }

  if (!data) return null

  return (
    <div className="space-y-6">
      {/* ── Header & Date Filter ─────────────────────────────────────────── */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-paper">How Bonga Nami is doing</h1>
          <p className="mt-1 text-sm text-muted">
            {dateRangeLabel} · updated {lastRefresh.toLocaleTimeString()}
            {loading && <span className="ml-2 text-flare">refreshing…</span>}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-0.5 rounded-xl border border-line bg-canvas-2 p-1">
            {([
              ['today', 'Today'],
              ['yesterday', 'Yesterday'],
              ['week', 'Week'],
              ['month', 'Month'],
              ['30days', '30 days'],
            ] as [DateRange, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setDateRange(key)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-flare',
                  dateRange === key ? 'bg-canvas-deep text-paper' : 'text-muted hover:text-paper',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <input
            type="date"
            value={customDate}
            onChange={e => { setCustomDate(e.target.value); setDateRange('custom') }}
            aria-label="Pick a date"
            className="rounded-lg border border-line bg-canvas-deep px-3 py-1.5 text-xs text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-flare"
          />

          <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs text-muted">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-line bg-canvas-deep text-flare"
            />
            Auto-update
          </label>

          <button
            onClick={loadDashboard}
            aria-label="Refresh now"
            className="rounded-lg p-2 text-muted transition-colors hover:bg-canvas-deep hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-flare"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* ── Metric Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard
          label="Happening now"
          value={data.realtime.activeConversations}
          Icon={Activity}
          tone={data.realtime.activeConversations > 0 ? 'mint' : 'neutral'}
        />
        <MetricCard label={`${dateRangeLabel} total`} value={data.realtime.todayTotal} Icon={LayoutGrid} tone="neutral" />
        <MetricCard label="Helped" value={data.realtime.todayCompleted} Icon={CheckCheck} tone="neutral" />
        <MetricCard
          label="Ended early"
          value={data.realtime.todayAbandoned}
          Icon={TriangleAlert}
          tone={data.realtime.todayAbandoned > 0 ? 'sun' : 'neutral'}
        />
        <MetricCard label="Average length" value={formatDuration(data.realtime.avgDuration)} Icon={Clock} tone="neutral" />
        <MetricCard label="Average messages" value={data.realtime.avgMessages} Icon={MessageSquare} tone="neutral" />
      </div>

      {/* ── Platform Status ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>What&rsquo;s switched on</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            <StatusItem label="AI assistant" configured={agentConfigured} detail={agentConfigured ? 'Connected' : 'Not set up'} Icon={Bot} />
            <StatusItem label="Website chat" configured={agentConfigured} detail={agentConfigured ? 'Active' : 'Needs assistant'} Icon={MessageSquare} />
            <StatusItem label="Voice" configured={voiceConfigured} detail={voiceConfigured ? 'On' : 'Text only'} Icon={Phone} />
            <StatusItem label="WhatsApp" configured={whatsappConfigured} detail={whatsappConfigured ? 'Connected' : 'Not set up'} Icon={Smartphone} />
            <StatusItem
              label="SMS"
              configured={smsConfigured}
              detail={smsConfigured ? `Ends ${platformConfig.twilio!.phoneNumber!.slice(-4)}` : 'Not set up'}
              Icon={Mail}
            />
            <StatusItem
              label="Handover to a person"
              configured={escalationConfigured}
              detail={escalationConfigured ? 'On' : 'Off'}
              Icon={ArrowUpRight}
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-3 border-t border-line pt-4">
            <Badge variant="neutral">
              {configuredChannels.length} way{configuredChannels.length !== 1 ? 's' : ''} to reach us
            </Badge>
            {backendConfigured && <Badge variant="handled">Backend connected</Badge>}
            <Badge variant="neutral">
              {platformConfig.conversationMode === 'text_only' ? 'Text only' : 'Voice and text'}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* ── Channel Breakdown + End Reasons ──────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Where people reached us</CardTitle></CardHeader>
          <CardContent>
            {totalByChannel === 0 ? (
              <EmptyState icon={Radio} title="Nothing yet" description="No conversations in this period." />
            ) : (
              <div className="space-y-4">
                {Object.entries(data.breakdown.byChannel)
                  .sort(([, a], [, b]) => b - a)
                  .map(([channel, count]) => {
                    const pct = Math.round((count / totalByChannel) * 100)
                    return (
                      <div key={channel}>
                        <div className="mb-1.5 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <ChannelIcon channel={channel} size={18} />
                            <span className="text-sm text-paper">{CHANNEL_LABELS[channel] || channel}</span>
                          </div>
                          <div className="flex items-center gap-2 tabular-nums">
                            <span className="text-sm font-semibold text-paper">{count}</span>
                            <span className="text-xs text-muted">{pct}%</span>
                          </div>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-canvas-deep">
                          <div
                            className="h-full rounded-full bg-flare transition-all duration-700"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>How conversations ended</CardTitle></CardHeader>
          <CardContent>
            {data.breakdown.byEndReason.length === 0 ? (
              <EmptyState icon={Flag} title="Nothing yet" description="No completed conversations in this period." />
            ) : (
              <div className="space-y-2">
                {data.breakdown.byEndReason
                  .sort((a, b) => b.count - a.count)
                  .map(({ reason, count }) => {
                    const total = data.breakdown.byEndReason.reduce((s, r) => s + r.count, 0)
                    const pct = total > 0 ? Math.round((count / total) * 100) : 0
                    return (
                      <div key={reason} className="flex items-center gap-3 rounded-lg bg-canvas-deep p-3">
                        <div className="flex-1">
                          <div className="text-sm text-paper">{END_REASON_LABELS[reason] || reason}</div>
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-canvas">
                            <div
                              className="h-full rounded-full bg-muted transition-all duration-700"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                        <div className="flex-shrink-0 text-right tabular-nums">
                          <span className="text-sm font-bold text-paper">{count}</span>
                          <span className="ml-1 text-xs text-muted">{pct}%</span>
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Recent Conversations ─────────────────────────────────────────── */}
      <Card className="overflow-hidden">
        <div className="flex flex-col justify-between gap-3 border-b border-line px-6 py-4 sm:flex-row sm:items-center">
          <CardTitle>Recent conversations</CardTitle>
          <div className="flex flex-wrap gap-1.5">
            <FilterPill
              label="All"
              active={channelFilter === 'all'}
              icon={<LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />}
              onClick={() => setChannelFilter('all')}
              count={data.recentConversations.length}
            />
            {Object.entries(CHANNEL_LABELS).map(([key, label]) => {
              const count = data.recentConversations.filter(c => c.channel === key).length
              if (count === 0 && !agentConfigured) return null
              return (
                <FilterPill
                  key={key}
                  label={label}
                  active={channelFilter === key}
                  icon={<ChannelIcon channel={key} size={14} />}
                  onClick={() => setChannelFilter(key)}
                  count={count}
                />
              )
            })}
          </div>
        </div>

        {filteredConversations.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="No conversations found"
            description={
              channelFilter !== 'all'
                ? `Nothing on ${CHANNEL_LABELS[channelFilter] || channelFilter} in this period.`
                : `Nothing for ${dateRangeLabel.toLowerCase()}.`
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-canvas-deep">
                  <Th>Conversation</Th>
                  <Th>Where</Th>
                  <Th>Status</Th>
                  <Th sortable onClick={() => toggleSort('duration')}>Length{sortArrow('duration')}</Th>
                  <Th sortable onClick={() => toggleSort('messages')}>Messages{sortArrow('messages')}</Th>
                  <Th>How it ended</Th>
                  <Th sortable onClick={() => toggleSort('time')}>When{sortArrow('time')}</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredConversations.map((conv, idx) => {
                  const title = conv.summary
                    ? conv.summary.length > 60 ? conv.summary.slice(0, 57) + '…' : conv.summary
                    : `Conversation ${idx + 1}`
                  return (
                    <tr
                      key={conv.id}
                      onClick={() => setSelectedConvId(conv.id)}
                      className="cursor-pointer transition-colors hover:bg-canvas-deep"
                    >
                      <td className="max-w-[280px] px-6 py-3.5">
                        <p className="truncate text-sm text-paper">{title}</p>
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="inline-flex items-center gap-1.5 text-sm text-muted">
                          <ChannelIcon channel={conv.channel} size={16} />
                          {CHANNEL_LABELS[conv.channel] || conv.channel}
                        </span>
                      </td>
                      <td className="px-6 py-3.5">
                        <Badge variant={STATUS_VARIANTS[conv.status] || 'neutral'}>
                          {conv.status === 'abandoned' ? 'Ended early' : conv.status === 'completed' ? 'Completed' : conv.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-3.5 text-sm tabular-nums text-muted">{formatDuration(conv.duration)}</td>
                      <td className="px-6 py-3.5 text-sm tabular-nums text-muted">{conv.messages}</td>
                      <td className="px-6 py-3.5 text-sm text-muted">
                        {END_REASON_LABELS[conv.endReason] || conv.endReason || '—'}
                      </td>
                      <td className="px-6 py-3.5 text-sm tabular-nums text-muted">{formatTime(conv.time)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConversationPanel conversationId={selectedConvId} onClose={() => setSelectedConvId(null)} />
    </div>
  )
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

function Th({
  children,
  sortable = false,
  onClick,
}: {
  children: ReactNode
  sortable?: boolean
  onClick?: () => void
}) {
  return (
    <th
      onClick={onClick}
      className={cn(
        'px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted',
        sortable && 'cursor-pointer select-none transition-colors hover:text-paper',
      )}
    >
      {children}
    </th>
  )
}

function MetricCard({
  label,
  value,
  Icon,
  tone,
}: {
  label: string
  value: string | number
  Icon: LucideIcon
  tone: 'mint' | 'sun' | 'neutral'
}) {
  const valueColour = tone === 'mint' ? 'text-mint' : tone === 'sun' ? 'text-sun' : 'text-paper'
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
        <span className="text-[11px] font-medium uppercase leading-tight tracking-wider text-muted">{label}</span>
      </div>
      <p className={cn('text-2xl font-bold tabular-nums', valueColour)}>{value}</p>
    </Card>
  )
}

function StatusItem({
  label,
  configured,
  detail,
  Icon,
}: {
  label: string
  configured: boolean
  detail: string
  Icon: LucideIcon
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-canvas-deep p-3">
      <Icon className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
      <div className="min-w-0">
        <div className="truncate text-xs font-semibold text-paper">{label}</div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', configured ? 'bg-mint' : 'bg-muted')} />
          <span className={cn('truncate text-[11px]', configured ? 'text-mint' : 'text-muted')}>{detail}</span>
        </div>
      </div>
    </div>
  )
}

function FilterPill({
  label,
  active,
  icon,
  onClick,
  count,
}: {
  label: string
  active: boolean
  icon: ReactNode
  onClick: () => void
  count: number
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-flare',
        active ? 'bg-flare/15 text-flare' : 'bg-canvas-deep text-muted hover:text-paper',
      )}
    >
      <span>{icon}</span>
      <span>{label}</span>
      <span
        className={cn(
          'rounded-full px-1.5 py-0.5 text-[10px] tabular-nums',
          active ? 'bg-flare/25 text-flare' : 'bg-canvas text-muted',
        )}
      >
        {count}
      </span>
    </button>
  )
}

// =============================================================================
// HELPERS
// =============================================================================

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    const now = new Date()
    const isToday = d.toDateString() === now.toDateString()
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    const isYesterday = d.toDateString() === yesterday.toDateString()

    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    if (isToday) return `Today ${time}`
    if (isYesterday) return `Yesterday ${time}`
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ` ${time}`
  } catch {
    return iso
  }
}
