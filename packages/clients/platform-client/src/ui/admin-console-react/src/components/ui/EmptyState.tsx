import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  tone = 'neutral',
  className,
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  tone?: 'positive' | 'neutral'
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-16 text-center', className)}>
      <Icon
        className={cn('mb-4 h-10 w-10', tone === 'positive' ? 'text-mint-ink' : 'text-muted')}
        aria-hidden="true"
      />
      <p className="text-lg font-semibold text-paper">{title}</p>
      {description && <p className="mt-2 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
