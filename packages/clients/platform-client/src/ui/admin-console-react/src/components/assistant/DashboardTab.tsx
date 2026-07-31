import { useState, useEffect, useCallback } from 'react'

interface Metrics {
  totalConversations: number
  totalDurationSecs: number
  avgDurationSecs: number
  totalMessages: number
  avgMessages: number
  successRate: number
  escalationRate: number
  failCount: number
  successCount: number
}

interface EscalationData {
  currentQueueSize: number
  byChannel: { voice: number; sms: number; whatsapp: number }
  byUrgency: { high: number; medium: number; low: number }
  oldestWaitMinutes: number
}

interface EscalationEntry {
  id: string
  channel: string
  contactPhone: string
  contactName?: string
  reason: string
  urgency: string
  lastMessage: string
  status: string
  assignedTo?: string
  createdAt: string
  resolvedAt?: string
  waitMinutes: number
}

interface ConversationSummary {
  id: string
  startTime: number
  duration: number
  messages: number
  status: string
  success: string
  source: string
  language: string
  summary: string | null
  tools: string[]
  direction: string
  rating: number | null
  agentId: string | null
  agentName: string | null
  userId: string | null
}

interface DashboardData {
  metrics: Metrics
  escalation: EscalationData
  breakdown: {
    bySource: Record<string, number>
    byLanguage: Record<string, number>
    toolUsage: Record<string, number>
  }
  conversations: ConversationSummary[]
}

const defaultData: DashboardData = {
  metrics: {
    totalConversations: 0, totalDurationSecs: 0, avgDurationSecs: 0,
    totalMessages: 0, avgMessages: 0, successRate: 0, escalationRate: 0,
    failCount: 0, successCount: 0,
  },
  escalation: {
    currentQueueSize: 0,
    byChannel: { voice: 0, sms: 0, whatsapp: 0 },
    byUrgency: { high: 0, medium: 0, low: 0 },
    oldestWaitMinutes: 0,
  },
  breakdown: { bySource: {}, byLanguage: {}, toolUsage: {} },
  conversations: [],
}

