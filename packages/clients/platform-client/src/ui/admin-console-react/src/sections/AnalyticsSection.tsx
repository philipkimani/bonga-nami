import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react'
import { ChannelIcon } from '../components/ui/ChannelIcon'
import { CHANNEL_LABELS, END_REASON_LABELS, formatDuration } from '../lib/labels'

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
  elevenLabs?: {
    agentId?: string
    apiKey?: string
  }
  conversationMode?: string
  backendApiUrl?: string
  twilio?: {
    accountSid?: string
    phoneNumber?: string
  }
  whatsapp?: {
    enabled?: boolean
  }
  widget?: {
    primaryColor?: string
    title?: string
  }
  escalation?: {
    enabled?: boolean
    phoneNumber?: string
  }
}

type DateRange = 'today' | 'yesterday' | 'week' | 'month' | '30days' | 'custom'

// =============================================================================
// CONSTANTS
// =============================================================================

const CHANNEL_GRADIENTS: Record<string, string> = {
  web_text: 'from-indigo-500 to-purple-500',
  web_voice: 'from-violet-500 to-fuchsia-500',
  voice: 'from-emerald-500 to-teal-500',
  whatsapp: 'from-green-500 to-green-600',
  sms: 'from-blue-500 to-cyan-500',
}

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  completed: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  abandoned: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  error: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  active: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
}

// =============================================================================
// CONVERSATION DETAIL TYPES
// =============================================================================

interface TranscriptEntry {
  role: 'user' | 'agent'
  message: string
  timeInCallSecs: number
}

interface ConversationDetail {
  conversationId: string
  agentName?: string
  status: string
  hasAudio: boolean
  transcript: TranscriptEntry[]
  metadata: {
    startTime?: number
    duration?: number
    cost?: number
    latencyAvg?: number
    latencyP95?: number
    turnCount?: number
    userTurnCount?: number
    agentTurnCount?: number
    interruptionCount?: number
  }
  analysis?: {
    callSuccessful?: string
    transcriptSummary?: string
  } | null
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

