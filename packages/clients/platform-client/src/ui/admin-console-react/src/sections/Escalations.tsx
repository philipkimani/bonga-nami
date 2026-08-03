import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, RefreshCw } from 'lucide-react'
import { Card, CardContent } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { EscalationCard } from '../components/escalations/EscalationCard'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { ConversationPanel } from '../components/ConversationPanel'

export interface EscalationEntry {
  id: string
  channel: 'voice' | 'sms' | 'whatsapp' | 'email'
  conversationId: string
  contactPhone?: string
  contactEmail?: string
  contactName?: string
  reason: string
  urgency: 'low' | 'medium' | 'high'
  department?: string
  lastMessage: string
  status: 'waiting' | 'assigned' | 'resolved'
  assignedTo?: string
  createdAt: string
}

export interface QueueStats {
  total: number
  byChannel: Record<string, number>
  byUrgency: { high: number; medium: number; low: number }
  oldestWaitMinutes: number
}

export default function EscalationsSection() {
  const [queue, setQueue] = useState<EscalationEntry[]>([])
  const [stats, setStats] = useState<QueueStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [, setTick] = useState(0)
  const [viewing, setViewing] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<EscalationEntry | null>(null)
  const [resolving, setResolving] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin-assistant/escalations', {
        headers: { Authorization: `Bearer ${localStorage.getItem('admin_token') || ''}` },
      })
      if (!res.ok) throw new Error('request failed')
      const json = await res.json()
      setQueue(json.queue ?? [])
      setStats(json.stats ?? null)
      setError(null)
    } catch {
      setError('Could not load the queue. Check your connection.')
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * The resolve route lives under /calls but operates on the unified
   * cross-channel queue (resolveEscalation); the call-specific branch inside
   * it is a no-op for non-voice entries. Misleading URL, correct behaviour.
   */
  const markHandled = useCallback(async () => {
    if (!confirming) return
    setResolving(true)
    try {
      const res = await fetch(`/api/admin-assistant/calls/queue/${confirming.id}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('admin_token') || ''}`,
        },
        body: JSON.stringify({
          agentId: JSON.parse(localStorage.getItem('admin_user') || '{}').username || 'unknown',
        }),
      })
      if (!res.ok) throw new Error('resolve failed')
      setQueue(q => q.filter(e => e.id !== confirming.id))
      setConfirming(null)
      load()
    } catch {
      setError('Could not mark that as handled. Please try again.')
      setConfirming(null)
    } finally {
      setResolving(false)
    }
  }, [confirming, load])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const id = setInterval(load, 15000)
    return () => clearInterval(id)
  }, [load])

  // Re-render every 30s so "Waiting N minutes" stays truthful between fetches.
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30000)
    return () => clearInterval(id)
  }, [])

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-line border-t-flare" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-paper">Who needs help</h1>
          <p className="mt-1 text-sm text-muted">People waiting to speak with someone.</p>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm text-muted transition-colors hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-flare"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Refresh
        </button>
      </div>

      {error && (
        <Card className="border-flare/40">
          <CardContent className="flex items-center justify-between gap-4">
            <p className="text-sm text-paper">{error}</p>
            <button
              onClick={load}
              className="rounded-lg bg-flare px-3 py-1.5 text-sm font-semibold text-paper"
            >
              Try again
            </button>
          </CardContent>
        </Card>
      )}

      {stats && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Counter label="Urgent" value={stats.byUrgency.high} tone="flare" />
          <Counter label="Waiting" value={stats.byUrgency.medium + stats.byUrgency.low} tone="sun" />
          <Counter label="Longest wait" value={`${stats.oldestWaitMinutes} min`} tone="muted" />
        </div>
      )}

      {queue.length === 0 ? (
        <Card>
          <EmptyState
            icon={CheckCircle2}
            tone="positive"
            title="No one is waiting"
            description="Everyone who asked for help has been helped."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {queue.map(entry => (
            <EscalationCard
              key={entry.id}
              entry={entry}
              onMarkHandled={setConfirming}
              onViewConversation={e => setViewing(e.conversationId)}
            />
          ))}
        </div>
      )}

      <ConversationPanel conversationId={viewing} onClose={() => setViewing(null)} />

      <ConfirmDialog
        open={!!confirming}
        title="Mark as handled?"
        message={`This removes ${confirming?.contactName || 'this person'} from everyone's queue. Only do this once you have actually helped them.`}
        confirmLabel={resolving ? 'Saving…' : 'Yes, handled'}
        onConfirm={markHandled}
        onCancel={() => setConfirming(null)}
      />
    </div>
  )
}

function Counter({
  label,
  value,
  tone,
}: {
  label: string
  value: number | string
  tone: 'flare' | 'sun' | 'muted'
}) {
  const colour = tone === 'flare' ? 'text-flare' : tone === 'sun' ? 'text-sun' : 'text-paper'
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs uppercase tracking-wider text-muted">{label}</p>
        <p className={`mt-1 text-3xl font-bold tabular-nums ${colour}`}>{value}</p>
      </CardContent>
    </Card>
  )
}
