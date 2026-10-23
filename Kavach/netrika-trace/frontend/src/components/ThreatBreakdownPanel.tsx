interface ThreatBreakdownPanelProps {
  data: Record<string, number>
}

const barColors: Record<string, string> = {
  AADHAAR: 'bg-rose-400',
  PAN: 'bg-rose-400',
  UPI_ID: 'bg-rose-400',
  IFSC: 'bg-rose-400',
  SENSITIVE_AWS_KEY: 'bg-rose-400',
  SENSITIVE_PRIVATE_KEY: 'bg-rose-400',
  SENSITIVE_DATABASE_CRED: 'bg-rose-400',
  SENSITIVE_SECRET_KEY: 'bg-rose-400',
  AWS_ACCESS_KEY: 'bg-rose-400',
  PRIVATE_KEY: 'bg-rose-400',
  DATABASE_URL: 'bg-rose-400',
  CREDIT_CARD: 'bg-violet-400',
  SOURCE_CODE_DETECTED: 'bg-violet-400',
  JWT_TOKEN: 'bg-violet-400',
  ORG: 'bg-violet-400',
  PERSON: 'bg-violet-400',
  EMAIL_ADDRESS: 'bg-violet-400',
  PHONE_NUMBER: 'bg-violet-400',
  LOCATION: 'bg-violet-400',
  DATE: 'bg-violet-400',
  GPE: 'bg-violet-400',
  IP_ADDRESS: 'bg-violet-400',
}

export default function ThreatBreakdownPanel({ data }: ThreatBreakdownPanelProps) {
  const entries = Object.entries(data).sort(([, a], [, b]) => b - a)
  const maxVal = Math.max(...Object.values(data), 1)

  return (
    <div className="glass-card p-5" id="threat-breakdown">
      <div className="panel-title mb-1">ENTITY DETECTIONS</div>
      <p className="text-[10px] text-text-dim mb-4">All persisted detections · all time</p>
      <div className="space-y-2.5">
        {entries.map(([label, count]) => (
          <div key={label} className="flex items-center gap-2.5">
            <span className="text-[10px] text-text-dim font-semibold uppercase tracking-wider w-[90px] truncate text-right">
              {label.replace(/_/g, ' ')}
            </span>
            <div className="flex-1 h-[6px] bg-white/[0.06] rounded-full overflow-hidden">
              <div
                className={`h-full ${barColors[label] || 'bg-violet-400'} rounded-full transition-all duration-700 ease-out`}
                style={{ width: `${(count / maxVal) * 100}%` }}
              />
            </div>
            <span className="text-[11px] font-mono font-bold text-text w-7 text-right tabular-nums">{count}</span>
          </div>
        ))}
        {entries.length === 0 && (
          <div className="text-text-dim text-xs font-medium text-center py-6">No data yet</div>
        )}
      </div>
    </div>
  )
}
