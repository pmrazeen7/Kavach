import { Link } from 'react-router-dom'
import { ArrowRight, CircleCheck, MonitorSmartphone, ShieldAlert } from 'lucide-react'
import type { EndpointStat, Incident } from '../types/incident'
import Card from './ui/Card'
import Character from './ui/Character'

interface Props {
  incidents: Incident[]
  endpoints: EndpointStat[]
  deviceCount: number | null
}

export default function InsightsCard({ incidents, endpoints, deviceCount }: Props) {
  const unreviewedBlocked = incidents.filter((i) => i.decision === 'BLOCK' && !i.reviewed).length
  const top = [...endpoints].sort((a, b) => b.total - a.total).slice(0, 3)
  const maxTotal = Math.max(...top.map((t) => t.total), 1)
  const allClear = unreviewedBlocked === 0

  return (
    <Card className="flex h-full flex-col gap-4 p-5" id="insights">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-fg">Next steps</h2>
        <Character who="sage" pose={allClear ? 'celebrate' : 'think'} size={48} follow={false} />
      </div>

      <Link
        to="/incidents?decision=BLOCK&unreviewed=1"
        className="group flex items-center gap-3 rounded-2xl border border-line bg-subtle/60 p-3 transition-colors hover:bg-subtle"
      >
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${allClear ? 'bg-success-soft text-success-fg' : 'bg-danger-soft text-danger-fg'}`}>
          {allClear ? <CircleCheck className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
        </span>
        <span className="min-w-0 flex-1 text-sm">
          <span className="block font-medium text-fg">{allClear ? 'Nothing waiting for review' : `${unreviewedBlocked} blocked incident${unreviewedBlocked === 1 ? '' : 's'} to review`}</span>
          <span className="block text-xs text-muted">{allClear ? 'Every recent block has been looked at.' : 'Open them and add investigation notes.'}</span>
        </span>
        <ArrowRight className="h-4 w-4 text-faint transition-transform group-hover:translate-x-0.5" />
      </Link>

      {deviceCount === 0 && (
        <Link to="/devices" className="group flex items-center gap-3 rounded-2xl border border-line bg-subtle/60 p-3 transition-colors hover:bg-subtle">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-fg"><MonitorSmartphone className="h-4 w-4" /></span>
          <span className="min-w-0 flex-1 text-sm">
            <span className="block font-medium text-fg">No devices registered</span>
            <span className="block text-xs text-muted">Install the extension to start protecting browsers.</span>
          </span>
          <ArrowRight className="h-4 w-4 text-faint transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}

      <div>
        <div className="mb-2 text-xs font-medium text-muted">Top destinations</div>
        {top.length === 0 ? (
          <p className="text-sm text-muted">No traffic yet.</p>
        ) : (
          <ul className="space-y-2.5">
            {top.map((ep) => (
              <li key={ep.hostname}>
                <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                  <span className="truncate font-medium text-fg">{ep.hostname}</span>
                  <span className="shrink-0 text-xs text-muted tabular-nums">{ep.total} hits · {ep.blocked} blocked</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-subtle">
                  <div className={`h-full rounded-full ${ep.blocked > 0 ? 'bg-danger' : ep.warned > 0 ? 'bg-warn' : 'bg-success'}`} style={{ width: `${(ep.total / maxTotal) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}