  // Conversation detail panel state
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null)
  const [convDetail, setConvDetail] = useState<ConversationDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // ── Data Loading ──────────────────────────────────────────────────────────

  const loadDashboard = useCallback(async () => {
    try {
      // Build query params for date range
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
        setError('Failed to load analytics')
      }

      if (configRes.ok) {
        const cfg = await configRes.json()
        // Backend returns { success, data: { ... } } — extract .data
        setPlatformConfig(cfg.data || cfg)
      }

      setLastRefresh(new Date())
    } catch (e) {
      setError('Network error loading analytics')
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

  // ── Conversation Detail Loading ───────────────────────────────────────────

  const openConversation = useCallback(async (id: string) => {
    setSelectedConvId(id)
    setConvDetail(null)
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/analytics/conversations/${id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('admin_token') || ''}` },
      })
      if (res.ok) {
        const json = await res.json()
        if (json.success) setConvDetail(json.data)
      }
    } catch (e) {
      console.error('[Analytics] Failed to load conversation detail:', e)
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const closeConversation = useCallback(() => {
    setSelectedConvId(null)
    setConvDetail(null)
  }, [])

  // ── Computed Values ───────────────────────────────────────────────────────

  const filteredConversations = useMemo(() => {
    if (!data) return []
    let list = channelFilter === 'all' ? data.recentConversations : data.recentConversations.filter(c => c.channel === channelFilter)
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
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }

  const sortArrow = (field: string) => sortField === field ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''

  const totalByChannel = useMemo(() => {
    if (!data) return 0
    return Object.values(data.breakdown.byChannel).reduce((a, b) => a + b, 0)
  }, [data])

  // Platform status helpers
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

  const dateRangeLabel = dateRange === 'custom' && customDate
    ? new Date(customDate + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
    : dateRange === 'yesterday'
    ? 'Yesterday'
    : dateRange === 'today'
    ? 'Today'
    : dateRange === 'week'
    ? 'This Week'
    : dateRange === 'month'
    ? 'This Month'
    : 'Last 30 Days'

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-indigo-200 border-t-indigo-600 mx-auto mb-4" />
          <p className="text-sm text-gray-500">Loading analytics...</p>
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <p className="text-red-600 font-medium mb-2">{error}</p>
        <button
          onClick={loadDashboard}
          className="px-4 py-2 bg-red-100 text-red-700 rounded-lg text-sm hover:bg-red-200 transition"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="space-y-6">
      {/* ── Header & Date Filter ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <span className="text-2xl">📊</span> Analytics
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {dateRangeLabel} • Updated {lastRefresh.toLocaleTimeString()}
            {loading && <span className="ml-2 text-indigo-500 animate-pulse">refreshing…</span>}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Date range pills */}
          <div className="flex bg-gray-100 rounded-xl p-1 gap-0.5">
            {([
              ['today', 'Today'],
              ['yesterday', 'Yesterday'],
              ['week', 'Week'],
              ['month', 'Month'],
              ['30days', '30 Days'],
            ] as [DateRange, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setDateRange(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  dateRange === key
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Custom date */}
          <input
            type="date"
            value={customDate}
            onChange={e => { setCustomDate(e.target.value); setDateRange('custom') }}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />

          {/* Controls */}
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
              className="rounded border-gray-300 text-indigo-600 w-3.5 h-3.5"
            />
            Auto
          </label>
          <button
            onClick={loadDashboard}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
            title="Refresh"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Real-time Metric Cards ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard
          label="Active Now"
          value={data.realtime.activeConversations}
          icon={<span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />}
          pulse={data.realtime.activeConversations > 0}
          gradient="from-emerald-500 to-emerald-600"
        />
        <MetricCard
          label={`${dateRangeLabel} Total`}
          value={data.realtime.todayTotal}
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>}
          gradient="from-blue-500 to-indigo-500"
        />
        <MetricCard
          label="Completed"
          value={data.realtime.todayCompleted}
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>}
          gradient="from-emerald-500 to-teal-500"
          valueColor="text-emerald-600"
        />
        <MetricCard
          label="Abandoned"
          value={data.realtime.todayAbandoned}
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>}
          gradient="from-amber-500 to-orange-500"
          valueColor="text-amber-600"
        />
        <MetricCard
          label="Avg Duration"
          value={formatDuration(data.realtime.avgDuration)}
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>}
          gradient="from-purple-500 to-pink-500"
        />
        <MetricCard
          label="Avg Messages"
          value={data.realtime.avgMessages}
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>}
          gradient="from-cyan-500 to-blue-500"
        />
      </div>

      {/* ── Platform Status Row ──────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="px-6 py-4 border-b bg-gradient-to-r from-slate-50 to-gray-50">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Platform Status</h2>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatusItem
              label="AI Agent"
              configured={agentConfigured}
              detail={agentConfigured ? 'Connected' : 'Not set'}
              icon="🤖"
            />
            <StatusItem
              label="Web Chat"
              configured={agentConfigured}
              detail={agentConfigured ? 'Active' : 'Needs Agent ID'}
              icon="💬"
            />
            <StatusItem
              label="Voice"
              configured={voiceConfigured}
              detail={voiceConfigured ? 'Enabled' : 'Text only'}
              icon="📞"
            />
            <StatusItem
              label="WhatsApp"
              configured={whatsappConfigured}
              detail={whatsappConfigured ? 'Connected' : 'Not set'}
              icon="📱"
            />
            <StatusItem
              label="SMS"
              configured={smsConfigured}
              detail={smsConfigured ? platformConfig.twilio!.phoneNumber!.slice(-4) : 'Not set'}
              icon="✉️"
            />
            <StatusItem
              label="Escalation"
              configured={escalationConfigured}
              detail={escalationConfigured ? 'Active' : 'Disabled'}
              icon="🔄"
            />
          </div>

          {/* Summary row */}
          <div className="mt-4 pt-4 border-t flex flex-wrap gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 rounded-full">
              <span className="text-xs font-medium text-indigo-700">
                {configuredChannels.length} Channel{configuredChannels.length !== 1 ? 's' : ''} Active
              </span>
            </div>
            {backendConfigured && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                <span className="text-xs font-medium text-green-700">Backend Connected</span>
              </div>
            )}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-50 rounded-full">
              <span className="text-xs font-medium text-purple-700">
                Mode: {platformConfig.conversationMode === 'text_only' ? 'Text Only' : 'Voice + Text'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Channel Breakdown + End Reasons ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Channel Breakdown */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">
            Conversations by Channel
          </h2>
          {totalByChannel === 0 ? (
            <div className="py-10 text-center">
              <div className="text-3xl mb-2 opacity-40">📡</div>
              <p className="text-gray-400 text-sm">No conversations in this period</p>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(data.breakdown.byChannel)
                .sort(([, a], [, b]) => b - a)
                .map(([channel, count]) => {
                  const pct = Math.round((count / totalByChannel) * 100)
                  return (
                    <div key={channel} className="group">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <ChannelIcon channel={channel} size={18} />
                          <span className="text-sm font-medium text-gray-700">{CHANNEL_LABELS[channel] || channel}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-900">{count}</span>
                          <span className="text-xs text-gray-400">{pct}%</span>
                        </div>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full bg-gradient-to-r ${CHANNEL_GRADIENTS[channel] || 'from-gray-400 to-gray-500'} rounded-full transition-all duration-700`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
            </div>
          )}
        </div>

        {/* End Reasons */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">
            Resolution Breakdown
          </h2>
          {data.breakdown.byEndReason.length === 0 ? (
            <div className="py-10 text-center">
              <div className="text-3xl mb-2 opacity-40">🏁</div>
              <p className="text-gray-400 text-sm">No completed conversations yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {data.breakdown.byEndReason
                .sort((a, b) => b.count - a.count)
                .map(({ reason, count }) => {
                  const total = data.breakdown.byEndReason.reduce((s, r) => s + r.count, 0)
                  const pct = total > 0 ? Math.round((count / total) * 100) : 0
                  return (
                    <div key={reason} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition">
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-700">
                          {END_REASON_LABELS[reason] || reason}
                        </div>
                        <div className="h-1.5 bg-gray-200 rounded-full mt-1.5 overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full transition-all duration-700"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className="text-sm font-bold text-gray-900">{count}</span>
                        <span className="text-xs text-gray-400 ml-1">{pct}%</span>
                      </div>
                    </div>
                  )
                })}
            </div>
          )}
        </div>
      </div>

      {/* ── Recent Conversations ─────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="px-6 py-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">
            Recent Conversations
          </h2>
          {/* Channel filter pills */}
          <div className="flex gap-1.5 flex-wrap">
            <FilterPill
              label="All"
              active={channelFilter === 'all'}
              icon={<svg style={{width:14,height:14}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>}
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
          <div className="p-12 text-center">
            <div className="text-3xl mb-3 opacity-40">💬</div>
            <p className="font-medium text-gray-500">No conversations found</p>
            <p className="text-sm text-gray-400 mt-1">
              {channelFilter !== 'all'
                ? `No ${CHANNEL_LABELS[channelFilter] || channelFilter} conversations in this period`
                : `No conversations for ${dateRangeLabel.toLowerCase()}`}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Conversation</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Channel</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:text-indigo-600 transition" onClick={() => toggleSort('duration')}>Duration{sortArrow('duration')}</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:text-indigo-600 transition" onClick={() => toggleSort('messages')}>Msgs{sortArrow('messages')}</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Resolution</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:text-indigo-600 transition" onClick={() => toggleSort('time')}>Timestamp{sortArrow('time')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredConversations.map((conv, idx) => {
                  const style = STATUS_STYLES[conv.status] || STATUS_STYLES.active
                  const title = conv.summary
                    ? conv.summary.length > 60 ? conv.summary.slice(0, 57) + '...' : conv.summary
                    : `Conversation #${idx + 1}`
                  return (
                    <tr
                      key={conv.id}
                      onClick={() => openConversation(conv.id)}
                      className="hover:bg-indigo-50/50 transition cursor-pointer group"
                    >
                      <td className="px-6 py-3.5 max-w-[280px]">
                        <p className="text-sm font-medium text-gray-900 group-hover:text-indigo-700 truncate transition">
                          {title}
                        </p>
                        <p className="text-xs text-gray-400 font-mono mt-0.5">{conv.id.slice(0, 12)}</p>
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="inline-flex items-center gap-1.5 text-sm">
                          <ChannelIcon channel={conv.channel} size={16} />
                          <span className="text-gray-700">{CHANNEL_LABELS[conv.channel] || conv.channel}</span>
                        </span>
                      </td>
                      <td className="px-6 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                          {conv.status}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-sm text-gray-600">{formatDuration(conv.duration)}</td>
                      <td className="px-6 py-3.5 text-sm text-gray-600">{conv.messages}</td>
                      <td className="px-6 py-3.5 text-sm text-gray-500">
                        {END_REASON_LABELS[conv.endReason] || conv.endReason || '—'}
                      </td>
                      <td className="px-6 py-3.5 text-sm text-gray-400">
                        {formatTime(conv.time)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Cost Optimization Banner ─────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 border border-emerald-200 rounded-xl p-5">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white text-lg flex-shrink-0">
            💰
          </div>
          <div>
            <h3 className="font-semibold text-emerald-800">Resource Optimization Active</h3>
            <p className="text-sm text-emerald-700 mt-1">
              {platformConfig.conversationMode === 'text_only' ? 'Text-only mode' : 'Voice + text mode'} with inactivity timeouts saving tokens.
              Abandoned conversations are terminated automatically.
            </p>
          </div>
        </div>
      </div>

      {/* ── Conversation Detail Slide-Out Panel ──────────────────────────── */}
      {selectedConvId && (
        <ConversationDetailPanel
          convId={selectedConvId}
          detail={convDetail}
          loading={detailLoading}
          onClose={closeConversation}
        />
      )}
    </div>
  )
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

function ConversationDetailPanel({
  convId,
  detail,
  loading,
  onClose,
}: {
  convId: string
  detail: ConversationDetail | null
  loading: boolean
  onClose: () => void
}) {
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40 transition-opacity"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="fixed top-0 right-0 h-full w-full max-w-lg bg-white shadow-2xl z-50 flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="px-6 py-4 border-b bg-gradient-to-r from-indigo-500 to-purple-600 text-white flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="font-semibold text-lg">Conversation Detail</h3>
            <p className="text-xs text-white/70 font-mono mt-0.5">{convId}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-200 border-t-indigo-600 mx-auto mb-3" />
                <p className="text-sm text-gray-500">Loading transcript...</p>
              </div>
            </div>
          ) : !detail ? (
            <div className="p-8 text-center text-gray-400">
              <p className="text-lg mb-2">⚠️</p>
              <p>Failed to load conversation details</p>
            </div>
          ) : (
            <div className="divide-y">
              {/* Metadata cards */}
              <div className="p-5">
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-[11px] text-gray-500 uppercase tracking-wider">Duration</p>
                    <p className="text-lg font-bold text-gray-900 mt-0.5">{formatDuration(detail.metadata.duration || 0)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-[11px] text-gray-500 uppercase tracking-wider">Turns</p>
                    <p className="text-lg font-bold text-gray-900 mt-0.5">{detail.metadata.turnCount || 0}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-[11px] text-gray-500 uppercase tracking-wider">Latency</p>
                    <p className="text-lg font-bold text-gray-900 mt-0.5">{detail.metadata.latencyAvg ? `${detail.metadata.latencyAvg}ms` : '—'}</p>
                  </div>
                </div>

                {/* Status + Cost row */}
                <div className="flex items-center gap-3 mt-3">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                    detail.status === 'done' ? 'bg-emerald-100 text-emerald-700'
                    : detail.status === 'processing' ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-600'
                  }`}>
                    {detail.status}
                  </span>
                  {detail.metadata.cost != null && (
                    <span className="text-xs text-gray-500">
                      Cost: ${typeof detail.metadata.cost === 'number' ? detail.metadata.cost.toFixed(4) : detail.metadata.cost}
                    </span>
                  )}
                  {detail.hasAudio && (
                    <span className="text-xs text-indigo-600 flex items-center gap-1">
                      🎙️ Has audio
                    </span>
                  )}
                </div>

                {/* Summary */}
                {detail.analysis?.transcriptSummary && (
                  <div className="mt-3 p-3 bg-indigo-50 rounded-lg">
                    <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wider mb-1">AI Summary</p>
                    <p className="text-sm text-indigo-900">{detail.analysis.transcriptSummary}</p>
                  </div>
                )}
              </div>

              {/* Transcript */}
              <div className="p-5">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
                  Conversation Flow ({detail.transcript.length} messages)
                </h4>
                <div className="space-y-3">
                  {detail.transcript.map((entry, i) => (
                    <div
                      key={i}
                      className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                          entry.role === 'user'
                            ? 'bg-indigo-600 text-white rounded-br-md'
                            : 'bg-gray-100 text-gray-800 rounded-bl-md'
                        }`}
                      >
                        <p className="text-sm leading-relaxed">{entry.message}</p>
                        <p className={`text-[10px] mt-1 ${
                          entry.role === 'user' ? 'text-indigo-200' : 'text-gray-400'
                        }`}>
                          {entry.role === 'user' ? '👤 User' : '🤖 Agent'}
                          {entry.timeInCallSecs != null && ` • ${formatDuration(Math.round(entry.timeInCallSecs))}`}
                        </p>
                      </div>
                    </div>
                  ))}
                  {detail.transcript.length === 0 && (
                    <p className="text-center text-gray-400 text-sm py-4">No transcript available</p>
                  )}
                </div>
              </div>

              {/* Analysis */}
              {detail.analysis?.callSuccessful && (
                <div className="p-5">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Analysis</h4>
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                      detail.analysis.callSuccessful === 'success'
                        ? 'bg-emerald-100 text-emerald-700'
                        : detail.analysis.callSuccessful === 'failure'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {detail.analysis.callSuccessful === 'success' ? '✓ Successful' : detail.analysis.callSuccessful === 'failure' ? '✗ Failed' : detail.analysis.callSuccessful}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in-right {
          animation: slideInRight 200ms ease-out;
        }
      `}</style>
    </>
  )
}

function MetricCard({
  label,
  value,
  icon,
  gradient = 'from-gray-500 to-gray-600',
  valueColor,
  pulse = false,
}: {
  label: string
  value: string | number
  icon: React.ReactNode
  gradient?: string
  valueColor?: string
  pulse?: boolean
}) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border p-4 transition-all hover:shadow-md ${pulse ? 'ring-2 ring-emerald-400/40' : ''}`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center text-white`}>
          {icon}
        </div>
        <span className="text-[11px] text-gray-500 uppercase tracking-wider font-medium leading-tight">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${valueColor || 'text-gray-900'}`}>{value}</p>
    </div>
  )
}

function StatusItem({
  label,
  configured,
  detail,
  icon,
}: {
  label: string
  configured: boolean
  detail: string
  icon: string
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition">
      <span className="text-lg">{icon}</span>
      <div className="min-w-0">
        <div className="text-xs font-semibold text-gray-700 truncate">{label}</div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${configured ? 'bg-emerald-500' : 'bg-gray-300'}`} />
          <span className={`text-[11px] truncate ${configured ? 'text-emerald-600' : 'text-gray-400'}`}>{detail}</span>
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
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
        active
          ? 'bg-indigo-100 text-indigo-700 shadow-sm'
          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
      }`}
    >
      <span>{icon}</span>
      <span>{label}</span>
      <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
        active ? 'bg-indigo-200 text-indigo-800' : 'bg-gray-200 text-gray-600'
      }`}>
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
