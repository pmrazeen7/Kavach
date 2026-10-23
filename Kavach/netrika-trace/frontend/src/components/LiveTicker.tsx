import type { Incident, Decision } from '../types/incident'

interface LiveTickerProps {
  incidents: Incident[]
}

const dotColor: Record<Decision, string> = {
  BLOCK: 'bg-red',
  WARN: 'bg-amber',
  ALLOW: 'bg-green',
}

export default function LiveTicker({ incidents }: LiveTickerProps) {
  const items = incidents.slice(0, 20)

  if (items.length === 0) {
    return (
      <div className="glass-card p-5">
        <div className="panel-title mb-3">Recent traffic</div>
        <div className="text-xs text-text-dim font-medium text-center py-4">Awaiting traffic…</div>
      </div>
    )
  }

  return (
    <div className="glass-card p-5" id="live-ticker">
      <div className="panel-title mb-3">Recent traffic</div>
      <div className="h-9 overflow-hidden relative rounded-xl bg-subtle border border-line">
        <div className="flex items-center h-full whitespace-nowrap gap-6 px-3 overflow-x-auto">
          {items.map((inc) => (
            <div key={inc.id} className="flex items-center gap-1.5 shrink-0">
              <span className={`w-1.5 h-1.5 rounded-full ${dotColor[inc.decision]}`} />
              <span className="text-[10px] font-mono text-text-dim">{inc.user_ip}</span>
              <span className="text-[10px] font-mono font-medium text-text">→ {inc.target_host}</span>
              <span
                className={`text-[10px] font-bold tabular-nums ${
                  inc.risk_score >= 70 ? 'text-red' : inc.risk_score >= 30 ? 'text-amber' : 'text-green'
                }`}
              >
                {inc.risk_score}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
