import { useState, useEffect, useMemo } from 'react'
import { BarChart3, Check, MessageSquare, Mic } from 'lucide-react'

interface WebChatConversation {
  conversation_id: string
  agent_id: string
  status: string
  start_time: string
  end_time?: string
  call_duration_secs: number
  message_count: number
  summary: string | null
  hasAudio: boolean
}

type ModeFilter = 'all' | 'text' | 'voice'
type SortField = 'time' | 'duration' | 'messages'
type SortDir = 'asc' | 'desc'

export default function WebChatTab() {
  const [conversations, setConversations] = useState<WebChatConversation[]>([])
  const [loading, setLoading] = useState(true)
  const [agentId, setAgentId] = useState<string>('')
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all')
  const [sortField, setSortField] = useState<SortField>('time')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const configRes = await fetch('/api/admin/config/platform', {
        headers: { Authorization: `Bearer ${localStorage.getItem('admin_token') || ''}` },
      })
      if (configRes.ok) {
        const cfgJson = await configRes.json()
        const cfg = cfgJson.data || cfgJson
        setAgentId(cfg.elevenLabs?.agentId || '')
      }

      const convoRes = await fetch('/api/analytics/conversations?range=30days', {
        headers: { Authorization: `Bearer ${localStorage.getItem('admin_token') || ''}` },
      })
      if (convoRes.ok) {
        const resJson = await convoRes.json()
        const convos = resJson?.data?.conversations || resJson?.conversations || []
        if (convos.length > 0) {
          const webConvos = convos.filter((c: any) => {
            const src = c.source || c.conversation_initiation_source || ''
            return !src || src === 'Web Chat' || src === 'unknown' || src === '' || src === 'conversation_url'
          }).slice(0, 50).map((c: any) => ({
            conversation_id: c.id || c.conversation_id,
            agent_id: c.agentId || c.agent_id,
            status: c.status,
            start_time: c.startTime
              ? new Date(c.startTime * 1000).toISOString()
              : c.start_time || '',
            call_duration_secs: c.duration || c.call_duration_secs || 0,
            message_count: c.messages || c.message_count || 0,
            summary: c.summary || null,
            hasAudio: !!c.hasAudio,
          }))
          setConversations(webConvos)
        }
      }
    } catch (err) {
      console.error('[WebChatTab] Failed to load data:', err)
    } finally {
      setLoading(false)
    }
  }

  // Sorting + filtering
  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }
  const sortArrow = (field: SortField) => sortField === field ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''

  const filteredConversations = useMemo(() => {
    let list = conversations
    if (modeFilter === 'text') list = list.filter(c => !c.hasAudio)
    else if (modeFilter === 'voice') list = list.filter(c => c.hasAudio)
    return [...list].sort((a, b) => {
      let va: number, vb: number
      if (sortField === 'time') { va = new Date(a.start_time).getTime(); vb = new Date(b.start_time).getTime() }
      else if (sortField === 'duration') { va = a.call_duration_secs; vb = b.call_duration_secs }
      else { va = a.message_count; vb = b.message_count }
      return sortDir === 'asc' ? va - vb : vb - va
    })
  }, [conversations, modeFilter, sortField, sortDir])

  const textCount = conversations.filter(c => !c.hasAudio).length
  const voiceCount = conversations.filter(c => c.hasAudio).length

  // Conversation detail state
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null)
  const [convDetail, setConvDetail] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  async function openConversation(id: string) {
    setSelectedConvId(id)
    setDetailLoading(true)
    setConvDetail(null)
    try {
      const res = await fetch(`/api/analytics/conversations/${id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('admin_token') || ''}` },
      })
      if (res.ok) {
        const json = await res.json()
        setConvDetail(json.data || json)
      }
    } catch (err) {
      console.error('[WebChatTab] Failed to load conversation detail:', err)
    } finally {
      setDetailLoading(false)
    }
  }

  function closeConversation() {
    setSelectedConvId(null)
    setConvDetail(null)
  }

  const isConfigured = !!agentId

  // Stats
  const totalConversations = filteredConversations.length
  const avgDuration = totalConversations > 0
    ? Math.round(filteredConversations.reduce((sum, c) => sum + (c.call_duration_secs || 0), 0) / totalConversations)
    : 0
  const avgMessages = totalConversations > 0
    ? Math.round(filteredConversations.reduce((sum, c) => sum + (c.message_count || 0), 0) / totalConversations)
    : 0

  function formatDuration(secs: number): string {
    if (secs < 60) return `${secs}s`
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}m ${s}s`
  }

  function formatTime(iso: string): string {
    try {
      return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    } catch { return iso }
  }

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-flare mx-auto mb-4" />
        <p className="text-muted">Loading Web Chat data...</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-canvas-deep flex items-center justify-center">
            <MessageSquare className="h-5 w-5 text-muted" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-paper">Web Chat</h2>
            <p className="text-sm text-muted">Website chat widget conversations</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
            isConfigured ? 'bg-mint/15 text-mint-ink' : 'bg-sun/20 text-sun-ink'
          }`}>
            <span className={`w-2 h-2 rounded-full ${isConfigured ? 'bg-mint' : 'bg-sun'}`} />
            {isConfigured ? 'Configured' : 'Not Configured'}
          </span>
          <button
            onClick={loadData}
            className="px-3 py-1.5 text-sm text-muted hover:text-paper border rounded-lg hover:bg-canvas-deep transition"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-canvas-deep rounded-xl p-4 text-paper">
          <p className="text-xs text-flare-ink">Total Conversations</p>
          <p className="text-2xl font-bold mt-1">{totalConversations}</p>
          <p className="text-xs text-flare-ink mt-1">
            {textCount} text · {voiceCount} voice
          </p>
        </div>
        <div className="bg-canvas-deep rounded-xl p-4 text-paper">
          <p className="text-xs text-flare-ink">Avg Duration</p>
          <p className="text-2xl font-bold mt-1">{formatDuration(avgDuration)}</p>
          <p className="text-xs text-flare-ink mt-1">Per conversation</p>
        </div>
        <div className="bg-canvas-deep rounded-xl p-4 text-paper">
          <p className="text-xs text-mint-ink">Avg Messages</p>
          <p className="text-2xl font-bold mt-1">{avgMessages}</p>
          <p className="text-xs text-mint-ink mt-1">Per conversation</p>
        </div>
        <div className="bg-canvas-deep rounded-xl p-4 text-paper">
          <p className="text-xs text-flare-ink">Widget Status</p>
          <p className="text-2xl font-bold mt-1">{isConfigured ? <Check className="h-6 w-6 text-mint-ink" aria-hidden="true" /> : '—'}</p>
          <p className="text-xs text-flare-ink mt-1">{isConfigured ? 'Active' : 'Setup needed'}</p>
        </div>
      </div>

      {/* Recent Conversations */}
      <div className="bg-canvas-2 border rounded-xl overflow-hidden">
        <div className="p-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="font-semibold text-paper">Recent Web Chat Conversations</h3>
          <div className="flex items-center gap-2">
            {/* Text / Voice filter pills */}
            {(['all', 'text', 'voice'] as ModeFilter[]).map(mode => {
              const count = mode === 'all' ? conversations.length : mode === 'text' ? textCount : voiceCount
              const Icons = { all: BarChart3, text: MessageSquare, voice: Mic }
              const labels = { all: 'All', text: 'Text', voice: 'Voice' }
              return (
                <button
                  key={mode}
                  onClick={() => setModeFilter(mode)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition ${
                    modeFilter === mode
                      ? 'bg-flare/12 text-flare-ink ring-1 ring-flare-ink'
                      : 'bg-canvas-deep text-muted hover:bg-canvas-deep'
                  }`}
                >
                  {(() => { const I = Icons[mode]; return <I className="h-3.5 w-3.5" aria-hidden="true" /> })()}
                  {labels[mode]}
                  <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] ${
                    modeFilter === mode ? 'bg-flare/25 text-flare-ink' : 'bg-canvas-deep text-muted'
                  }`}>{count}</span>
                </button>
              )
            })}
          </div>
        </div>

        {filteredConversations.length === 0 ? (
          <div className="p-12 text-center text-muted">
            <p className="font-medium text-muted">No {modeFilter !== 'all' ? modeFilter : 'web chat'} conversations yet</p>
            <p className="text-sm mt-1">Conversations will appear here once users start chatting via the widget.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-canvas-deep">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider w-[40%]">Conversation</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">Mode</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider cursor-pointer select-none hover:text-flare-ink transition" onClick={() => toggleSort('duration')}>Duration{sortArrow('duration')}</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider cursor-pointer select-none hover:text-flare-ink transition" onClick={() => toggleSort('messages')}>Msgs{sortArrow('messages')}</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider cursor-pointer select-none hover:text-flare-ink transition" onClick={() => toggleSort('time')}>Time{sortArrow('time')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredConversations.map((convo, idx) => {
                  const title = convo.summary
                    ? convo.summary.length > 55 ? convo.summary.slice(0, 52) + '...' : convo.summary
                    : `Conversation #${idx + 1}`
                  return (
                    <tr
                      key={convo.conversation_id}
                      onClick={() => openConversation(convo.conversation_id)}
                      className="hover:bg-flare/12/50 transition cursor-pointer group"
                    >
                      <td className="px-4 py-3 max-w-[320px]">
                        <p className="text-sm font-medium text-paper group-hover:text-flare-ink truncate transition">
                          {title}
                        </p>
                        {convo.summary && (
                          <p className="text-xs text-muted mt-0.5 truncate">{convo.summary}</p>
                        )}
                        <p className="text-[11px] text-muted font-mono mt-0.5">{convo.conversation_id.slice(0, 16)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          convo.hasAudio
                            ? 'bg-flare/12 text-flare-ink'
                            : 'bg-canvas-deep text-muted'
                        }`}>
                          {convo.hasAudio ? 'Voice' : 'Text'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted">
                        {convo.call_duration_secs ? formatDuration(convo.call_duration_secs) : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted">
                        {convo.message_count ?? 0}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          convo.status === 'done'
                            ? 'bg-mint/15 text-mint-ink'
                            : convo.status === 'processing'
                            ? 'bg-canvas-deep text-muted'
                            : 'bg-canvas-deep text-muted'
                        }`}>
                          {convo.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted">
                        {formatTime(convo.start_time)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Conversation Detail Slide-out */}
      {selectedConvId && (
        <>
          <div className="fixed inset-0 bg-black/20 z-40" onClick={closeConversation} />
          <div className="fixed top-0 right-0 h-full w-full max-w-lg bg-canvas-2 z-50 flex flex-col" style={{ animation: 'slideInRight 200ms ease-out' }}>
            {/* Header */}
            <div className="px-6 py-4 border-b bg-canvas-deep text-paper flex items-center justify-between flex-shrink-0">
              <div>
                <h3 className="font-semibold text-lg">Conversation Detail</h3>
                <p className="text-xs text-paper/70 font-mono mt-0.5">{selectedConvId}</p>
              </div>
              <button onClick={closeConversation} className="p-2 hover:bg-canvas-deep rounded-lg transition">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {detailLoading ? (
                <div className="flex items-center justify-center h-48">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-flare border-t-indigo-600 mx-auto mb-3" />
                    <p className="text-sm text-muted">Loading transcript...</p>
                  </div>
                </div>
              ) : !convDetail ? (
                <div className="p-8 text-center text-muted">
                  <p>Failed to load conversation details</p>
                </div>
              ) : (
                <div className="divide-y">
                  {/* Metadata */}
                  <div className="p-5">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-canvas-deep rounded-lg p-3 text-center">
                        <p className="text-[11px] text-muted uppercase tracking-wider">Duration</p>
                        <p className="text-lg font-bold text-paper mt-0.5">{formatDuration(convDetail.metadata?.duration || 0)}</p>
                      </div>
                      <div className="bg-canvas-deep rounded-lg p-3 text-center">
                        <p className="text-[11px] text-muted uppercase tracking-wider">Turns</p>
                        <p className="text-lg font-bold text-paper mt-0.5">{convDetail.metadata?.turnCount || 0}</p>
                      </div>
                      <div className="bg-canvas-deep rounded-lg p-3 text-center">
                        <p className="text-[11px] text-muted uppercase tracking-wider">Latency</p>
                        <p className="text-lg font-bold text-paper mt-0.5">{convDetail.metadata?.latencyAvg ? `${convDetail.metadata.latencyAvg}ms` : '—'}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 mt-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                        convDetail.status === 'done' ? 'bg-mint/15 text-mint-ink'
                        : convDetail.status === 'processing' ? 'bg-canvas-deep text-muted'
                        : 'bg-canvas-deep text-muted'
                      }`}>{convDetail.status}</span>
                      {convDetail.metadata?.cost != null && (
                        <span className="text-xs text-muted">Cost: ${typeof convDetail.metadata.cost === 'number' ? convDetail.metadata.cost.toFixed(4) : convDetail.metadata.cost}</span>
                      )}
                    </div>

                    {convDetail.analysis?.transcriptSummary && (
                      <div className="mt-3 p-3 bg-flare/12 rounded-lg">
                        <p className="text-xs font-semibold text-flare-ink uppercase tracking-wider mb-1">AI Summary</p>
                        <p className="text-sm text-flare-ink">{convDetail.analysis.transcriptSummary}</p>
                      </div>
                    )}
                  </div>

                  {/* Transcript */}
                  <div className="p-5">
                    <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-4">
                      Conversation Flow ({convDetail.transcript?.length || 0} messages)
                    </h4>
                    <div className="space-y-3">
                      {(convDetail.transcript || []).map((entry: any, i: number) => (
                        <div key={i} className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                            entry.role === 'user'
                              ? 'bg-flare text-paper rounded-br-md'
                              : 'bg-canvas-deep text-paper rounded-bl-md'
                          }`}>
                            <p className="text-sm leading-relaxed">{entry.message}</p>
                            <p className={`text-[10px] mt-1 ${entry.role === 'user' ? 'text-flare-ink' : 'text-muted'}`}>
                              {entry.role === 'user' ? 'User' : 'Agent'}
                              {entry.timeInCallSecs != null && ` • ${formatDuration(Math.round(entry.timeInCallSecs))}`}
                            </p>
                          </div>
                        </div>
                      ))}
                      {(!convDetail.transcript || convDetail.transcript.length === 0) && (
                        <p className="text-center text-muted text-sm py-4">No transcript available</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          <style>{`@keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
        </>
      )}
    </div>
  )
}
