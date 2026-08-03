import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, X } from 'lucide-react'
import { ChannelIcon } from '../ui/ChannelIcon'

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

interface TranscriptEntry {
  role: string
  message: string
  timeInCallSecs: number
}

interface ConversationDetail {
  conversationId: string
  agentId: string
  agentName: string | null
  status: string
  hasAudio: boolean
  hasUserAudio: boolean
  hasResponseAudio: boolean
  transcript: TranscriptEntry[]
  metadata: {
    startTime: number
    duration: number
    cost: number
    latencyAvg: number
    latencyP95: number
    latencyP99: number
    turnCount: number
    userTurnCount: number
    agentTurnCount: number
    interruptionCount: number
  }
  analysis: {
    evaluationCriteria: any
    dataCollection: any
    callSuccessful: string
    transcriptSummary: string
  } | null
}

interface AnalyticsData {
  metrics: Metrics
  breakdown: {
    bySource: Record<string, number>
    byLanguage: Record<string, number>
    toolUsage: Record<string, number>
  }
  conversations: ConversationSummary[]
}

const defaultData: AnalyticsData = {
  metrics: {
    totalConversations: 0, totalDurationSecs: 0, avgDurationSecs: 0,
    totalMessages: 0, avgMessages: 0, successRate: 0, escalationRate: 0,
    failCount: 0, successCount: 0,
  },
  breakdown: { bySource: {}, byLanguage: {}, toolUsage: {} },
  conversations: [],
}

const rangeMap: Record<string, string> = {
  'Today': 'today',
  'This Week': 'week',
  'This Month': 'month',
  'Last 30 Days': '30days',
}

