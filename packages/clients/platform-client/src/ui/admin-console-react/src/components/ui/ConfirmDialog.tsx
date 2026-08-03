import { useEffect, useRef } from 'react'
import { cn } from '../../lib/utils'

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  tone = 'default',
}: {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  tone?: 'default' | 'destructive'
}) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    confirmRef.current?.focus()
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-canvas-deep/70 backdrop-blur-sm" onClick={onCancel} aria-hidden="true" />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="relative w-full max-w-sm rounded-xl border border-line bg-canvas-2 p-6 shadow-2xl"
      >
        <h2 id="confirm-title" className="text-lg font-semibold text-paper">{title}</h2>
        <p className="mt-2 text-sm text-muted">{message}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-canvas-deep hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-flare"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas-2',
              tone === 'destructive'
                ? 'bg-flare text-paper hover:bg-flare/85 focus-visible:ring-flare'
                : 'bg-mint text-canvas hover:bg-mint/85 focus-visible:ring-mint',
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
