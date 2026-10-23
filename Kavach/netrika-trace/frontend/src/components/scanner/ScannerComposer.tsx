import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { CheckCircle2, Eye, EyeOff, Loader2, Paperclip, Send, ShieldAlert, ShieldCheck, TriangleAlert } from 'lucide-react'
import Button from '../ui/Button'
import { cn } from '../ui/cn'
import { toast } from '../ui/Toast'
import { Sentinel, Vault, type SentinelPose } from './Characters'
import FindingsDrawer from './FindingsDrawer'
import { scanLocal } from '../../scanner/client'
import { redact, tokenize, type PlaceholderMap } from '../../scanner/rewrite'
import { type ScanStatus, useComposerScan } from '../../scanner/useComposerScan'
import type { Finding, ScannerSettings } from '../../scanner/types'

export interface SendPayload {
  text: string
  confirmedSafe: string[]
  restore: PlaceholderMap
  warned: boolean
}

interface Props {
  value: string
  onChange: (v: string) => void
  history: string[]
  settings?: ScannerSettings
  busy: boolean
  uploadName?: string
  onSend: (p: SendPayload) => void
  onFiles: (files: FileList) => void
}

const CHIP: Record<ScanStatus, { label: string; tone: string; icon: typeof ShieldCheck }> = {
  idle: { label: 'Protected', tone: 'border-line bg-surface text-muted', icon: ShieldCheck },
  scanning: { label: 'Scanning…', tone: 'border-accent/30 bg-accent-soft text-accent-fg', icon: Loader2 },
  safe: { label: 'Safe to send', tone: 'border-success/30 bg-success-soft text-success-fg', icon: CheckCircle2 },
  risk: { label: 'risks found', tone: 'border-warn/30 bg-warn-soft text-warn-fg', icon: TriangleAlert },
  blocked: { label: 'Blocked', tone: 'border-danger/30 bg-danger-soft text-danger-fg', icon: ShieldAlert },
}

const POSE: Record<ScanStatus, SentinelPose> = { idle: 'idle', scanning: 'scan', safe: 'safe', risk: 'suspect', blocked: 'blocked' }

const mirror = 'whitespace-pre-wrap break-words px-3.5 py-3 text-sm leading-relaxed'

/** Backdrop layer: same text as the textarea, with flagged spans underlined, highlighted or masked. */
function Backdrop({ text, findings, revealed, scrollTop }: { text: string; findings: Finding[]; revealed: boolean; scrollTop: number }) {
  const parts = useMemo(() => {
    const out: Array<{ s: string; f?: Finding }> = []
    let pos = 0
    for (const f of [...findings].sort((a, b) => a.start - b.start)) {
      if (f.start < pos || f.end > text.length) continue
      if (f.start > pos) out.push({ s: text.slice(pos, f.start) })
      out.push({ s: text.slice(f.start, f.end), f })
      pos = f.end
    }
    out.push({ s: text.slice(pos) })
    return out
  }, [text, findings])

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className={cn(mirror, 'text-fg')} style={{ transform: `translateY(${-scrollTop}px)` }}>
        {parts.map((p, i) => {
          if (!p.f) return <span key={i}>{p.s}</span>
          const hard = p.f.action === 'BLOCK' && !p.f.needsConfirmation
          const mask = !revealed && p.f.action !== 'WARN'
          return (
            <span
              key={i}
              className={cn(
                'rounded-sm transition-[filter] duration-200',
                hard ? 'bg-danger-soft underline decoration-danger decoration-2 underline-offset-4' : 'bg-warn-soft underline decoration-warn decoration-wavy decoration-2 underline-offset-4',
                mask && 'blur-[5px]',
              )}
            >
              {p.s}
            </span>
          )
        })}
        {text.endsWith('\n') ? '​' : ''}
      </div>
    </div>
  )
}

function ScanBeam({ active }: { active: boolean }) {
  const reduce = useReducedMotion()
  if (!active) return null
  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-transparent via-accent/20 to-transparent"
      initial={{ x: '-100%' }}
      animate={reduce ? { opacity: [0.2, 0.6, 0.2] } : { x: ['-100%', '420%'] }}
      transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
    />
  )
}

