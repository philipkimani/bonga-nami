import { useState, useEffect } from 'react'

interface Call {
  id: string
  from: string
  to: string
  direction: 'inbound' | 'outbound'
  status: string
  durationSeconds?: number
  startedAt?: string
  time?: string
  aiHandled?: boolean
  elevenLabsConversationId?: string
}

export default function CallsTab() {
  const [calls, setCalls] = useState<Call[]>([])
  const [showOutboundModal, setShowOutboundModal] = useState(false)
  const [showBatchModal, setShowBatchModal] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')
  const [directionFilter, setDirectionFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [calling, setCalling] = useState(false)
  const [escalationCount, setEscalationCount] = useState(0)

  useEffect(() => {
    loadCalls()
    loadEscalationQueue()
    const interval = setInterval(() => { loadCalls(); loadEscalationQueue() }, 15000)
    return () => clearInterval(interval)
  }, [])

  async function loadCalls() {
    try {
      // Fetch from both local store and ElevenLabs history
      const [localRes, elRes] = await Promise.allSettled([
        fetch('/api/admin-assistant/calls'),
        fetch('/api/admin-assistant/calls/history/elevenlabs'),
      ])

      let allCalls: Call[] = []

      if (localRes.status === 'fulfilled' && localRes.value.ok) {
        const data = await localRes.value.json()
        allCalls = (data.calls || []).map((c: any) => ({
          ...c,
          time: c.startedAt ? new Date(c.startedAt).toLocaleString() : '',
        }))
      }

      if (elRes.status === 'fulfilled' && elRes.value.ok) {
        const data = await elRes.value.json()
        const elCalls = (data.calls || []).map((c: any) => ({
          ...c,
          time: c.startedAt ? new Date(c.startedAt).toLocaleString() : '',
        }))
        // Merge, avoiding duplicates by ID
        const existingIds = new Set(allCalls.map(c => c.id))
        for (const c of elCalls) {
          if (!existingIds.has(c.id)) {
            allCalls.push(c)
          }
        }
      }

      allCalls.sort((a, b) => {
        const aTime = a.startedAt ? new Date(a.startedAt).getTime() : 0
        const bTime = b.startedAt ? new Date(b.startedAt).getTime() : 0
        return bTime - aTime
      })

      setCalls(allCalls)
    } catch (e) {
      console.log('Calls not available')
    } finally {
      setLoading(false)
    }
  }

  async function loadEscalationQueue() {
    try {
      const res = await fetch('/api/admin-assistant/calls/queue')
      if (res.ok) {
        const data = await res.json()
        setEscalationCount(data.count || 0)
      }
    } catch { /* ignore */ }
  }

  async function initiateOutboundCall(phone: string, variables?: Record<string, string>) {
    setCalling(true)
    try {
      const res = await fetch('/api/admin-assistant/calls/outbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: phone, dynamicVariables: variables }),
      })
      const data = await res.json()
      if (res.ok) {
        alert('Call initiated! ID: ' + data.callId)
        setShowOutboundModal(false)
        loadCalls()
      } else {
        alert('Failed: ' + (data.error || 'Unknown error'))
      }
    } catch (e: any) {
      alert('Error: ' + e.message)
    } finally {
      setCalling(false)
    }
  }

  async function initiateBatchCalls(phones: string[], campaignName: string) {
    setCalling(true)
    try {
      const res = await fetch('/api/admin-assistant/calls/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients: phones.map(phone => ({ phone })),
          campaignName,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        alert(`Batch initiated! Campaign ID: ${data.campaignId}\n${data.recipientCount} recipients`)
        setShowBatchModal(false)
        loadCalls()
      } else {
        alert('Failed: ' + (data.error || 'Unknown error'))
      }
    } catch (e: any) {
      alert('Error: ' + e.message)
    } finally {
      setCalling(false)
    }
  }

  function formatDuration(seconds?: number): string {
    if (!seconds) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const filteredCalls = calls
    .filter(c => !statusFilter || c.status === statusFilter)
    .filter(c => !directionFilter || c.direction === directionFilter)

  const statusColors: Record<string, string> = {
    'ringing': 'bg-yellow-100 text-yellow-700',
    'in-progress': 'bg-green-100 text-green-700',
    'completed': 'bg-gray-100 text-gray-700',
    'failed': 'bg-red-100 text-red-700',
    'on-hold': 'bg-orange-100 text-orange-700',
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">📞 Voice Calls</h2>
          <p className="text-gray-500">AI-powered voice conversations via Twilio + ElevenLabs</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowOutboundModal(true)}
            className="px-4 py-2 gradient-primary text-white rounded-lg hover:opacity-90 transition shadow-lg shadow-purple-500/25"
          >
            + New Outbound Call
          </button>
          <button
            onClick={() => setShowBatchModal(true)}
            className="px-4 py-2 border border-purple-600 text-purple-600 rounded-lg hover:bg-purple-50 transition"
          >
            📤 Batch Calls
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-50 rounded-xl p-4">
          <p className="text-sm text-gray-500">Active Calls</p>
          <p className="text-2xl font-bold text-green-600">
            {calls.filter(c => c.status === 'in-progress' || c.status === 'ringing').length}
          </p>
        </div>
        <div className="bg-gray-50 rounded-xl p-4">
          <p className="text-sm text-gray-500">Escalated</p>
          <p className="text-2xl font-bold text-orange-600">{escalationCount}</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-4">
          <p className="text-sm text-gray-500">Total Calls</p>
          <p className="text-2xl font-bold text-gray-800">{calls.length}</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-4">
          <p className="text-sm text-gray-500">Avg Duration</p>
          <p className="text-2xl font-bold text-gray-800">
            {calls.length > 0 
              ? formatDuration(Math.round(
                  calls.reduce((sum, c) => sum + (c.durationSeconds || 0), 0) / 
                  Math.max(1, calls.filter(c => c.durationSeconds).length)
                ))
              : '0:00'}
          </p>
        </div>
      </div>

      {/* Escalation Queue */}
      <div className="bg-orange-50 border border-orange-200 rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-orange-800">🚨 Calls Waiting for Human</h3>
            <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">
              0 waiting
            </span>
          </div>
        </div>
        <p className="text-orange-700 text-center py-4">No calls waiting for human agent</p>
      </div>

      {/* Call History */}
      <div className="bg-white rounded-xl border">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Recent Calls</h3>
          <div className="flex gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 border rounded-lg text-sm"
            >
              <option value="">All Status</option>
              <option value="in-progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="on-hold">On Hold</option>
              <option value="failed">Failed</option>
            </select>
            <select
              value={directionFilter}
              onChange={(e) => setDirectionFilter(e.target.value)}
              className="px-3 py-1.5 border rounded-lg text-sm"
            >
              <option value="">All Direction</option>
              <option value="inbound">Inbound</option>
              <option value="outbound">Outbound</option>
            </select>
          </div>
        </div>
        
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Phone Number</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Direction</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Duration</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Time</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-gray-500">
                  <div className="animate-spin text-3xl mb-2">⏳</div>
                  Loading call history...
                </td>
              </tr>
            ) : filteredCalls.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-gray-500">
                  <span className="text-4xl block mb-2">📞</span>
                  No calls found. Calls will appear here when customers call your Twilio number 
                  or you make outbound calls via ElevenLabs.
                </td>
              </tr>
            ) : (
              filteredCalls.map((call) => (
                <tr key={call.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{call.from}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs ${
                      call.direction === 'inbound' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                    }`}>
                      {call.direction === 'inbound' ? '↙ Inbound' : '↗ Outbound'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs ${statusColors[call.status] || 'bg-gray-100 text-gray-700'}`}>
                      {call.status}
                    </span>
                    {call.aiHandled && (
                      <span className="ml-1 px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded text-xs">AI</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{formatDuration(call.durationSeconds)}</td>
                  <td className="px-4 py-3 text-gray-500 text-sm">{call.time || ''}</td>
                  <td className="px-4 py-3">
                    <button className="text-purple-600 hover:underline text-sm">View</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Setup Checklist */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-blue-800 mb-4">📋 Setup Checklist</h3>
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-blue-700">
            <span className="text-xl">⏳</span>
            <span>Configure Twilio Account (Account SID, Auth Token)</span>
          </div>
          <div className="flex items-center gap-3 text-blue-700">
            <span className="text-xl">⏳</span>
            <span>Purchase Kenya phone number (+254)</span>
          </div>
          <div className="flex items-center gap-3 text-blue-700">
            <span className="text-xl">⏳</span>
            <span>Configure ElevenLabs Agent ID</span>
          </div>
          <div className="flex items-center gap-3 text-blue-700">
            <span className="text-xl">⏳</span>
            <span>Set up webhook URL in Twilio Console</span>
          </div>
        </div>
      </div>

      {/* Outbound Call Modal */}
      {showOutboundModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-[400px] shadow-2xl">
            <h3 className="text-lg font-semibold mb-4">📞 New Outbound Call</h3>
            <form onSubmit={(e) => {
              e.preventDefault()
              const form = e.target as HTMLFormElement
              const phone = (form.elements.namedItem('phone') as HTMLInputElement).value
              initiateOutboundCall(phone)
            }}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                <input
                  type="tel"
                  name="phone"
                  placeholder="+254712345678"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">E.164 format. The AI agent will call this number.</p>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowOutboundModal(false)}
                  className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={calling}
                  className="flex-1 px-4 py-2 gradient-primary text-white rounded-lg hover:opacity-90 disabled:opacity-50"
                >
                  {calling ? 'Calling...' : '📞 Call Now'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Batch Calls Modal */}
      {showBatchModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-[500px] shadow-2xl">
            <h3 className="text-lg font-semibold mb-4">📤 Batch Outbound Calls</h3>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-yellow-800">
                ⚠️ Batch calls use ElevenLabs Batch Calling API for efficient parallel processing.
              </p>
            </div>
            <form onSubmit={(e) => {
              e.preventDefault()
              const form = e.target as HTMLFormElement
              const phonesText = (form.elements.namedItem('phones') as HTMLTextAreaElement).value
              const campaignName = (form.elements.namedItem('campaignName') as HTMLInputElement)?.value || 'Batch Call'
              const phones = phonesText.split('\n').map((p: string) => p.trim()).filter(Boolean)
              if (phones.length === 0) { alert('No valid phone numbers'); return }
              initiateBatchCalls(phones, campaignName)
            }}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Campaign Name</label>
                <input
                  type="text"
                  name="campaignName"
                  placeholder="e.g., Appointment Reminders"
                  className="w-full px-4 py-2 border rounded-lg"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Numbers (one per line)</label>
                <textarea
                  name="phones"
                  rows={5}
                  placeholder={"+254712345678\n+254723456789"}
                  className="w-full px-4 py-2 border rounded-lg font-mono text-sm focus:ring-2 focus:ring-purple-500"
                  required
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowBatchModal(false)}
                  className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={calling}
                  className="flex-1 px-4 py-2 gradient-primary text-white rounded-lg hover:opacity-90 disabled:opacity-50"
                >
                  {calling ? 'Starting...' : 'Start Batch Calls'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
