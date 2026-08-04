import { AlertTriangle, BarChart3, BookOpen, Bot, Settings } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../lib/utils'

type Section = 'escalations' | 'knowledge-base' | 'admin-assistant' | 'platform-settings' | 'analytics'

interface SectionSwitcherProps {
  activeSection: Section
  onSectionChange: (section: Section) => void
  escalationCount?: number
  escalationUrgent?: boolean
}

const SECTIONS: { id: Section; label: string; Icon: LucideIcon }[] = [
  { id: 'escalations',       label: 'Escalations', Icon: AlertTriangle },
  { id: 'analytics',         label: 'Analytics',   Icon: BarChart3 },
  { id: 'knowledge-base',    label: 'Knowledge',   Icon: BookOpen },
  { id: 'admin-assistant',   label: 'Assistant',   Icon: Bot },
  { id: 'platform-settings', label: 'Settings',    Icon: Settings },
]

export default function SectionSwitcher({
  activeSection,
  onSectionChange,
  escalationCount = 0,
  escalationUrgent = false,
}: SectionSwitcherProps) {
  return (
    <nav aria-label="Sections" className="mx-auto max-w-7xl px-6 py-6">
      <div className="flex flex-wrap gap-1 rounded-xl border border-line bg-canvas-2 p-1">
        {SECTIONS.map(({ id, label, Icon }) => {
          const isActive = activeSection === id
          const showBadge = id === 'escalations' && escalationCount > 0
          return (
            <button
              key={id}
              onClick={() => onSectionChange(id)}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium',
                'transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-flare-ink',
                isActive
                  ? 'bg-canvas-deep text-paper'
                  : 'text-muted hover:bg-canvas-deep/60 hover:text-paper',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{label}</span>
              {showBadge && (
                <span
                  className={cn(
                    'ml-1 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums',
                    escalationUrgent ? 'bg-flare text-paper' : 'bg-sun text-paper',
                  )}
                >
                  {escalationCount}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
