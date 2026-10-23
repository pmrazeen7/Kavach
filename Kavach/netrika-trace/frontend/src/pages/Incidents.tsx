import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Search as SearchIcon } from 'lucide-react'
import { useIncidents } from '../hooks/useIncidents'
import { apiDownload, apiFetch } from '../lib/api'
import type { Decision, Incident } from '../types/incident'
import IncidentTable from '../components/IncidentTable'
import PageHeader from '../components/ui/PageHeader'
import EmptyState from '../components/ui/EmptyState'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Tabs from '../components/ui/Tabs'
import { celebrate, toast } from '../components/ui/Toast'

type DecisionFilter = '' | Decision

const DECISIONS: Array<{ id: DecisionFilter | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'BLOCK', label: 'Blocked' },
  { id: 'WARN', label: 'Warned' },
  { id: 'ALLOW', label: 'Allowed' },
]

const RISK = [
  { label: 'Any risk', min: 0 },
  { label: 'Risk 30+', min: 30 },
  { label: 'Risk 70+', min: 70 },
]

interface SearchRow {
  id: string
  timestamp: string | null
  user_ip: string
  target_host: string
  risk_score: number
  decision: Decision
  intent_label: string
}

/** Search results carry fewer fields than the list; fill the rest with neutral defaults. */
function toIncident(r: SearchRow): Incident {
  return {
    id: r.id,
    timestamp: r.timestamp ?? '',
    user_ip: r.user_ip,
    target_host: r.target_host,
    target_url: '',
    http_method: '',
    risk_score: r.risk_score,
    decision: r.decision,
    intent_label: r.intent_label,
    entities_json: '{}',
    code_detected: false,
    payload_size_bytes: 0,
    simulation_html: '',
  }
}

const fieldCls = 'h-8 rounded-lg border border-line bg-surface px-2 text-[13px] text-fg'

export default function Incidents() {
  const [params, setParams] = useSearchParams()
  const decision = (params.get('decision') || '') as DecisionFilter
  const minRisk = Number(params.get('risk') || 0)
  const unreviewed = params.get('unreviewed') === '1'
  const urlQ = params.get('q') || ''
  const [qInput, setQInput] = useState(urlQ)
  const queryClient = useQueryClient()

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)))
    setParams(next, { replace: true })
  }

  useEffect(() => setQInput(urlQ), [urlQ])
  useEffect(() => {
    if (qInput === urlQ) return
    const t = setTimeout(() => update({ q: qInput.trim() || null }), 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qInput])

  const list = useIncidents(100, decision)
  const serverSearch = Boolean(urlQ) || minRisk > 0
  const search = useQuery<SearchRow[]>({
    queryKey: ['incident-search', urlQ, decision, minRisk],
    queryFn: () => {
      const p = new URLSearchParams({ limit: '100' })
      if (urlQ) p.set('q', urlQ)
      if (decision) p.set('decision', decision)
      if (minRisk) p.set('risk_min', String(minRisk))
      return apiFetch<SearchRow[]>(`/api/v1/analytics/search?${p.toString()}`)
    },
    enabled: serverSearch,
  })

  const active = serverSearch ? search : list
  const rows = useMemo<Incident[]>(() => {
    let out: Incident[]
    if (serverSearch) {
      const byId = new Map((list.data ?? []).map((i) => [i.id, i]))
      out = (search.data ?? []).map((r) => byId.get(r.id) ?? toIncident(r))
    } else {
      out = list.data ?? []
    }
    return unreviewed ? out.filter((i) => i.reviewed === false) : out
  }, [serverSearch, search.data, list.data, unreviewed])

  const filtered = Boolean(decision || urlQ || minRisk || unreviewed)

  const markReviewed = async (ids: string[]) => {
    const byId = new Map(rows.map((i) => [i.id, i]))
    const results = await Promise.allSettled(
      ids.map((id) =>
        apiFetch(`/api/v1/incidents/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: byId.get(id)?.notes || 'Marked reviewed from the incidents list' }),
        }),
      ),
    )
    const failed = results.filter((r) => r.status === 'rejected').length
    await queryClient.invalidateQueries({ queryKey: ['incidents'] })
    if (failed === 0) {
      toast.success(`${ids.length} incident${ids.length === 1 ? '' : 's'} marked reviewed`)
      celebrate()
    } else {
      toast.error(`${failed} of ${ids.length} could not be updated`, 'You may lack the review permission.')
    }
  }

  return (
    <section id="incidents-page">
      <PageHeader
        title="Incidents"
        subtitle="Search, review and export every traffic decision."
        action={
          <Button onClick={() => void apiDownload('/api/v1/analytics/export', 'incidents.csv').catch((e: unknown) => toast.error('Export failed', e instanceof Error ? e.message : undefined))}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        }
      />

      {active.isError ? (
        <Card>
          <EmptyState kind="error" title="Unable to load incidents" description={active.error instanceof Error ? active.error.message : undefined} action={<Button variant="primary" onClick={() => void active.refetch()}>Retry</Button>} />
        </Card>
      ) : (
        <IncidentTable
          title={filtered ? 'Filtered incidents' : 'Incident log'}
          incidents={rows}
          loading={active.isLoading}
          emptyTitle={filtered ? 'No matching incidents' : 'No incidents found'}
          emptyDescription={filtered ? 'Try loosening the filters.' : 'New traffic decisions will appear here.'}
          onMarkReviewed={markReviewed}
          toolbar={
            <>
              <label className="relative">
                <span className="sr-only">Search incidents</span>
                <SearchIcon className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
                <input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Host, IP, intent or ID" className={`${fieldCls} w-44 pl-7`} />
              </label>
              <Tabs
                label="Decision"
                size="sm"
                tabs={DECISIONS}
                value={(decision || 'all') as DecisionFilter | 'all'}
                onChange={(id) => update({ decision: id === 'all' ? null : id })}
              />
              <select aria-label="Filter by risk" value={minRisk} onChange={(e) => update({ risk: Number(e.target.value) ? e.target.value : null })} className={fieldCls}>
                {RISK.map((r) => <option key={r.min} value={r.min}>{r.label}</option>)}
              </select>
              <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-line bg-surface px-2 text-[13px] text-fg">
                <input type="checkbox" checked={unreviewed} onChange={(e) => update({ unreviewed: e.target.checked ? '1' : null })} className="h-3.5 w-3.5 accent-[rgb(var(--accent))]" />
                Unreviewed
              </label>
            </>
          }
        />
      )}
    </section>
  )
}
