import type { ReactNode } from 'react'
import type { Decision } from '../../types/incident'
import { cn } from './cn'

type Tone = 'success' | 'warn' | 'danger' | 'accent' | 'neutral'

const tones: Record<Tone, string> = {
  success: 'bg-success-soft text-success-fg',
  warn: 'bg-warn-soft text-warn-fg',
  danger: 'bg-danger-soft text-danger-fg',
  accent: 'bg-accent-soft text-accent-fg',
  neutral: 'bg-subtle text-muted',
}

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium', tones[tone], className)}>
      {children}
    </span>
  )
}

const decisionMap: Record<Decision, { tone: Tone; label: string }> = {
  ALLOW: { tone: 'success', label: 'Allowed' },
  WARN: { tone: 'warn', label: 'Warned' },
  BLOCK: { tone: 'danger', label: 'Blocked' },
}

export function DecisionBadge({ decision }: { decision: Decision }) {
  const d = decisionMap[decision]
  return (
    <Badge tone={d.tone}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {d.label}
    </Badge>
  )
}
export default Badge
