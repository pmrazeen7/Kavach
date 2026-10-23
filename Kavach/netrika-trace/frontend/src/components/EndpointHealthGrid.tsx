import type { EndpointStat } from '../types/incident'

interface EndpointHealthGridProps {
  data: EndpointStat[]
}

export default function EndpointHealthGrid({ data }: EndpointHealthGridProps) {
  const maxTotal = Math.max(...data.map((d) => d.total), 1)

  return (
    <div className="glass-card p-5" id="endpoint-grid">
      <div className="panel-title mb-4">Endpoints</div>
      <div className="flex flex-col gap-2.5">
        {data.map((ep) => {
          const color =
            ep.blocked > 0 ? 'text-red' : ep.warned > 0 ? 'text-amber' : 'text-green'
          const barColor =
            ep.blocked > 0 ? 'bg-red' : ep.warned > 0 ? 'bg-amber' : 'bg-green'

          return (
            <div
              key={ep.hostname}
              className="bg-subtle border border-line rounded-xl px-3 py-3 transition-all duration-300 hover:bg-subtle hover:border-line"
            >
              <div className="text-[11px] font-mono font-medium text-text truncate mb-1">
                {ep.hostname}
              </div>
              <div className={`text-[10px] font-medium ${color} mb-2`}>
                {ep.total} hits · {ep.blocked} blocked
              </div>
              <div className="h-1 bg-subtle rounded-full overflow-hidden">
                <div
                  className={`h-full ${barColor} rounded-full transition-all duration-500 ease-out`}
                  style={{ width: `${(ep.total / maxTotal) * 100}%` }}
                />
              </div>
            </div>
          )
        })}
        {data.length === 0 && (
          <div className="text-center text-text-dim text-xs py-6 font-medium">No traffic yet</div>
        )}
      </div>
    </div>
  )
}
