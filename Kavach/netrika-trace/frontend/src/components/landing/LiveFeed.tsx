import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { DecisionBadge } from '../ui/Badge'
import type { Decision } from '../../types/incident'
import { cn } from '../ui/cn'

interface Row { id: number; host: string; intent: string; decision: Decision; risk: number }

const POOL: Omit<Row, 'id'>[] = [
  { host: 'chat.openai.com', intent: 'PII in prompt', decision: 'BLOCK', risk: 94 },
  { host: 'gemini.google.com', intent: 'General question', decision: 'ALLOW', risk: 6 },
  { host: 'claude.ai', intent: 'Source code leak', decision: 'WARN', risk: 58 },
  { host: 'api.openai.com', intent: 'API key in payload', decision: 'BLOCK', risk: 88 },
  { host: 'copilot.microsoft.com', intent: 'General question', decision: 'ALLOW', risk: 12 },
  { host: 'api.mistral.ai', intent: 'Customer data export', decision: 'WARN', risk: 64 },
]

/** A looping fragment of the real incidents table, built from the same badge component. */
export default function LiveFeed() {
  const reduce = useReducedMotion()
  const [rows, setRows] = useState<Row[]>(() => POOL.slice(0, 4).map((r, i) => ({ ...r, id: i })).reverse())
  const [n, setN] = useState(4)

  useEffect(() => {
    if (reduce) return
    const t = setInterval(() => {
      setN((v) => v + 1)
    }, 2200)
    return () => clearInterval(t)
  }, [reduce])

  useEffect(() => {
    if (n === 4) return
    setRows((prev) => [{ ...POOL[(n - 1) % POOL.length], id: n }, ...prev].slice(0, 4))
  }, [n])

  return (
    <div className="overflow-hidden rounded-3xl border border-line bg-surface shadow-pop" aria-label="Live incident feed demo">
      <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
        <span className="text-sm font-semibold text-fg">Recent activity</span>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted"><span className="h-2 w-2 animate-pulse rounded-full bg-success" /> Live</span>
      </div>
      <ul className="relative">
        <AnimatePresence initial={false}>
          {rows.map((r) => (
            <motion.li
              key={r.id}
              layout
              initial={{ opacity: 0, y: -18, backgroundColor: 'rgb(var(--accent-soft))' }}
              animate={{ opacity: 1, y: 0, backgroundColor: 'rgb(var(--surface))' }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              className="flex items-center gap-3 border-b border-line px-5 py-3 last:border-0"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent-fg">{r.host.charAt(0).toUpperCase()}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-fg">{r.host}</span>
                <span className="block truncate text-xs text-muted">{r.intent}</span>
              </span>
              <span className="hidden items-center gap-2 sm:flex">
                <span className="w-6 text-right text-sm font-medium tabular-nums text-fg">{r.risk}</span>
                <span className="h-1.5 w-14 overflow-hidden rounded-full bg-subtle" aria-hidden="true">
                  <span className={cn('block h-full rounded-full', r.risk >= 70 ? 'bg-danger' : r.risk >= 30 ? 'bg-warn' : 'bg-success')} style={{ width: `${r.risk}%` }} />
                </span>
              </span>
              <DecisionBadge decision={r.decision} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  )
}
