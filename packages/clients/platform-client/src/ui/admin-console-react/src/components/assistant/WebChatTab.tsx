import { useState, useEffect, useMemo } from 'react'

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
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-500 mx-auto mb-4" />
        <p className="text-gray-500">Loading Web Chat data...</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 flex items-center justify-center text-white text-lg">
            💬
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Web Chat</h2>
            <p className="text-sm text-gray-500">Website chat widget conversations</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
            isConfigured ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
          }`}>
            <span className={`w-2 h-2 rounded-full ${isConfigured ? 'bg-green-500' : 'bg-yellow-500'}`} />
            {isConfigured ? 'Configured' : 'Not Configured'}
          </span>
          <button
            onClick={loadData}
            className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 border rounded-lg hover:bg-gray-50 transition"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl p-4 text-white">
          <p className="text-xs text-indigo-200">Total Conversations</p>
          <p className="text-2xl font-bold mt-1">{totalConversations}</p>
          <p className="text-xs text-indigo-200 mt-1">
            {textCount} text · {voiceCount} voice
          </p>
        </div>
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-4 text-white">
          <p className="text-xs text-purple-200">Avg Duration</p>
          <p className="text-2xl font-bold mt-1">{formatDuration(avgDuration)}</p>
          <p className="text-xs text-purple-200 mt-1">Per conversation</p>
        </div>
        <div className="bg-gradient-to-br from-teal-500 to-teal-600 rounded-xl p-4 text-white">
          <p className="text-xs text-teal-200">Avg Messages</p>
          <p className="text-2xl font-bold mt-1">{avgMessages}</p>
          <p className="text-xs text-teal-200 mt-1">Per conversation</p>
        </div>
        <div className="bg-gradient-to-br from-pink-500 to-pink-600 rounded-xl p-4 text-white">
          <p className="text-xs text-pink-200">Widget Status</p>
          <p className="text-2xl font-bold mt-1">{isConfigured ? '✓' : '—'}</p>
          <p className="text-xs text-pink-200 mt-1">{isConfigured ? 'Active' : 'Setup needed'}</p>
        </div>
      </div>

      {/* Recent Conversations */}
      <div className="bg-white border rounded-xl overflow-hidden">
        <div className="p-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="font-semibold text-gray-900">Recent Web Chat Conversations</h3>
          <div className="flex items-center gap-2">
            {/* Text / Voice filter pills */}
            {(['all', 'text', 'voice'] as ModeFilter[]).map(mode => {
              const count = mode === 'all' ? conversations.length : mode === 'text' ? textCount : voiceCount
              const icons = { all: '📊', text: '💬', voice: '🎙️' }
              const labels = { all: 'All', text: 'Text', voice: 'Voice' }
              return (
                <button
                  key={mode}
                  onClick={() => setModeFilter(mode)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition ${
                    modeFilter === mode
                      ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-300'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <span>{icons[mode]}</span>
                  {labels[mode]}
                  <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] ${
                    modeFilter === mode ? 'bg-indigo-200 text-indigo-800' : 'bg-gray-200 text-gray-500'
                  }`}>{count}</span>
                </button>
              )
            })}
          </div>
        </div>

        {filteredConversations.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <p className="text-3xl mb-3">💬</p>
            <p className="font-medium text-gray-600">No {modeFilter !== 'all' ? modeFilter : 'web chat'} conversations yet</p>
            <p className="text-sm mt-1">Conversations will appear here once users start chatting via the widget.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-[40%]">Conversation</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Mode</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:text-indigo-600 transition" onClick={() => toggleSort('duration')}>Duration{sortArrow('duration')}</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:text-indigo-600 transition" onClick={() => toggleSort('messages')}>Msgs{sortArrow('messages')}</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:text-indigo-600 transition" onClick={() => toggleSort('time')}>Time{sortArrow('time')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredConversations.map((convo, idx) => {
                  const title = convo.summary
                    ? convo.summary.length > 55 ? convo.summary.slice(0, 52) + '...' : convo.summary
                    : `Conversation #${idx + 1}`
                  return (
                    <tr
                      key={convo.conversation_id}
                      onClick={() => openConversation(convo.conversation_id)}
                      className="hover:bg-indigo-50/50 transition cursor-pointer group"
                    >
                      <td className="px-4 py-3 max-w-[320px]">
                        <p className="text-sm font-medium text-gray-900 group-hover:text-indigo-700 truncate transition">
                          {title}
                        </p>
                        {convo.summary && (
                          <p className="text-xs text-gray-400 mt-0.5 truncate">{convo.summary}</p>
                        )}
                        <p className="text-[11px] text-gray-300 font-mono mt-0.5">{convo.conversation_id.slice(0, 16)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          convo.hasAudio
                            ? 'bg-violet-100 text-violet-700'
                            : 'bg-sky-100 text-sky-700'
                        }`}>
                          {convo.hasAudio ? '🎙️ Voice' : '💬 Text'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {convo.call_duration_secs ? formatDuration(convo.call_duration_secs) : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {convo.message_count ?? 0}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          convo.status === 'done'
                            ? 'bg-green-100 text-green-700'
                            : convo.status === 'processing'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {convo.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400">
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
          <div className="fixed top-0 right-0 h-full w-full max-w-lg bg-white shadow-2xl z-50 flex flex-col" style={{ animation: 'slideInRight 200ms ease-out' }}>
            {/* Header */}
            <div className="px-6 py-4 border-b bg-gradient-to-r from-indigo-500 to-purple-600 text-white flex items-center justify-between flex-shrink-0">
              <div>
                <h3 className="font-semibold text-lg">Conversation Detail</h3>
                <p className="text-xs text-white/70 font-mono mt-0.5">{selectedConvId}</p>
              </div>
              <button onClick={closeConversation} className="p-2 hover:bg-white/20 rounded-lg transition">
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
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-200 border-t-indigo-600 mx-auto mb-3" />
                    <p className="text-sm text-gray-500">Loading transcript...</p>
                  </div>
                </div>
              ) : !convDetail ? (
                <div className="p-8 text-center text-gray-400">
                  <p className="text-lg mb-2">⚠️</p>
                  <p>Failed to load conversation details</p>
                </div>
              ) : (
                <div className="divide-y">
                  {/* Metadata */}
                  <div className="p-5">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-gray-50 rounded-lg p-3 text-center">
                        <p className="text-[11px] text-gray-500 uppercase tracking-wider">Duration</p>
                        <p className="text-lg font-bold text-gray-900 mt-0.5">{formatDuration(convDetail.metadata?.duration || 0)}</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 text-center">
                        <p className="text-[11px] text-gray-500 uppercase tracking-wider">Turns</p>
                        <p className="text-lg font-bold text-gray-900 mt-0.5">{convDetail.metadata?.turnCount || 0}</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 text-center">
                        <p className="text-[11px] text-gray-500 uppercase tracking-wider">Latency</p>
                        <p className="text-lg font-bold text-gray-900 mt-0.5">{convDetail.metadata?.latencyAvg ? `${convDetail.metadata.latencyAvg}ms` : '—'}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 mt-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                        convDetail.status === 'done' ? 'bg-emerald-100 text-emerald-700'
                        : convDetail.status === 'processing' ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-600'
                      }`}>{convDetail.status}</span>
                      {convDetail.metadata?.cost != null && (
                        <span className="text-xs text-gray-500">Cost: ${typeof convDetail.metadata.cost === 'number' ? convDetail.metadata.cost.toFixed(4) : convDetail.metadata.cost}</span>
                      )}
                    </div>

                    {convDetail.analysis?.transcriptSummary && (
                      <div className="mt-3 p-3 bg-indigo-50 rounded-lg">
                        <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wider mb-1">AI Summary</p>
                        <p className="text-sm text-indigo-900">{convDetail.analysis.transcriptSummary}</p>
                      </div>
                    )}
                  </div>

                  {/* Transcript */}
                  <div className="p-5">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
                      Conversation Flow ({convDetail.transcript?.length || 0} messages)
                    </h4>
                    <div className="space-y-3">
                      {(convDetail.transcript || []).map((entry: any, i: number) => (
                        <div key={i} className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                            entry.role === 'user'
                              ? 'bg-indigo-600 text-white rounded-br-md'
                              : 'bg-gray-100 text-gray-800 rounded-bl-md'
                          }`}>
                            <p className="text-sm leading-relaxed">{entry.message}</p>
                            <p className={`text-[10px] mt-1 ${entry.role === 'user' ? 'text-indigo-200' : 'text-gray-400'}`}>
                              {entry.role === 'user' ? '👤 User' : '🤖 Agent'}
                              {entry.timeInCallSecs != null && ` • ${formatDuration(Math.round(entry.timeInCallSecs))}`}
                            </p>
                          </div>
                        </div>
                      ))}
                      {(!convDetail.transcript || convDetail.transcript.length === 0) && (
                        <p className="text-center text-gray-400 text-sm py-4">No transcript available</p>
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
