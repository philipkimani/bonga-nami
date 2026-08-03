import { Phone, MessageSquareText, Check } from 'lucide-react'
import { Badge } from '../ui/Badge'
import type { BadgeVariant } from '../ui/Badge'
import { ChannelIcon } from '../ui/ChannelIcon'
import { CHANNEL_LABELS, plainReason, formatWaiting } from '../../lib/labels'
import { cn } from '../../lib/utils'
import type { EscalationEntry } from '../../sections/Escalations'

const URGENCY: Record<
  EscalationEntry['urgency'],
  { stripe: string; variant: BadgeVariant; word: string }
> = {
  high:   { stripe: 'bg-flare', variant: 'urgent',  word: 'Urgent' },
  medium: { stripe: 'bg-sun',   variant: 'waiting', word: 'Waiting' },
  low:    { stripe: 'bg-muted', variant: 'neutral', word: 'When free' },
}

export function EscalationCard({
  entry,
  onMarkHandled,
  onViewConversation,
}: {
  entry: EscalationEntry
  onMarkHandled: (entry: EscalationEntry) => void
  onViewConversation: (entry: EscalationEntry) => void
}) {
  const urgency = URGENCY[entry.urgency] ?? URGENCY.low
  const who = entry.contactName || entry.contactPhone || entry.contactEmail || 'Unknown contact'

  return (
    <article className="relative overflow-hidden rounded-xl border border-line bg-canvas-2">
      <div className={cn('absolute left-0 top-0 h-full w-1', urgency.stripe)} aria-hidden="true" />

      <div className="py-5 pl-6 pr-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-xl font-semibold text-paper">{who}</h3>
            <p className="mt-1 flex items-center gap-2 text-sm text-muted">
              <ChannelIcon channel={entry.channel} size={16} />
              <span>{CHANNEL_LABELS[entry.channel] ?? entry.channel}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{formatWaiting(entry.createdAt)}</span>
            </p>
          </div>
          <Badge variant={urgency.variant}>{urgency.word}</Badge>
        </div>

        <p className="mt-4 text-sm text-paper">{plainReason(entry.reason)}</p>

        {entry.lastMessage && (
          <blockquote className="mt-3 line-clamp-2 border-l-2 border-line pl-3 text-sm italic text-muted">
            &ldquo;{entry.lastMessage}&rdquo;
          </blockquote>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            onClick={() => onMarkHandled(entry)}
            className="inline-flex items-center gap-2 rounded-lg bg-mint px-4 py-2 text-sm font-semibold text-canvas transition-colors hover:bg-mint/85 focus:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-2 focus-visible:ring-offset-canvas-2"
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            Mark as handled
          </button>

          <button
            onClick={() => onViewConversation(entry)}
            className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-sm font-medium text-muted transition-colors hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-flare"
          >
            <MessageSquareText className="h-4 w-4" aria-hidden="true" />
            View conversation
          </button>

          {entry.contactPhone && (
            <a
              href={`tel:${entry.contactPhone}`}
              className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-sm font-medium text-muted transition-colors hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-flare"
            >
              <Phone className="h-4 w-4" aria-hidden="true" />
              Call back
            </a>
          )}
        </div>
      </div>
    </article>
  )
}
