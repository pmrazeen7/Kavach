import { memo } from 'react'
import { ArrowUpRight } from 'lucide-react'
import type { Incident, Decision } from '../types/incident'

interface ActivityFeedProps {
  incidents: Incident[]
}

const badgeConfig: Record<Decision, { bg: string; text: string; border: string }> = {
  BLOCK: { bg: 'bg-red/15', text: 'text-red', border: 'border-l-red' },
  WARN: { bg: 'bg-amber/15', text: 'text-amber', border: 'border-l-amber' },
  ALLOW: { bg: 'bg-green/15', text: 'text-green', border: 'border-l-green' },
}

const scoreColor = (s: number) =>
  s >= 70 ? 'text-red' : s >= 30 ? 'text-amber' : 'text-green'

function ActivityFeed({ incidents }: ActivityFeedProps) {
  const items = incidents.slice(0, 8)

  return (
    <div className="glass-card p-5 h-full flex flex-col" id="activity-feed">
      <div className="flex items-center justify-between mb-4">
        <div className="panel-title mb-0">RECENT ACTIVITY</div>
        <button
          type="button"
          className="text-[11px] font-semibold text-grapho-orange hover:text-orange-400 transition-colors duration-300"
        >
          View more
        </button>
      </div>
      <div className="space-y-2 overflow-y-auto max-h-[360px] hide-scrollbar flex-1">
        {items.map((inc) => {
          const cfg = badgeConfig[inc.decision]
          return (
            <div
              key={inc.id}
              className={`${cfg.border} border-l-2 ${cfg.bg} rounded-2xl px-3 py-3 flex items-center gap-3 border border-line shadow-sm cursor-default transition-shadow duration-300 hover:shadow-lift`}
            >
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-white/[0.08] to-white/[0.02] border border-line shrink-0 overflow-hidden">
                <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-text-dim font-mono">
                  {inc.decision[0]}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-text truncate font-mono">{inc.target_host}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-[10px] font-bold tracking-wide ${cfg.text}`}>{inc.decision}</span>
                  <span className="text-[10px] text-text-dim font-mono">{inc.user_ip}</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className={`font-bold text-lg tabular-nums ${scoreColor(inc.risk_score)}`}>
                  {inc.risk_score}
                </span>
                <span className="text-[9px] text-text-dim font-mono">
                  {inc.timestamp
                    ? new Date(inc.timestamp).toLocaleTimeString('en-IN', {
                        timeZone: 'Asia/Kolkata',
                        hour12: false,
                      })
                    : ''}
                </span>
              </div>
              <ArrowUpRight className="w-4 h-4 text-text-dim opacity-40 shrink-0" strokeWidth={1.5} />
            </div>
          )
        })}
        {items.length === 0 && (
          <div className="text-center text-text-dim text-xs py-10 font-medium">No activity yet</div>
        )}
      </div>
    </div>
  )
}

export default memo(ActivityFeed)
