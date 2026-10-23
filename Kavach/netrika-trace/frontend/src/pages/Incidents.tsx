import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle, ShieldAlert } from 'lucide-react'
import { useIncidents } from '../hooks/useIncidents'
import type { Decision } from '../types/incident'

const DECISIONS: Array<{ label: string; value: '' | Decision }> = [
  { label: 'All decisions', value: '' },
  { label: 'Blocked', value: 'BLOCK' },
  { label: 'Warnings', value: 'WARN' },
  { label: 'Allowed', value: 'ALLOW' },
]

const decisionStyles: Record<Decision, string> = {
  BLOCK: 'bg-danger-soft text-danger-fg border-danger/30',
  WARN: 'bg-warn-soft text-warn-fg border-warn/30',
  ALLOW: 'bg-success-soft text-success-fg border-success/30',
}

function DecisionIcon({ decision }: { decision: Decision }) {
  if (decision === 'BLOCK') return <ShieldAlert className="h-5 w-5 text-danger-fg" />
  if (decision === 'WARN') return <AlertTriangle className="h-5 w-5 text-warn-fg" />
  return <CheckCircle className="h-5 w-5 text-success-fg" />
}

export default function Incidents() {
  const [decision, setDecision] = useState<'' | Decision>('')
  const { data: incidents = [], isLoading, isError, error, refetch } = useIncidents(100, decision)

  return (
    <section className="flex flex-col gap-6 p-6 md:p-8" id="incidents-page">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text md:text-3xl">Incidents</h1>
          <p className="mt-1 text-sm text-text-dim">
            Review persisted traffic decisions and open an incident for its investigation details.
          </p>
        </div>
        <label className="flex items-center gap-3 text-sm text-text-dim">
          <span>Decision</span>
          <select
            aria-label="Filter incidents by decision"
            value={decision}
            onChange={(event) => setDecision(event.target.value as '' | Decision)}
            className="rounded-xl border border-line bg-grapho-surface px-3 py-2 text-text focus:outline-none focus:border-grapho-orange"
          >
            {DECISIONS.map((option) => (
              <option key={option.value || 'all'} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </header>

      {isError && (
        <div role="alert" className="rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger-fg">
          <p>{error instanceof Error ? error.message : 'Unable to load incidents.'}</p>
          <button type="button" onClick={() => void refetch()} className="mt-2 underline">
            Retry
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-line bg-grapho-surface/50">
        <div className="grid grid-cols-[minmax(0,1fr)_120px_150px_100px] gap-4 border-b border-line px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-text-dim max-md:hidden">
          <span>Incident</span>
          <span>Decision</span>
          <span>Destination</span>
          <span>Risk</span>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-sm text-text-dim" role="status">Loading incidents…</div>
        ) : !isError && incidents.length === 0 ? (
          <div className="p-10 text-center">
            <p className="font-medium text-text">No incidents found</p>
            <p className="mt-1 text-sm text-text-dim">
              {decision ? 'Try another decision filter.' : 'New traffic decisions will appear here.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-line">
            {incidents.map((incident) => (
              <Link
                key={incident.id}
                to={`/incidents/${incident.id}`}
                className="grid grid-cols-[minmax(0,1fr)_120px_150px_100px] items-center gap-4 px-5 py-4 transition-colors hover:bg-subtle max-md:grid-cols-1"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <DecisionIcon decision={incident.decision} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-text">
                      {incident.intent_label || 'Traffic decision'}
                    </div>
                    <div className="mt-1 text-xs text-text-dim">
                      {incident.timestamp
                        ? new Date(incident.timestamp).toLocaleString()
                        : 'Unknown time'}
                      <span className="mx-2">·</span>
                      {incident.id.slice(0, 8)}
                      {incident.reviewed && <span className="ml-2 text-success-fg">Reviewed</span>}
                    </div>
                  </div>
                </div>
                <span className={`w-fit rounded-full border px-2.5 py-1 text-[10px] font-bold ${decisionStyles[incident.decision]}`}>
                  {incident.decision}
                </span>
                <span className="truncate text-sm text-text-dim">{incident.target_host || 'Unknown host'}</span>
                <span className="text-sm font-semibold tabular-nums text-text">{incident.risk_score}/100</span>
              </Link>
            ))}
          </div>
        )}
      </div>
      {!isLoading && !isError && incidents.length > 0 && (
        <p className="text-xs text-text-dim">Showing the latest {incidents.length} incidents.</p>
      )}
    </section>
  )
}
