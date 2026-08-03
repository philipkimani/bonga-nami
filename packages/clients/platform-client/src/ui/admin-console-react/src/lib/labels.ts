/**
 * Plain-language labels. The console is used by health workers and programme
 * staff, not engineers — every user-facing string goes through here.
 */

export const END_REASON_LABELS: Record<string, string> = {
  success: 'Helped successfully',
  failure: 'Ended without help',
  unknown: 'Unknown',
  user_ended: 'Person hung up',
  inactivity_timeout: 'No reply — timed out',
  max_duration: 'Reached time limit',
  error: 'Something went wrong',
  agent_ended: 'Assistant ended it',
}

export const CHANNEL_LABELS: Record<string, string> = {
  web_text: 'Website chat',
  web_voice: 'Website voice',
  voice: 'Phone call',
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  email: 'Email',
}

export const STATUS_LABELS: Record<string, string> = {
  completed: 'Completed',
  abandoned: 'Ended early',
  error: 'Error',
  active: 'In progress',
  waiting: 'Waiting',
  assigned: 'Being handled',
  resolved: 'Handled',
}

/** Escalation reasons the agent emits, in the words staff use. */
export const ESCALATION_REASON_LABELS: Record<string, string> = {
  user_requested: 'Asked to speak to a person',
  agent_unable: 'Assistant could not help',
  sensitive_topic: 'Sensitive topic',
  repeated_failure: 'Assistant kept misunderstanding',
  timeout: 'Waited too long for an answer',
}

/**
 * Escalation reasons are free text from the agent, so fall back to
 * de-snake-casing anything unmapped rather than showing a raw key.
 */
export function plainReason(reason: string): string {
  if (!reason) return 'Needs a person'
  const mapped = ESCALATION_REASON_LABELS[reason]
  if (mapped) return mapped
  const spaced = reason.replace(/_/g, ' ').trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/** "Waiting 6 minutes" — relative, never a timestamp. */
export function formatWaiting(since: string | Date): string {
  const then = typeof since === 'string' ? new Date(since) : since
  const mins = Math.floor((Date.now() - then.getTime()) / 60000)
  if (mins < 1) return 'Just now'
  if (mins === 1) return 'Waiting 1 minute'
  if (mins < 60) return `Waiting ${mins} minutes`
  const hrs = Math.floor(mins / 60)
  if (hrs === 1) return 'Waiting over 1 hour'
  return `Waiting over ${hrs} hours`
}

export function formatDuration(secs: number): string {
  if (!secs || secs === 0) return '0s'
  if (secs < 60) return `${secs}s`
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}
