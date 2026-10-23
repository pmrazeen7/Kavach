import { useNavigate } from 'react-router-dom'
import type { Incident, Decision } from '../types/incident'

interface IncidentTableProps {
  incidents: Incident[]
}

const badgeStyle: Record<Decision, string> = {
  BLOCK: 'bg-red text-black',
  WARN: 'bg-amber text-black',
  ALLOW: 'bg-green text-black',
}

export default function IncidentTable({ incidents }: IncidentTableProps) {
  const navigate = useNavigate()

  return (
    <div className="bg-white/60 backdrop-blur-xl border border-white/60 shadow-glass rounded-2xl p-6" id="incident-table">
      <div className="panel-title mb-4">INCIDENT LOG</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left label-uppercase border-b border-border">
              <th className="py-2 px-3">ID</th>
              <th className="py-2 px-3">TIME</th>
              <th className="py-2 px-3">SOURCE IP</th>
              <th className="py-2 px-3">ENDPOINT</th>
              <th className="py-2 px-3">ENTITIES</th>
              <th className="py-2 px-3">RISK</th>
              <th className="py-2 px-3">DECISION</th>
            </tr>
          </thead>
          <tbody>
            {incidents.map((inc) => {
              let entityTags: string[] = []
              try {
                const parsed = JSON.parse(inc.entities_json || '{}')
                entityTags = Object.keys(parsed)
              } catch { /* ignore */ }

              return (
                <tr
                  key={inc.id}
                  onClick={() => navigate(`/incidents/${inc.id}`)}
                  className="border-b border-border/50 cursor-pointer transition-colors hover:bg-white/40"
                >
                  <td className="py-2.5 px-3 font-mono text-text-dim">
                    {inc.id.slice(0, 8)}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-text-dim">
                    {inc.timestamp
                      ? new Date(inc.timestamp).toLocaleTimeString('en-IN', {
                          timeZone: 'Asia/Kolkata',
                          hour12: false,
                        })
                      : '—'}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-text">{inc.user_ip}</td>
                  <td className="py-2.5 px-3 font-mono text-text">{inc.target_host}</td>
                  <td className="py-2.5 px-3">
                    <div className="flex gap-1 flex-wrap">
                      {entityTags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="px-1.5 py-0.5 bg-white/50 border border-white/60 rounded text-[8px] text-text-dim shadow-sm font-semibold"
                        >
                          {tag}
                        </span>
                      ))}
                      {entityTags.length > 3 && (
                        <span className="text-[8px] text-text-dim font-semibold">+{entityTags.length - 3}</span>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 px-3">
                    <span
                      className={`font-display font-bold text-base ${
                        inc.risk_score >= 70
                          ? 'text-red'
                          : inc.risk_score >= 30
                          ? 'text-amber'
                          : 'text-green'
                      }`}
                    >
                      {inc.risk_score}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <span
                      className={`px-2 py-0.5 rounded shadow-sm text-[8px] font-bold tracking-wider ${badgeStyle[inc.decision]}`}
                    >
                      {inc.decision}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {incidents.length === 0 && (
          <div className="text-center text-text-dim text-xs py-8">
            No incidents recorded yet
          </div>
        )}
      </div>
    </div>
  )
}
