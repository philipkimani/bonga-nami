import { useEffect, useState } from 'react'
import { Panel } from './ui/Panel'
import { formatDuration } from '../lib/labels'

interface TranscriptEntry {
  role: 'user' | 'agent'
  message: string
  timeInCallSecs: number
}

interface ConversationDetail {
  conversationId: string
  status: string
  transcript: TranscriptEntry[]
  metadata: {
    duration?: number
    cost?: number
    latencyAvg?: number
    latencyP95?: number
    turnCount?: number
    interruptionCount?: number
  }
  analysis?: { transcriptSummary?: string } | null
}

export function ConversationPanel({
  conversationId,
  onClose,
}: {
  conversationId: string | null
  onClose: () => void
}) {
  const [detail, setDetail] = useState<ConversationDetail | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!conversationId) {
      setDetail(null)
      return
    }
    setLoading(true)
    fetch(`/api/analytics/conversations/${conversationId}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('admin_token') || ''}` },
    })
      .then(r => r.json())
      .then(j => { if (j.success) setDetail(j.data) })
      .catch(() => setDetail(null))
      .finally(() => setLoading(false))
  }, [conversationId])

  return (
    <Panel open={!!conversationId} onClose={onClose} title="Conversation">
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-flare" />
        </div>
      ) : !detail ? (
        <p className="px-6 py-16 text-center text-sm text-muted">
          This conversation could not be loaded.
        </p>
      ) : (
        <div className="space-y-6 p-6">
          {detail.analysis?.transcriptSummary && (
            <div className="rounded-lg border border-line bg-canvas-deep p-4">
              <p className="text-xs uppercase tracking-wider text-muted">Summary</p>
              <p className="mt-2 text-sm text-paper">{detail.analysis.transcriptSummary}</p>
            </div>
          )}

          <div>
            <p className="mb-4 text-xs uppercase tracking-wider text-muted">
              What was said ({detail.transcript.length} messages)
            </p>
            <div className="space-y-3">
              {detail.transcript.map((e, i) => (
                <div key={i} className={`flex ${e.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                      e.role === 'user'
                        ? 'rounded-br-md bg-canvas-deep text-paper'
                        : 'rounded-bl-md border border-line bg-canvas text-paper'
                    }`}
                  >
                    <p className="text-sm leading-relaxed">{e.message}</p>
                    <p className="mt-1 text-[11px] text-muted">
                      {e.role === 'user' ? 'Person' : 'Assistant'}
                      {e.timeInCallSecs != null && ` · ${formatDuration(Math.round(e.timeInCallSecs))}`}
                    </p>
                  </div>
                </div>
              ))}
              {detail.transcript.length === 0 && (
                <p className="py-4 text-center text-sm text-muted">No transcript available.</p>
              )}
            </div>
          </div>

          <details className="rounded-lg border border-line">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-muted hover:text-paper">
              Technical details
            </summary>
            <dl className="grid grid-cols-2 gap-3 border-t border-line px-4 py-4 text-sm">
              <Row label="Length" value={formatDuration(detail.metadata.duration || 0)} />
              <Row label="Turns" value={String(detail.metadata.turnCount ?? '—')} />
              <Row label="Latency (avg)" value={detail.metadata.latencyAvg ? `${detail.metadata.latencyAvg}ms` : '—'} />
              <Row label="Latency (p95)" value={detail.metadata.latencyP95 ? `${detail.metadata.latencyP95}ms` : '—'} />
              <Row label="Interruptions" value={String(detail.metadata.interruptionCount ?? '—')} />
              <Row label="Cost" value={detail.metadata.cost != null ? `$${Number(detail.metadata.cost).toFixed(4)}` : '—'} />
              <Row label="Status" value={detail.status} />
              <Row label="ID" value={detail.conversationId} mono />
            </dl>
          </details>
        </div>
      )}
    </Panel>
  )
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`mt-0.5 tabular-nums text-paper ${mono ? 'break-all font-mono text-xs' : ''}`}>
        {value}
      </dd>
    </div>
  )
}
