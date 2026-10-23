import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BadgeCheck, ChevronDown, EyeOff, Replace, ShieldCheck, ShieldOff, Wand2 } from 'lucide-react'
import Drawer from '../ui/Drawer'
import Button from '../ui/Button'
import { cn } from '../ui/cn'
import { Lens, Sentinel, Vault } from './Characters'
import { explain } from '../../scanner/explain'
import type { Finding } from '../../scanner/types'

const CATEGORY_LABEL: Record<Finding['category'], string> = {
  secret: 'Secret',
  key_material: 'Key material',
  credential_url: 'Credential in URL',
  pii: 'Personal data',
  financial: 'Financial',
  business: 'Internal',
  suspicious: 'Unknown random token',
  fingerprint: 'Your own secret',
  canary: 'Canary tripwire',
}

interface Props {
  open: boolean
  onClose: () => void
  text: string
  findings: Finding[]
  /** True when the authoritative server check produced these findings (fingerprints available). */
  authoritative: boolean
  onRedact: (f: Finding) => void
  onPlaceholder: (f: Finding) => void
  onAllowOnce: (f: Finding) => void
  onMarkSafe: (f: Finding) => Promise<void>
  onRedactAll: () => void
  onFixAndSend: () => void
  canSendAfterFix: boolean
}

function Meter({ value, tone }: { value: number; tone: 'danger' | 'warn' }) {
  return (
    <div className="flex items-center gap-2" role="img" aria-label={`Confidence ${Math.round(value * 100)} percent`}>
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-subtle">
        <motion.span initial={{ width: 0 }} animate={{ width: `${Math.round(value * 100)}%` }} transition={{ duration: 0.6, ease: 'easeOut' }} className={cn('block h-full rounded-full', tone === 'danger' ? 'bg-danger' : 'bg-warn')} />
      </span>
      <span className="text-xs tabular-nums text-muted">{Math.round(value * 100)}%</span>
    </div>
  )
}

export default function FindingsDrawer({ open, onClose, findings, authoritative, onRedact, onPlaceholder, onAllowOnce, onMarkSafe, onRedactAll, onFixAndSend, canSendAfterFix }: Props) {
  const [why, setWhy] = useState<number | null>(null)
  const [busy, setBusy] = useState<number | null>(null)

  const footer = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Button onClick={onRedactAll} disabled={!findings.length}>
        <EyeOff className="h-4 w-4" /> Redact all
      </Button>
      <Button variant="primary" onClick={onFixAndSend} disabled={!findings.length || !canSendAfterFix}>
        <Wand2 className="h-4 w-4" /> Fix all and send
      </Button>
    </div>
  )

  return (
    <Drawer open={open} onClose={onClose} width={500} title="Scan findings" subtitle={findings.length ? `${findings.length} item${findings.length === 1 ? '' : 's'} need a decision` : 'Nothing to review'} footer={footer}>
      {!findings.length ? (
        <div className="flex flex-col items-center py-10 text-center">
          <Sentinel pose="safe" size={120} />
          <p className="mt-3 text-sm font-medium text-fg">Safe to send</p>
          <p className="mt-1 max-w-xs text-xs text-muted">Sentinel found nothing that policy would stop.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {findings.map((f, i) => {
            const tone = f.needsConfirmation || f.category === 'suspicious' || f.action === 'WARN' ? 'warn' : 'danger'
            const ex = explain(f)
            const openWhy = why === i
            const canConfirm = f.needsConfirmation && f.allowlistable && !!f.fp
            const canSafe = f.allowlistable && !!f.fp && f.category !== 'fingerprint' && f.category !== 'canary'
            return (
              <motion.li key={`${f.start}-${f.end}-${f.type}`} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 6) * 0.04 }} className="rounded-2xl border border-line bg-surface p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold', tone === 'danger' ? 'bg-danger-soft text-danger-fg' : 'bg-warn-soft text-warn-fg')}>
                        {tone === 'danger' ? <ShieldOff className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
                        {f.action === 'BLOCK' ? 'Blocks sending' : f.action === 'WARN' ? 'Warning' : f.action === 'TOKENIZE' ? 'Will be replaced' : 'Will be masked'}
                      </span>
                      <span className="text-xs font-medium text-muted">{CATEGORY_LABEL[f.category]}</span>
                    </div>
                    <div className="mt-1.5 truncate text-sm font-semibold text-fg">{f.label}</div>
                    <div className="mt-0.5 font-mono text-xs text-muted" aria-label="Masked preview">{f.masked}</div>
                  </div>
                  <Meter value={f.confidence} tone={tone} />
                </div>

                <button type="button" aria-expanded={openWhy} onClick={() => setWhy(openWhy ? null : i)} className="mt-2.5 flex w-full items-center gap-2 rounded-xl bg-subtle/70 px-3 py-2 text-left text-xs font-medium text-fg hover:bg-subtle">
                  <span className="shrink-0"><Lens pose={openWhy ? 'explain' : 'idle'} size={34} /></span>
                  <span className="flex-1">{openWhy ? ex.headline : 'Why was this flagged?'}</span>
                  <ChevronDown className={cn('h-4 w-4 transition-transform', openWhy && 'rotate-180')} />
                </button>
                <AnimatePresence initial={false}>
                  {openWhy && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <ul className="mt-2 space-y-1.5 px-1 text-xs text-muted">
                        {ex.points.map((p) => (
                          <li key={p} className="flex gap-2"><BadgeCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />{p}</li>
                        ))}
                      </ul>
                      <p className="mt-2 rounded-xl border border-line px-3 py-2 text-xs text-muted"><span className="font-semibold text-fg">Learn more. </span>{ex.learn}</p>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => onRedact(f)}><EyeOff className="h-3.5 w-3.5" /> Redact</Button>
                  <Button size="sm" onClick={() => onPlaceholder(f)}><Replace className="h-3.5 w-3.5" /> Use placeholder</Button>
                  {f.needsConfirmation && (
                    <Button size="sm" disabled={!canConfirm} onClick={() => onAllowOnce(f)} title={canConfirm ? 'Send this token once without changing policy' : 'Needs the server check, which is offline'}>
                      Allow once
                    </Button>
                  )}
                  {canSafe && (
                    <Button
                      size="sm"
                      disabled={busy === i || !authoritative}
                      onClick={async () => {
                        setBusy(i)
                        try {
                          await onMarkSafe(f)
                        } finally {
                          setBusy(null)
                        }
                      }}
                    >
                      Mark as safe
                    </Button>
                  )}
                </div>
                {(f.category === 'fingerprint' || f.category === 'canary') && <p className="mt-2 flex items-center gap-1.5 text-xs text-muted"><Vault pose="idle" size={22} /> This one cannot be marked safe.</p>}
              </motion.li>
            )
          })}
        </ul>
      )}
    </Drawer>
  )
}
