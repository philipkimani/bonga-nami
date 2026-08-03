import type { ReactNode } from 'react'
import { AlertTriangle, Clock, CheckCircle2, MinusCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../../lib/utils'

export type BadgeVariant = 'urgent' | 'waiting' | 'handled' | 'neutral'

// Colour is never the only signal — each variant carries an icon, and the
// caller supplies the word.
const VARIANTS: Record<BadgeVariant, { classes: string; Icon: LucideIcon }> = {
  urgent:  { classes: 'bg-flare/15 text-flare border-flare/40', Icon: AlertTriangle },
  waiting: { classes: 'bg-sun/15 text-sun border-sun/40',       Icon: Clock },
  handled: { classes: 'bg-mint/15 text-mint border-mint/40',    Icon: CheckCircle2 },
  neutral: { classes: 'bg-muted/10 text-muted border-line',     Icon: MinusCircle },
}

export function Badge({
  variant = 'neutral',
  children,
  className,
}: {
  variant?: BadgeVariant
  children: ReactNode
  className?: string
}) {
  const { classes, Icon } = VARIANTS[variant]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
        classes,
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {children}
    </span>
  )
}
