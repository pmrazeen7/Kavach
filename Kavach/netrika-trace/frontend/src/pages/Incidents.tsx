import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Filter, Search as SearchIcon } from 'lucide-react'
import { useIncidents } from '../hooks/useIncidents'
import { apiFetch } from '../lib/api'
import type { Decision } from '../types/incident'
import IncidentTable from '../components/IncidentTable'
import PageHeader from '../components/ui/PageHeader'
import EmptyState from '../components/ui/EmptyState'
import Button from '../components/ui/Button'
import { celebrate, toast } from '../components/ui/Toast'

const DECISIONS: Array<{ label: string; value: '' | Decision }> = [
  { label: 'All decisions', value: '' },
  { label: 'Blocked', value: 'BLOCK' },
  { label: 'Warned', value: 'WARN' },
  { label: 'Allowed', value: 'ALLOW' },
]

const RISK: Array<{ label: string; min: number }> = [
  { label: 'Any risk', min: 0 },
  { label: 'Risk 30+', min: 30 },
  { label: 'Risk 70+', min: 70 },
]

const selectCls = 'h-8 rounded-lg border border-line bg-surface px-2 text-[13px] text-fg'

export default function Incidents() {
  const [decision, setDecision] = useState<'' | Decision>('')
  const [keyword, setKeyword] = useState('')
  const [minRisk, setMinRisk] = useState(0)
  const queryClient = useQueryClient()
  const { data: incidents = [], isLoading, isError, error, refetch } = useIncidents(100, decision)

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    return incidents.filter(
      (i) =>
        i.risk_score >= minRisk &&
        (!q || [i.target_host, i.intent_label, i.user_ip, i.id].some((v) => (v || '').toLowerCase().includes(q))),
    )
  }, [incidents, keyword, minRisk])

  const markReviewed = async (ids: string[]) => {
    const byId = new Map(incidents.map((i) => [i.id, i]))
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
      <PageHeader title="Incidents" subtitle="Review persisted traffic decisions and open an incident for its investigation details." />

      {isError ? (
        <div className="rounded-2xl border border-line bg-surface">
          <EmptyState
            kind="error"
            title="Unable to load incidents"
            description={error instanceof Error ? error.message : undefined}
            action={<Button variant="primary" onClick={() => void refetch()}>Retry</Button>}
          />
        </div>
      ) : (
        <IncidentTable
          title="Incident log"
          incidents={filtered}
          loading={isLoading}
          emptyTitle={decision || keyword || minRisk ? 'No matching incidents' : 'No incidents found'}
          emptyDescription={decision || keyword || minRisk ? 'Try loosening the filters.' : 'New traffic decisions will appear here.'}
          onMarkReviewed={markReviewed}
          toolbar={
            <>
              <label className="relative">
                <span className="sr-only">Keywords</span>
                <SearchIcon className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
                <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Keywords" className={`${selectCls} w-36 pl-7`} />
              </label>
              <label className="flex items-center gap-1.5">
                <Filter className="h-3.5 w-3.5 text-faint" aria-hidden="true" />
                <select aria-label="Filter by decision" value={decision} onChange={(e) => setDecision(e.target.value as '' | Decision)} className={selectCls}>
                  {DECISIONS.map((d) => <option key={d.value || 'all'} value={d.value}>{d.label}</option>)}
                </select>
              </label>
              <select aria-label="Filter by risk" value={minRisk} onChange={(e) => setMinRisk(Number(e.target.value))} className={selectCls}>
                {RISK.map((r) => <option key={r.min} value={r.min}>{r.label}</option>)}
              </select>
            </>
          }
        />
      )}
    </section>
  )
}