function formatDuration(secs: number): string {
  if (secs < 60) return `${secs}s`
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

function timeAgo(unixSecs: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSecs
  if (diff < 60) return 'Just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return new Date(unixSecs * 1000).toLocaleDateString()
}

export default function DashboardTab() {
  const [data, setData] = useState<DashboardData>(defaultData)
  const [escalationQueue, setEscalationQueue] = useState<EscalationEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [, setLastRefresh] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date()
    return d.toISOString().split('T')[0] // YYYY-MM-DD
  })

  const isToday = selectedDate === new Date().toISOString().split('T')[0]

  const loadDashboardData = useCallback(async (date: string) => {
    setLoading(true)
    setError(null)
    try {
      const todayStr = new Date().toISOString().split('T')[0]
      const queryParam = date === todayStr ? 'range=today' : `date=${date}`
      const [convRes, escRes] = await Promise.all([
        fetch(`/api/analytics/conversations?${queryParam}`),
        fetch('/api/analytics/escalation-history'),
      ])

      if (convRes.ok) {
        const json = await convRes.json()
        if (json.success && json.data) {
          setData(json.data)
        } else {
          setError(json.error || 'Failed to load')
        }
      }

      if (escRes.ok) {
        const escJson = await escRes.json()
        if (escJson.success) {
          setEscalationQueue(escJson.data?.queue || [])
        }
      }

      setLastRefresh(new Date())
    } catch (e: any) {
      setError(e.message || 'Network error')
      console.log('Dashboard data not available:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDashboardData(selectedDate)
    const interval = setInterval(() => loadDashboardData(selectedDate), 30000)
    return () => clearInterval(interval)
  }, [loadDashboardData, selectedDate])

  const { metrics, escalation, breakdown, conversations } = data

  const sourceIcon = (src: string) => {
    if (src.includes('phone') || src.includes('twilio')) return '📞'
    if (src.includes('whatsapp')) return '📱'
    if (src.includes('sms')) return '💬'
    return '🌐' // web/widget
  }

  const successColor = (s: string) => {
    if (s === 'success') return 'text-green-600 bg-green-50'
    if (s === 'failure') return 'text-red-600 bg-red-50'
    return 'text-gray-500 bg-gray-50'
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
          <p className="text-gray-500">
            {isToday ? 'Live data from ElevenLabs' : `Data for ${new Date(selectedDate + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Date Picker */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const d = new Date(selectedDate + 'T00:00:00')
                d.setDate(d.getDate() - 1)
                setSelectedDate(d.toISOString().split('T')[0])
              }}
              className="px-2 py-2 border rounded-lg text-gray-600 hover:bg-gray-50 transition text-sm"
              title="Previous day"
            >◀</button>
            <input
              type="date"
              value={selectedDate}
              max={new Date().toISOString().split('T')[0]}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-2 border rounded-lg text-sm text-gray-700 bg-white focus:ring-2 focus:ring-purple-300 outline-none"
            />
            <button
              onClick={() => {
                const d = new Date(selectedDate + 'T00:00:00')
                d.setDate(d.getDate() + 1)
                const today = new Date().toISOString().split('T')[0]
                const next = d.toISOString().split('T')[0]
                if (next <= today) setSelectedDate(next)
              }}
              disabled={isToday}
              className="px-2 py-2 border rounded-lg text-gray-600 hover:bg-gray-50 transition text-sm disabled:opacity-30"
              title="Next day"
            >▶</button>
            {!isToday && (
              <button
                onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
                className="px-3 py-2 bg-purple-100 text-purple-700 rounded-lg text-sm font-medium hover:bg-purple-200 transition"
              >Today</button>
            )}
          </div>
          <span className="px-3 py-1.5 bg-green-100 text-green-700 rounded-full text-sm font-medium flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            Active
          </span>
          <button 
            onClick={() => loadDashboardData(selectedDate)}
            disabled={loading}
            className="px-4 py-2 border rounded-lg text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
          >
            {loading ? '⏳ Loading...' : '🔄 Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          ⚠️ {error}. Make sure ElevenLabs API key and Agent ID are configured in Platform Settings.
        </div>
      )}

      {/* Stats Grid — Real Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl border p-6 card-hover">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">{isToday ? "Today's" : 'Total'} Conversations</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{metrics.totalConversations}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-2xl">💬</div>
          </div>
          <p className="text-sm mt-3 text-purple-600">{metrics.totalMessages} total messages</p>
        </div>

        <div className="bg-white rounded-xl border p-6 card-hover">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">AI Success Rate</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{metrics.successRate}%</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-2xl">✅</div>
          </div>
          <p className="text-sm mt-3 text-green-600">{metrics.successCount} successful</p>
        </div>

        <div className="bg-white rounded-xl border p-6 card-hover">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Avg Duration</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{formatDuration(metrics.avgDurationSecs)}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center text-2xl">⏱️</div>
          </div>
          <p className="text-sm mt-3 text-blue-600">Total: {formatDuration(metrics.totalDurationSecs)}</p>
        </div>

        <div className="bg-white rounded-xl border p-6 card-hover">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Escalations</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{escalation.currentQueueSize}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center text-2xl">🚨</div>
          </div>
          <p className={`text-sm mt-3 ${escalation.currentQueueSize > 0 ? 'text-orange-600' : 'text-green-600'}`}>
            {escalation.currentQueueSize > 0 
              ? `${escalation.byUrgency.high} high priority` 
              : 'All handled by AI'}
          </p>
        </div>
      </div>

      {/* Channel Breakdown + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-2 bg-white rounded-xl border p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Conversations by Source</h3>
          {Object.keys(breakdown.bySource).length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">No conversations {isToday ? 'yet today' : 'on this date'}</p>
          ) : (
            <div className="space-y-4">
              {Object.entries(breakdown.bySource)
                .sort(([,a], [,b]) => b - a)
                .map(([source, count]) => (
                <div key={source} className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center text-lg">
                    {sourceIcon(source)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-700 capitalize">{source.replace(/_/g, ' ')}</span>
                      <span className="text-sm font-bold text-gray-900">{count}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-purple-500 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, (count / Math.max(1, metrics.totalConversations)) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Language Breakdown */}
          {Object.keys(breakdown.byLanguage).length > 0 && (
            <div className="mt-6 pt-4 border-t">
              <h4 className="text-sm font-medium text-gray-700 mb-3">Languages Used</h4>
              <div className="flex flex-wrap gap-2">
                {Object.entries(breakdown.byLanguage)
                  .sort(([,a], [,b]) => b - a)
                  .map(([lang, count]) => (
                    <span key={lang} className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
                      {lang.toUpperCase()} ({count})
                    </span>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-xl border p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
          <div className="space-y-3">
            <button 
              onClick={() => window.dispatchEvent(new CustomEvent('admin-navigate', { detail: { tab: 'calls' } }))}
              className="w-full flex items-center gap-3 p-3 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition"
            >
              <span className="text-xl">📞</span>
              <span className="font-medium">Voice Calls</span>
            </button>
            <button 
              onClick={() => window.dispatchEvent(new CustomEvent('admin-navigate', { detail: { tab: 'sms' } }))}
              className="w-full flex items-center gap-3 p-3 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition"
            >
              <span className="text-xl">💬</span>
              <span className="font-medium">SMS</span>
            </button>
            <button 
              onClick={() => window.dispatchEvent(new CustomEvent('admin-navigate', { detail: { tab: 'whatsapp' } }))}
              className="w-full flex items-center gap-3 p-3 bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition"
            >
              <span className="text-xl">📱</span>
              <span className="font-medium">WhatsApp</span>
            </button>
            <button 
              onClick={() => window.dispatchEvent(new CustomEvent('admin-navigate', { detail: { tab: 'analytics' } }))}
              className="w-full flex items-center gap-3 p-3 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 transition"
            >
              <span className="text-xl">📊</span>
              <span className="font-medium">View Analytics</span>
            </button>
          </div>
        </div>
      </div>

      {/* Escalation Queue (Live) */}
      <div className="bg-white rounded-xl border p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-gray-900">🚨 Escalation Queue</h3>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
              escalationQueue.length > 0 ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'
            }`}>
              {escalationQueue.length} waiting
            </span>
          </div>
        </div>
        {escalationQueue.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <span className="text-4xl">✅</span>
            <p className="mt-2">No conversations waiting for human agent</p>
          </div>
        ) : (
          <div className="space-y-3">
            {escalationQueue.map((esc) => (
              <div key={esc.id} className={`flex items-center justify-between p-4 rounded-xl border ${
                esc.urgency === 'high' ? 'bg-red-50 border-red-200' : 'bg-orange-50 border-orange-200'
              }`}>
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    esc.urgency === 'high' ? 'bg-red-100' : 'bg-orange-100'
                  }`}>
                    {esc.channel === 'voice' ? '📞' : esc.channel === 'whatsapp' ? '📱' : '💬'}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">
                      {esc.contactName || esc.contactPhone}
                      <span className={`ml-2 px-2 py-0.5 rounded text-xs font-medium ${
                        esc.urgency === 'high' ? 'bg-red-100 text-red-700' : 
                        esc.urgency === 'medium' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {esc.urgency}
                      </span>
                    </p>
                    <p className="text-sm text-gray-500">
                      {esc.channel} • {esc.reason} • Waiting {esc.waitMinutes}m
                    </p>
                    <p className="text-xs text-gray-400 mt-1 truncate max-w-md">"{esc.lastMessage}"</p>
                  </div>
                </div>
                <div className="text-right text-sm">
                  {esc.assignedTo && (
                    <p className="text-blue-600 font-medium">Assigned: {esc.assignedTo}</p>
                  )}
                  <p className="text-gray-400 text-xs mt-1">{esc.channel}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Conversations (from ElevenLabs) */}
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">📋 Recent Conversations</h3>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('admin-navigate', { detail: { tab: 'analytics' } }))}
            className="text-purple-600 text-sm font-medium hover:underline cursor-pointer"
          >
            View All →
          </button>
        </div>
        {conversations.length === 0 ? (
          <p className="text-center py-8 text-gray-400 text-sm">No conversations {isToday ? 'yet today' : 'on this date'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-3 font-medium">Source</th>
                  <th className="pb-3 font-medium">User</th>
                  <th className="pb-3 font-medium">Time</th>
                  <th className="pb-3 font-medium">Duration</th>
                  <th className="pb-3 font-medium">Messages</th>
                  <th className="pb-3 font-medium">Result</th>
                  <th className="pb-3 font-medium">Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {conversations.slice(0, 10).map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="py-3">
                      <span className="flex items-center gap-2">
                        {sourceIcon(c.source)}
                        <span className="capitalize text-gray-700">{c.source}</span>
                      </span>
                    </td>
                    <td className="py-3 text-gray-500 text-xs font-mono truncate max-w-[100px]" title={c.userId || ''}>{c.userId ? c.userId.slice(0, 8) + '...' : '—'}</td>
                    <td className="py-3 text-gray-600">{timeAgo(c.startTime)}</td>
                    <td className="py-3 text-gray-600">{formatDuration(c.duration)}</td>
                    <td className="py-3 text-gray-600">{c.messages}</td>
                    <td className="py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${successColor(c.success)}`}>
                        {c.success || 'unknown'}
                      </span>
                    </td>
                    <td className="py-3 text-gray-500 truncate max-w-xs">{c.summary || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