function Stamp({ show }: { show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="stamp"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
          initial={{ opacity: 0, scale: 1.8, rotate: -14 }}
          animate={{ opacity: 1, scale: 1, rotate: -8 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 380, damping: 18 }}
        >
          <span className="rounded-2xl border-4 border-danger bg-surface/70 px-5 py-1.5 text-2xl font-extrabold uppercase tracking-widest text-danger backdrop-blur-[1px]">Blocked</span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Redacted values pixelate into dots and fly into Vault. */
function SwallowDots({ show }: { show: boolean }) {
  const reduce = useReducedMotion()
  if (!show || reduce) return null
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {Array.from({ length: 14 }).map((_, i) => (
        <motion.span
          key={i}
          className="absolute h-1.5 w-1.5 rounded-[2px] bg-danger"
          style={{ left: `${10 + ((i * 53) % 55)}%`, top: `${25 + ((i * 37) % 45)}%` }}
          initial={{ opacity: 1, scale: 1 }}
          animate={{ x: 'calc(46vw)', y: '-30px', opacity: 0, scale: 0.4 }}
          transition={{ duration: 0.8, delay: i * 0.03, ease: 'easeIn' }}
        />
      ))}
    </div>
  )
}

export default function ScannerComposer({ value, onChange, history, settings, busy, uploadName, onSend, onFiles }: Props) {
  const reduce = useReducedMotion()
  const scan = useComposerScan(value, history, settings)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const restoreRef = useRef<PlaceholderMap>({})
  const pendingSend = useRef(false)
  const [scrollTop, setScrollTop] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const [stamp, setStamp] = useState(false)
  const [swallow, setSwallow] = useState(false)
  const [pasting, setPasting] = useState(false)
  const [shake, setShake] = useState(0)
  const [announce, setAnnounce] = useState('')
  const [sending, setSending] = useState(false)

  const { status, findings, result } = scan
  const blocked = status === 'blocked'
  const authoritative = scan.serverOnline && !!result && (result.findings.length === 0 || result.findings[0].source === 'server')

  // Auto-grow the textarea (max 8 lines).
  useLayoutEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 192)}px`
  }, [value])

  // Screen-reader announcements and the first-block stamp.
  const lastStatus = useRef<ScanStatus>('idle')
  useEffect(() => {
    if (status === lastStatus.current) return
    lastStatus.current = status
    if (status === 'blocked') {
      setAnnounce(`Send blocked. ${findings.length} risk${findings.length === 1 ? '' : 's'} found.`)
      setStamp(true)
      const t = setTimeout(() => setStamp(false), 1300)
      return () => clearTimeout(t)
    }
    if (status === 'risk') setAnnounce(`${findings.length} risk${findings.length === 1 ? '' : 's'} found.`)
    else if (status === 'safe') setAnnounce('Safe to send.')
    else if (status === 'scanning') setAnnounce('Scanning.')
    else setAnnounce('')
    setRevealed(false)
  }, [status, findings.length])

  const applyRewrite = useCallback(
    (only?: Finding[]) => {
      const set = only ? new Set(only) : undefined
      const next = redact(value, findings, set)
      onChange(next)
      setSwallow(true)
      setTimeout(() => setSwallow(false), 1000)
    },
    [value, findings, onChange],
  )

  const placeholderFor = useCallback(
    (only?: Finding[]) => {
      const set = only ? new Set(only) : undefined
      const start = Object.keys(restoreRef.current).length + 1
      const { text, map } = tokenize(value, findings, start, set)
      restoreRef.current = { ...restoreRef.current, ...map }
      onChange(text)
      setSwallow(true)
      setTimeout(() => setSwallow(false), 1000)
    },
    [value, findings, onChange],
  )

  const doSend = useCallback(
    async (viaFix = false) => {
      if (!value.trim() || busy || sending) return
      setSending(true)
      try {
        const { result: r } = await scan.ensureFresh()
        const live = r.findings.filter((f) => f.action !== 'ALLOW')
        if (r.action === 'BLOCK') {
          setShake((n) => n + 1)
          setStamp(true)
          setTimeout(() => setStamp(false), 1300)
          setDrawer(true)
          return
        }
        let text = value
        let map = { ...restoreRef.current }
        const toTokenize = live.filter((f) => f.action === 'TOKENIZE')
        const toRedact = live.filter((f) => f.action === 'REDACT')
        if (toTokenize.length || toRedact.length) {
          // Rewrite right-to-left so offsets stay valid.
          const t = tokenize(text, live, Object.keys(map).length + 1, new Set(toTokenize))
          text = t.text
          map = { ...map, ...t.map }
          if (toRedact.length) {
            // offsets shifted after tokenizing; re-scan the rewritten text for the remaining redactions
            const again = await scanLocal(text, { settings })
            text = redact(text, again.findings.filter((f) => f.action === 'REDACT'))
          }
          setSwallow(true)
          await new Promise((res) => setTimeout(res, reduce ? 0 : 600))
          setSwallow(false)
        }
        if (r.action === 'WARN') toast.info('Sent with a warning', 'Policy flagged something minor, so it is on the record.')
        onSend({ text, confirmedSafe: scan.confirmed, restore: map, warned: r.action === 'WARN' })
        restoreRef.current = {}
        scan.reset()
        onChange('')
        setDrawer(false)
        void viaFix
      } finally {
        setSending(false)
      }
    },
    [value, busy, sending, scan, onSend, onChange, settings, reduce],
  )

  // "Fix all and send": rewrite, wait for the clean verdict, then send.
  useEffect(() => {
    if (pendingSend.current && status === 'safe') {
      pendingSend.current = false
      void doSend(true)
    }
  }, [status, doSend])

  const fixAndSend = () => {
    pendingSend.current = true
    placeholderFor()
    setDrawer(false)
  }

  const onPaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const t = e.clipboardData.getData('text')
    if (!t) return
    e.preventDefault()
    const ta = e.currentTarget
    const s = ta.selectionStart
    const en = ta.selectionEnd
    setPasting(true)
    const minShow = new Promise((res) => setTimeout(res, reduce ? 0 : 450))
    let risky = 0
    try {
      const [r] = await Promise.all([scanLocal(t, { settings }), minShow])
      risky = r.findings.filter((f) => f.action !== 'ALLOW').length
    } catch {
      /* the live scan will still judge the text once it lands */
    }
    const next = value.slice(0, s) + t + value.slice(en)
    onChange(next)
    requestAnimationFrame(() => {
      const p = s + t.length
      taRef.current?.setSelectionRange(p, p)
    })
    setPasting(false)
    if (risky) toast.info(`Inspected your paste: ${risky} risk${risky === 1 ? '' : 's'} found`, 'Flagged parts are masked until you decide.')
  }

  const chip = CHIP[status]
  const ChipIcon = chip.icon
  const chipText = status === 'risk' ? `${findings.length} risk${findings.length === 1 ? '' : 's'} found` : status === 'blocked' ? `Blocked: ${findings.length} risk${findings.length === 1 ? '' : 's'}` : chip.label
  const sendDisabled = !value.trim() || busy || sending || blocked || status === 'scanning'

  return (
    <div className="border-t border-line p-3">
      <div className="sr-only" role="status" aria-live="polite">{announce}</div>

      {uploadName && <UploadBelt name={uploadName} />}

      <div className="mb-2 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => findings.length && setDrawer(true)}
          disabled={!findings.length}
          aria-label={`Scan status: ${chipText}. ${findings.length ? 'Open findings.' : ''}`}
          className={cn('relative inline-flex h-8 items-center gap-1.5 overflow-hidden rounded-full border px-3 text-xs font-semibold transition-colors', chip.tone, findings.length > 0 && 'cursor-pointer hover:brightness-95')}
        >
          <ChipIcon className={cn('h-3.5 w-3.5', status === 'scanning' && !reduce && 'animate-spin')} aria-hidden="true" />
          {chipText}
          {status === 'scanning' && !reduce && (
            <motion.span aria-hidden="true" className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-surface/60 to-transparent" animate={{ x: ['-100%', '300%'] }} transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }} />
          )}
        </button>
        <div className="flex items-center gap-2">
          {!scan.serverOnline && value.trim() && <span className="text-[11px] text-warn-fg">Server check offline, local scan only</span>}
          {blocked && (
            <button type="button" onClick={() => setRevealed((r) => !r)} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-muted hover:bg-subtle hover:text-fg" aria-pressed={revealed}>
              {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />} {revealed ? 'Hide' : 'Reveal'}
            </button>
          )}
          <div className="relative -my-2 flex items-center">
            <Sentinel pose={pasting ? 'scan' : POSE[status]} size={52} />
            <div className="absolute -left-10 top-1"><Vault pose={swallow ? 'swallow' : 'idle'} size={40} /></div>
          </div>
        </div>
      </div>

      <div className="flex items-end gap-2">
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} aria-label="Upload document (PDF, DOCX, TXT)" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-muted transition-colors hover:bg-subtle hover:text-fg disabled:opacity-50">
          <Paperclip className="h-[18px] w-[18px]" />
        </button>
        <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.csv,.md,.json,.zip,.png,.jpg,.jpeg" className="hidden" onChange={(e) => { if (e.target.files?.length) onFiles(e.target.files); e.target.value = '' }} />

        <div
          className={cn(
            'relative min-h-[46px] flex-1 overflow-hidden rounded-xl border bg-surface transition-colors focus-within:ring-2',
            blocked ? 'border-danger/50 focus-within:ring-danger/20' : status === 'risk' ? 'border-warn/50 focus-within:ring-warn/20' : status === 'safe' ? 'border-success/40 focus-within:ring-success/20' : 'border-line focus-within:border-accent focus-within:ring-accent/20',
          )}
        >
          <Backdrop text={value} findings={findings} revealed={revealed} scrollTop={scrollTop} />
          <ScanBeam active={status === 'scanning' || pasting} />
          <SwallowDots show={swallow} />
          <Stamp show={stamp} />
          {value === '' && <div aria-hidden="true" className={cn(mirror, 'pointer-events-none absolute inset-0 text-faint')}>Type a message (Shift+Enter for a new line)</div>}
          <textarea
            ref={taRef}
            value={value}
            rows={1}
            aria-label="Message"
            aria-invalid={blocked}
            aria-describedby="scan-help"
            disabled={busy}
            spellCheck={false}
            onChange={(e) => onChange(e.target.value)}
            onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
            onPaste={onPaste}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void doSend()
              }
            }}
            className={cn(mirror, 'relative z-[1] block max-h-48 w-full resize-none overflow-y-auto bg-transparent text-transparent caret-[rgb(var(--fg))] outline-none selection:bg-accent/25 disabled:opacity-60')}
          />
        </div>

        <motion.div key={shake} animate={shake ? { x: [0, -6, 6, -4, 4, 0] } : undefined} transition={{ duration: 0.4 }}>
          <Button variant={blocked ? 'danger' : 'primary'} onClick={() => void doSend()} disabled={sendDisabled} aria-label={blocked ? 'Send is blocked until the risks are resolved' : 'Send message'} className="h-11 w-11 shrink-0 px-0">
            {sending ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <Send className="h-[18px] w-[18px]" />}
          </Button>
        </motion.div>
      </div>

      <div id="scan-help" className="mt-2 flex min-h-[18px] items-center justify-between gap-2 text-xs text-muted">
        <span>
          {blocked
            ? 'Send is locked. Open the findings to redact, replace with a placeholder, or confirm.'
            : status === 'safe'
              ? 'Nothing sensitive found. Scanned locally, then checked against your registered secrets.'
              : 'Everything is scanned on this device first. Raw values are never logged.'}
        </span>
        {findings.length > 0 && (
          <button type="button" onClick={() => setDrawer(true)} className="shrink-0 font-medium text-accent hover:underline">
            Review findings
          </button>
        )}
      </div>

      <FindingsDrawer
        open={drawer}
        onClose={() => setDrawer(false)}
        text={value}
        findings={findings}
        authoritative={authoritative}
        onRedact={(f) => applyRewrite([f])}
        onPlaceholder={(f) => placeholderFor([f])}
        onAllowOnce={(f) => scan.confirmOnce(f.fp)}
        onMarkSafe={async (f) => {
          await scan.markSafe(f.fp)
          toast.success('Marked as safe', 'That exact token will not interrupt you again.')
        }}
        onRedactAll={() => applyRewrite()}
        onFixAndSend={fixAndSend}
        canSendAfterFix={!!value.trim()}
      />
    </div>
  )
}

/** Conveyor belt: Sentinel inspects the file while the upload is scanned. */
export function UploadBelt({ name }: { name: string }) {
  const reduce = useReducedMotion()
  return (
    <div className="mb-3 flex items-center gap-3 overflow-hidden rounded-2xl border border-accent/30 bg-accent-soft/50 px-3 py-2" role="status" aria-label={`Scanning ${name}`}>
      <Sentinel pose="scan" size={48} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium text-fg">Inspecting {name}</div>
        <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-surface">
          <motion.span
            className="absolute inset-y-0 w-10 rounded-full bg-accent"
            animate={reduce ? { opacity: [0.3, 1, 0.3] } : { x: ['-100%', '1000%'] }}
            transition={{ duration: 1.3, repeat: Infinity, ease: 'linear' }}
          />
        </div>
      </div>
    </div>
  )
}