function fmtDuration(secs: number): string {
  if (secs < 60) return `${secs}s`
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

function fmtTime(unixSecs: number): string {
  return new Date(unixSecs * 1000).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function AnalyticsTab() {
  const timeRanges = ['Today', 'This Week', 'This Month', 'Last 30 Days'] as const
  const [selectedRange, setSelectedRange] = useState<string>('Today')
  const [data, setData] = useState<AnalyticsData>(defaultData)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedConvo, setSelectedConvo] = useState<ConversationDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [feedbackSent, setFeedbackSent] = useState<Record<string, string>>({})

  const loadAnalytics = useCallback(async (range: string) => {
    setLoading(true)
    setError(null)
    try {
      const q = rangeMap[range] || 'today'
      const res = await fetch(`/api/analytics/conversations?range=${q}`)
      if (res.ok) {
        const json = await res.json()
        if (json.success && json.data) {
          setData(json.data)
        } else {
          setError(json.error || 'Failed to load analytics')
        }
      }
    } catch (e: any) {
      setError(e.message || 'Network error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAnalytics(selectedRange)
  }, [loadAnalytics, selectedRange])

  const loadConversationDetail = async (id: string) => {
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/analytics/conversations/${id}`)
      if (res.ok) {
        const json = await res.json()
        if (json.success) setSelectedConvo(json.data)
      }
    } catch (e) {
      console.error('Failed to load conversation detail:', e)
    } finally {
      setDetailLoading(false)
    }
  }

  const sendFeedback = async (convoId: string, feedback: 'like' | 'dislike') => {
    try {
      const res = await fetch(`/api/analytics/conversations/${convoId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback }),
      })
      if (res.ok) {
        setFeedbackSent(prev => ({ ...prev, [convoId]: feedback }))
      }
    } catch (e) {
      console.error('Failed to send feedback:', e)
    }
  }

  const { metrics, breakdown, conversations } = data

  const sourceChannel = (src: string) => {
    if (src.includes('Phone')) return 'voice'
    if (src.includes('WhatsApp') || src.includes('whatsapp')) return 'whatsapp'
    if (src.includes('SMS') || src.includes('sms')) return 'sms'
    return 'web_text'
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-paper"> Analytics</h2>
          <p className="text-muted">Live data from ElevenLabs Conversations API</p>
        </div>
        <div className="flex gap-2">
          {timeRanges.map((range) => (
            <button
              key={range}
              onClick={() => setSelectedRange(range)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                selectedRange === range
                  ? 'bg-flare/15 text-flare'
                  : 'bg-canvas-deep text-muted hover:bg-canvas-deep'
              }`}
            >
              {range}
            </button>
          ))}
          <button
            onClick={() => loadAnalytics(selectedRange)}
            disabled={loading}
            className="px-4 py-2 border rounded-lg text-muted hover:bg-canvas-deep transition disabled:opacity-50 text-sm"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-flare/15 border border-flare rounded-xl text-flare text-sm">
          {error}. Make sure ElevenLabs API key and Agent ID are configured in Platform Settings.
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <div className="bg-canvas-deep rounded-xl p-5 text-paper">
          <p className="text-paper/80 text-xs">Total Conversations</p>
          <p className="text-2xl font-bold mt-1">{metrics.totalConversations.toLocaleString()}</p>
          <p className="text-xs text-paper/60 mt-1">{selectedRange}</p>
        </div>
        <div className="bg-canvas-deep rounded-xl p-5 text-paper">
          <p className="text-paper/80 text-xs">Total Messages</p>
          <p className="text-2xl font-bold mt-1">{metrics.totalMessages.toLocaleString()}</p>
          <p className="text-xs text-paper/60 mt-1">~{metrics.avgMessages} avg/convo</p>
        </div>
        <div className="bg-canvas-deep rounded-xl p-5 text-paper">
          <p className="text-paper/80 text-xs">Total Call Time</p>
          <p className="text-2xl font-bold mt-1">{fmtDuration(metrics.totalDurationSecs)}</p>
          <p className="text-xs text-paper/60 mt-1">Avg: {fmtDuration(metrics.avgDurationSecs)}</p>
        </div>
        <div className="bg-canvas-deep rounded-xl p-5 text-paper">
          <p className="text-paper/80 text-xs">Success Rate</p>
          <p className="text-2xl font-bold mt-1">{metrics.successRate}%</p>
          <p className="text-xs text-paper/60 mt-1">{metrics.successCount} successful</p>
        </div>
        <div className="bg-canvas-deep rounded-xl p-5 text-paper">
          <p className="text-paper/80 text-xs">Escalation Rate</p>
          <p className="text-2xl font-bold mt-1">{metrics.escalationRate}%</p>
          <p className="text-xs text-paper/60 mt-1">{metrics.failCount} failed</p>
        </div>
        <div className="bg-canvas-deep rounded-xl p-5 text-paper">
          <p className="text-paper/80 text-xs">Avg Duration</p>
          <p className="text-2xl font-bold mt-1">{fmtDuration(metrics.avgDurationSecs)}</p>
          <p className="text-xs text-paper/60 mt-1">Per conversation</p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Source Breakdown */}
        <div className="bg-canvas-2 border rounded-xl p-6">
          <h3 className="font-semibold text-paper mb-4">By Source</h3>
          {Object.keys(breakdown.bySource).length === 0 ? (
            <p className="text-center text-muted text-sm py-8">No data yet</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(breakdown.bySource).sort(([,a],[,b]) => b - a).map(([src, count]) => (
                <div key={src}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted inline-flex items-center gap-1.5"><ChannelIcon channel={sourceChannel(src)} size={14} /> {src.replace(/_/g, ' ')}</span>
                    <span className="font-medium">{count}</span>
                  </div>
                  <div className="h-2.5 bg-canvas-deep rounded-full overflow-hidden">
                    <div className="h-full bg-flare rounded-full transition-all" style={{ width: `${(count / Math.max(1, metrics.totalConversations)) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Resolution Donut */}
        <div className="bg-canvas-2 border rounded-xl p-6">
          <h3 className="font-semibold text-paper mb-4">Resolution Breakdown</h3>
          <div className="flex items-center justify-center h-48">
            <div className="relative w-40 h-40">
              <svg className="w-full h-full" viewBox="0 0 36 36">
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none" stroke="rgba(185,168,212,0.22)" strokeWidth="3"
                />
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none" stroke="#FF2E88" strokeWidth="3"
                  strokeDasharray={`${metrics.successRate}, 100`} strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-3xl font-bold text-paper">{metrics.successRate}%</p>
                  <p className="text-xs text-muted">AI Success</p>
                </div>
              </div>
            </div>
          </div>
          <div className="flex justify-center gap-6 mt-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-flare rounded-full" />
              <span className="text-sm text-muted">Success ({metrics.successCount})</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-canvas-deep rounded-full" />
              <span className="text-sm text-muted">Failed ({metrics.failCount})</span>
            </div>
          </div>
        </div>

        {/* Language + Tools */}
        <div className="bg-canvas-2 border rounded-xl p-6">
          <h3 className="font-semibold text-paper mb-4">Languages & Tools</h3>
          
          {Object.keys(breakdown.byLanguage).length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-medium text-muted uppercase mb-2">Languages</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(breakdown.byLanguage).sort(([,a],[,b]) => b - a).map(([lang, count]) => (
                  <span key={lang} className="px-2.5 py-1 bg-canvas-deep text-muted rounded-full text-xs font-medium">
                    {lang.toUpperCase()} ({count})
                  </span>
                ))}
              </div>
            </div>
          )}

          {Object.keys(breakdown.toolUsage).length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted uppercase mb-2">Tools Used</p>
              <div className="space-y-2">
                {Object.entries(breakdown.toolUsage).sort(([,a],[,b]) => b - a).slice(0, 8).map(([tool, count]) => (
                  <div key={tool} className="flex items-center justify-between text-sm">
                    <span className="text-muted truncate mr-2">{tool}</span>
                    <span className="font-medium text-paper shrink-0">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {Object.keys(breakdown.byLanguage).length === 0 && Object.keys(breakdown.toolUsage).length === 0 && (
            <p className="text-center text-muted text-sm py-8">No data yet</p>
          )}
        </div>
      </div>

      {/* Side Panel for Conversation Detail */}
      {selectedConvo && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelectedConvo(null)}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="relative w-full max-w-lg bg-canvas-2 h-full overflow-y-auto animate-slide-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Panel Header */}
            <div className="sticky top-0 bg-canvas-2 border-b p-4 z-10">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-paper">Conversation Detail</h3>
                  <p className="text-sm text-muted mt-0.5">
                    {selectedConvo.metadata?.startTime ? fmtTime(selectedConvo.metadata.startTime) : '—'} &bull; {fmtDuration(selectedConvo.metadata?.duration || 0)}
                  </p>
                </div>
                <button onClick={() => setSelectedConvo(null)} aria-label="Close" className="w-8 h-8 flex items-center justify-center rounded-full text-muted transition-colors hover:bg-canvas-deep hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-flare"><X className="h-4 w-4" aria-hidden="true" /></button>
              </div>

              {/* IDs */}
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="px-2 py-1 bg-canvas-deep text-muted rounded font-mono" title="Conversation ID">
                  ID: {selectedConvo.conversationId?.slice(0, 12)}...
                </span>
                {selectedConvo.agentId && (
                  <span className="px-2 py-1 bg-flare/15 text-flare rounded font-mono" title="Agent ID">
                    Agent: {selectedConvo.agentId.slice(0, 12)}...
                  </span>
                )}
                {selectedConvo.agentName && (
                  <span className="px-2 py-1 bg-canvas-deep text-muted rounded">
                    {selectedConvo.agentName}
                  </span>
                )}
              </div>
            </div>

            {/* Stats Grid */}
            <div className="p-4 bg-canvas-deep border-b grid grid-cols-4 gap-3 text-center text-xs">
              <div>
                <p className="text-muted">Turns</p>
                <p className="font-bold text-paper text-sm">{selectedConvo.metadata?.turnCount ?? '—'}</p>
              </div>
              <div>
                <p className="text-muted">User</p>
                <p className="font-bold text-paper text-sm">{selectedConvo.metadata?.userTurnCount ?? '—'}</p>
              </div>
              <div>
                <p className="text-muted">Agent</p>
                <p className="font-bold text-paper text-sm">{selectedConvo.metadata?.agentTurnCount ?? '—'}</p>
              </div>
              <div>
                <p className="text-muted">Latency</p>
                <p className="font-bold text-paper text-sm">{selectedConvo.metadata?.latencyAvg ? `${selectedConvo.metadata.latencyAvg}ms` : '—'}</p>
              </div>
            </div>

            {/* Extra Metadata */}
            <div className="px-4 py-2 bg-canvas-deep border-b flex gap-4 text-xs text-muted">
              {selectedConvo.metadata?.cost != null && (
                <span>Cost: ${selectedConvo.metadata.cost.toFixed(4)}</span>
              )}
              {selectedConvo.metadata?.interruptionCount != null && (
                <span>Interruptions: {selectedConvo.metadata.interruptionCount}</span>
              )}
              {selectedConvo.hasAudio && (
                <a
                  href={`/api/analytics/conversations/${selectedConvo.conversationId}/audio`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-flare hover:underline"
                > Play Audio</a>
              )}
            </div>

            {/* Summary */}
            {selectedConvo.analysis?.transcriptSummary && (
              <div className="px-4 py-3 bg-flare/15 border-b">
                <p className="text-sm text-flare"><strong>Summary:</strong> {selectedConvo.analysis.transcriptSummary}</p>
              </div>
            )}

            {/* Feedback */}
            <div className="px-4 py-3 border-b flex items-center gap-3">
              <span className="text-sm text-muted font-medium">Rate this conversation:</span>
              {feedbackSent[selectedConvo.conversationId] ? (
                <span className={`text-sm font-medium ${feedbackSent[selectedConvo.conversationId] === 'like' ? 'text-mint' : 'text-flare'}`}>
                  {feedbackSent[selectedConvo.conversationId] === 'like' ? 'Liked' : 'Disliked'}
                </span>
              ) : (
                <>
                  <button
                    onClick={() => sendFeedback(selectedConvo.conversationId, 'like')}
                    className="px-3 py-1 bg-mint/15 text-mint rounded-lg hover:bg-mint/15 text-sm transition"
                  > Good</button>
                  <button
                    onClick={() => sendFeedback(selectedConvo.conversationId, 'dislike')}
                    className="px-3 py-1 bg-flare/15 text-flare rounded-lg hover:bg-flare/15 text-sm transition"
                  > Bad</button>
                </>
              )}
            </div>

            {/* Transcript */}
            <div className="p-4 space-y-3">
              <h4 className="text-sm font-semibold text-muted mb-2">Transcript</h4>
              {selectedConvo.transcript.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'agent' ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[85%] px-3 py-2 rounded-xl text-sm ${
                    msg.role === 'agent'
                      ? 'bg-canvas-deep text-paper'
                      : 'bg-flare/15 text-flare'
                  }`}>
                    <p className="text-xs font-medium mb-1 opacity-60">
                      {msg.role === 'agent' ? 'AI' : 'User'} &bull; {fmtDuration(Math.round(msg.timeInCallSecs || 0))}
                    </p>
                    <p>{msg.message}</p>
                  </div>
                </div>
              ))}
              {selectedConvo.transcript.length === 0 && (
                <p className="text-center text-muted py-4">No transcript available</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* All Conversations Table */}
      <div className="bg-canvas-2 border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-paper">All Conversations ({conversations.length})</h3>
        </div>
        {conversations.length === 0 ? (
          <div className="text-center py-8 text-muted">
            <p className="mt-2 text-sm">No conversations found for {selectedRange.toLowerCase()}.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b">
                  <th className="pb-3 font-medium">Source</th>
                  <th className="pb-3 font-medium">User</th>
                  <th className="pb-3 font-medium">Agent</th>
                  <th className="pb-3 font-medium">Time</th>
                  <th className="pb-3 font-medium">Duration</th>
                  <th className="pb-3 font-medium">Msgs</th>
                  <th className="pb-3 font-medium">Lang</th>
                  <th className="pb-3 font-medium">Result</th>
                  <th className="pb-3 font-medium">Summary</th>
                  <th className="pb-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {conversations.map((c) => (
                  <tr key={c.id} className="hover:bg-canvas-deep cursor-pointer" onClick={() => loadConversationDetail(c.id)}>
                    <td className="py-3">
                      <span className="flex items-center gap-1.5">
                        <ChannelIcon channel={sourceChannel(c.source)} size={14} />
                        <span className="text-muted text-xs">{c.source}</span>
                      </span>
                    </td>
                    <td className="py-3 text-muted text-xs font-mono truncate max-w-[80px]" title={c.userId || ''}>
                      {c.userId ? c.userId.slice(0, 8) + '...' : '—'}
                    </td>
                    <td className="py-3 text-muted text-xs truncate max-w-[80px]" title={c.agentId || ''}>
                      {c.agentName || (c.agentId ? c.agentId.slice(0, 8) + '...' : '—')}
                    </td>
                    <td className="py-3 text-muted whitespace-nowrap text-xs">{fmtTime(c.startTime)}</td>
                    <td className="py-3 text-muted text-xs">{fmtDuration(c.duration)}</td>
                    <td className="py-3 text-muted text-xs">{c.messages}</td>
                    <td className="py-3">
                      <span className="px-2 py-0.5 bg-canvas-deep text-muted rounded text-xs">
                        {(c.language || '—').toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        c.success === 'success' ? 'bg-mint/15 text-mint' :
                        c.success === 'failure' ? 'bg-flare/15 text-flare' :
                        'bg-canvas-deep text-muted'
                      }`}>
                        {c.success || 'unknown'}
                      </span>
                    </td>
                    <td className="py-3 text-muted truncate max-w-[160px] text-xs">{c.summary || '—'}</td>
                    <td className="py-3">
                      <button
                        onClick={(e) => { e.stopPropagation(); loadConversationDetail(c.id) }}
                        disabled={detailLoading}
                        className="text-flare hover:text-flare text-xs font-medium whitespace-nowrap"
                      >
                        {detailLoading ? '...' : 'View →'}
                      </button>
                    </td>
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
