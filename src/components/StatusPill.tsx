import type { EntryStatus } from '../lib/types'

interface StatusPillProps {
  status: EntryStatus
}

export function StatusPill({ status }: StatusPillProps) {
  return (
    <span className={`status-pill status-pill-${status}`}>
      {status === 'active' ? 'Active' : status === 'old' ? 'Old' : 'Revoked'}
    </span>
  )
}
