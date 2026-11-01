import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCheck, ChevronLeft, ChevronRight, Download, FileDown } from 'lucide-react'
import type { Incident } from '../types/incident'
import { apiDownload } from '../lib/api'
import { DecisionBadge, Badge } from './ui/Badge'
import Button from './ui/Button'
import IconButton from './ui/IconButton'
import EmptyState from './ui/EmptyState'
import Skeleton from './ui/Skeleton'
import { cn } from './ui/cn'
import { toast } from './ui/Toast'

interface Props {
  title: string
  incidents: Incident[]
  loading?: boolean
  /** Toolbar controls rendered left of the Export button. */
  toolbar?: ReactNode
  pageSize?: number
  selectable?: boolean
  onMarkReviewed?: (ids: string[]) => Promise<void>
  emptyTitle?: string
  emptyDescription?: string
}

const PAGE_SIZES = [5, 10, 25, 50]

function hostColor(host: string) {
  let h = 0
  for (const ch of host) h = (h * 31 + ch.charCodeAt(0)) % 360
  return `hsl(${h} 70% 90%)`
}

function riskTone(score: number) {
  return score >= 70 ? 'bg-danger' : score >= 30 ? 'bg-warn' : 'bg-success'
}

function csvCell(v: unknown) {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function exportCsv(rows: Incident[], filename: string) {
  const head = ['id', 'timestamp', 'target_host', 'user_ip', 'http_method', 'decision', 'risk_score', 'intent_label', 'reviewed']
  const lines = [head.join(',')].concat(
    rows.map((r) => head.map((k) => csvCell((r as unknown as Record<string, unknown>)[k])).join(',')),
  )
  const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function IncidentTable({
  title,
  incidents,
  loading,
  toolbar,
  pageSize: initialPageSize = 10,
  selectable = true,
  onMarkReviewed,
  emptyTitle = 'No incidents found',
  emptyDescription = 'New traffic decisions will appear here.',
}: Props) {
  const navigate = useNavigate()
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(initialPageSize)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  const pageCount = Math.max(1, Math.ceil(incidents.length / pageSize))
  const safePage = Math.min(page, pageCount - 1)
  const rows = useMemo(() => incidents.slice(safePage * pageSize, (safePage + 1) * pageSize), [incidents, safePage, pageSize])

  useEffect(() => setPage(0), [incidents.length, pageSize])
  useEffect(() => setSelected(new Set()), [incidents])

  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id))
  const toggleAll = () =>
    setSelected((s) => {
      const n = new Set(s)
      rows.forEach((r) => (allOnPage ? n.delete(r.id) : n.add(r.id)))
      return n
    })
  const toggleOne = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const from = incidents.length === 0 ? 0 : safePage * pageSize + 1
  const to = Math.min(incidents.length, (safePage + 1) * pageSize)

  const markReviewed = async () => {
    if (!onMarkReviewed) return
    setBusy(true)
    try {
      await onMarkReviewed([...selected])
      setSelected(new Set())
    } finally {
      setBusy(false)
    }
  }

  const colSpan = selectable ? 9 : 8

  return (
    <section className="relative overflow-hidden rounded-3xl border border-line bg-surface shadow-card" aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
        <h2 className="text-base font-semibold text-fg">{title}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {toolbar}
          <Button size="sm" onClick={() => exportCsv(incidents, 'incidents.csv')} disabled={incidents.length === 0}>
            <Download className="h-3.5 w-3.5" /> Export All
          </Button>
        </div>
      </div>

      <div className="hidden max-h-[560px] overflow-auto md:block">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="sticky top-0 z-10 bg-subtle text-left text-xs font-medium text-muted">
            <tr>
              {selectable && (
                <th className="w-10 py-3 pl-4">
                  <input type="checkbox" aria-label="Select all rows on this page" checked={allOnPage} onChange={toggleAll} className="h-4 w-4 rounded border-line accent-[rgb(var(--accent))]" />
                </th>
              )}
              <th className="px-3 py-3">Time</th>
              <th className="px-3 py-3">Destination</th>
              <th className="px-3 py-3">Decision</th>
              <th className="px-3 py-3">Risk</th>
              <th className="px-3 py-3">Source IP</th>
              <th className="px-3 py-3">Method</th>
              <th className="px-3 py-3">Review</th>
              <th className="px-3 py-3 pr-4 text-right">Report</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-t border-line">
                  <td colSpan={colSpan} className="p-3">
                    <Skeleton className="h-8 w-full" />
                  </td>
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={colSpan}>
                  <EmptyState title={emptyTitle} description={emptyDescription} mascot="think" />
                </td>
              </tr>
            ) : (
              rows.map((inc, i) => (
                <motion.tr
                  key={inc.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i, 10) * 0.025 }}
                  onClick={() => navigate(`/incidents/${inc.id}`)}
                  className={cn('cursor-pointer border-t border-line transition-colors hover:bg-subtle/70', selected.has(inc.id) && 'bg-accent-soft/40')}
                >
                  {selectable && (
                    <td className="py-3 pl-4" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" aria-label={`Select incident ${inc.id.slice(0, 8)}`} checked={selected.has(inc.id)} onChange={() => toggleOne(inc.id)} className="h-4 w-4 rounded border-line accent-[rgb(var(--accent))]" />
                    </td>
                  )}
                  <td className="whitespace-nowrap px-3 py-3 text-muted">
                    {inc.timestamp ? new Date(inc.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : '—'}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2.5">
                      <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-ink" style={{ background: hostColor(inc.target_host || '?') }}>
                        {(inc.target_host || '?').replace(/^www\./, '').charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate font-medium text-fg">{inc.target_host || 'Unknown host'}</div>
                        <div className="truncate text-xs text-muted">{inc.intent_label || `#${inc.id.slice(0, 8)}`}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3"><DecisionBadge decision={inc.decision} /></td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <span className="w-7 font-medium tabular-nums text-fg">{inc.risk_score}</span>
                      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-subtle" aria-hidden="true">
                        <span className={cn('block h-full rounded-full', riskTone(inc.risk_score))} style={{ width: `${Math.min(100, inc.risk_score)}%` }} />
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3 font-mono text-[13px] text-muted">{inc.user_ip}</td>
                  <td className="px-3 py-3"><Badge tone="neutral" className="font-mono text-[11px]">{inc.http_method || '—'}</Badge></td>
                  <td className="px-3 py-3">{inc.reviewed === undefined ? <span className="text-faint">—</span> : inc.reviewed ? <Badge tone="success">Reviewed</Badge> : <Badge tone="neutral">Pending</Badge>}</td>
                  <td className="px-3 py-3 pr-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <IconButton
                      label="Download PDF report"
                      className="h-8 w-8"
                      onClick={() =>
                        void apiDownload(`/api/v1/incidents/${inc.id}/pdf`, `incident_${inc.id.slice(0, 8)}.pdf`).catch((err: unknown) =>
                          toast.error('Download failed', err instanceof Error ? err.message : undefined),
                        )
                      }
                    >
                      <FileDown className="h-4 w-4" />
                    </IconButton>
                  </td>
                </motion.tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-line md:hidden">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <li key={i} className="p-4"><Skeleton className="h-16 w-full" /></li>)
        ) : rows.length === 0 ? (
          <li><EmptyState title={emptyTitle} description={emptyDescription} mascot="think" /></li>
        ) : (
          rows.map((inc) => (
            <li key={inc.id} className={cn('flex items-start gap-3 p-4', selected.has(inc.id) && 'bg-accent-soft/40')}>
              {selectable && (
                <input type="checkbox" aria-label={`Select incident ${inc.id.slice(0, 8)}`} checked={selected.has(inc.id)} onChange={() => toggleOne(inc.id)} className="mt-1 h-4 w-4 rounded border-line accent-[rgb(var(--accent))]" />
              )}
              <button type="button" onClick={() => navigate(`/incidents/${inc.id}`)} className="min-w-0 flex-1 text-left">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-fg">{inc.target_host || 'Unknown host'}</span>
                  <DecisionBadge decision={inc.decision} />
                </div>
                <div className="mt-0.5 truncate text-xs text-muted">{inc.intent_label || `#${inc.id.slice(0, 8)}`}</div>
                <div className="mt-2 flex items-center gap-3 text-xs text-muted">
                  <span className="font-medium tabular-nums text-fg">Risk {inc.risk_score}</span>
                  <span className="font-mono">{inc.user_ip}</span>
                  <span>{inc.timestamp ? new Date(inc.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : '—'}</span>
                </div>
              </button>
            </li>
          ))
        )}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-4 text-sm text-muted">
        <span>
          Showing {from}-{to} of {incidents.length} result{incidents.length === 1 ? '' : 's'}
        </span>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2">
            Rows per page
            <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="h-8 rounded-lg border border-line bg-surface px-2 text-fg">
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <Button size="sm" onClick={() => setPage(safePage - 1)} disabled={safePage === 0}><ChevronLeft className="h-4 w-4" /> Previous</Button>
          <Button size="sm" onClick={() => setPage(safePage + 1)} disabled={safePage >= pageCount - 1}>Next <ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="absolute inset-x-4 bottom-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-ink px-4 py-3 text-sm text-on-ink shadow-pop"
            role="region"
            aria-label="Bulk actions"
          >
            <span className="font-medium">{selected.size} selected</span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" className="text-on-ink/70 hover:bg-on-ink/10 hover:text-on-ink" onClick={() => setSelected(new Set())}>Clear</Button>
              <Button size="sm" className="border-0 bg-on-ink/10 text-on-ink hover:bg-on-ink/20" onClick={() => exportCsv(incidents.filter((i) => selected.has(i.id)), 'selected-incidents.csv')}>
                <Download className="h-3.5 w-3.5" /> Export selected
              </Button>
              {onMarkReviewed && (
                <Button size="sm" variant="primary" disabled={busy} onClick={() => void markReviewed()}>
                  <CheckCheck className="h-3.5 w-3.5" /> {busy ? 'Saving…' : 'Mark reviewed'}
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
