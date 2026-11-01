import { Code2, KeyRound, ShieldAlert, ShieldCheck, TriangleAlert } from 'lucide-react'
import type { ChatMessage } from '../../hooks/useChat'
import { cn } from '../ui/cn'

const tones = {
  BLOCK: { box: 'border-danger/30 bg-danger-soft/60', text: 'text-danger-fg', label: 'Blocked', Icon: ShieldAlert },
  WARN: { box: 'border-warn/30 bg-warn-soft/60', text: 'text-warn-fg', label: 'Warning', Icon: TriangleAlert },
  ALLOW: { box: 'border-success/30 bg-success-soft/60', text: 'text-success-fg', label: 'Safe', Icon: ShieldCheck },
} as const

export default function DlpBadge({ dlp }: { dlp: ChatMessage['dlp'] }) {
  if (!dlp) return null
  const tone = tones[dlp.decision as keyof typeof tones] ?? tones.ALLOW
  const entities = dlp.entities_found || []
  return (
    <div className={cn('mt-2 rounded-2xl border px-3 py-2 text-xs', tone.box)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={cn('inline-flex items-center gap-1.5 font-semibold', tone.text)}>
          <tone.Icon className="h-3.5 w-3.5" /> {tone.label}
        </span>
        <span className="text-muted">Risk <b className="text-fg">{dlp.risk_score}</b></span>
        <span className="text-muted">Intent <b className="text-fg">{dlp.intent_label}</b></span>
        {dlp.code_detected && <span className="inline-flex items-center gap-1 font-medium text-danger-fg"><Code2 className="h-3.5 w-3.5" /> Code</span>}
        {dlp.secrets_detected && <span className="inline-flex items-center gap-1 font-medium text-danger-fg"><KeyRound className="h-3.5 w-3.5" /> Secrets</span>}
      </div>
      {entities.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {entities.map((e, i) => (
            <span key={i} className="rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] text-fg">{e.type} ×{e.count}</span>
          ))}
        </div>
      )}
      {dlp.decision !== 'ALLOW' && dlp.incident_id && <div className="mt-1.5 font-mono text-[10px] text-faint">Incident {dlp.incident_id}</div>}
    </div>
  )
}
