import { useEffect, useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import type { HourlyData } from '../types/incident'

interface HourlyBarChartProps {
  data: HourlyData[]
  window: '1h' | '24h' | '7d' | '30d'
  onWindowChange: (window: '1h' | '24h' | '7d' | '30d') => void
}

export default function HourlyBarChart({ data, window, onWindowChange }: HourlyBarChartProps) {
  const [animate, setAnimate] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setAnimate(false), 1100)
    return () => clearTimeout(timer)
  }, [])

  const chartRows = useMemo(
    () =>
      data.map((d) => ({
        label: new Intl.DateTimeFormat('en-GB', {
          timeZone: 'UTC',
          ...(window === '30d'
            ? { day: '2-digit', month: 'short' }
            : window === '7d'
              ? { weekday: 'short', hour: '2-digit' }
              : { hour: '2-digit', ...(window === '1h' ? { minute: '2-digit' } : {}) }),
        }).format(new Date(d.timestamp)),
        blocked: d.BLOCK,
        warned: d.WARN,
        allowed: d.ALLOW,
      })),
    [data, window]
  )
  const hasTraffic = data.some((bucket) => bucket.BLOCK + bucket.WARN + bucket.ALLOW > 0)

  return (
    <div className="glass-card p-5 flex flex-col min-h-[220px]" id="hourly-chart">
      <div className="flex items-center justify-between mb-1">
        <div className="panel-title mb-0 flex-1">TRAFFIC DECISIONS</div>
        <select
          aria-label="Traffic time range"
          value={window}
          onChange={(event) => onWindowChange(event.target.value as HourlyBarChartProps['window'])}
          className="text-[10px] font-semibold text-text bg-white/[0.05] border border-white/[0.1] rounded-lg px-2 py-1"
        >
          <option value="1h">Last hour</option>
          <option value="24h">24 hours</option>
          <option value="7d">7 days</option>
          <option value="30d">30 days</option>
        </select>
      </div>
      <p className="text-[11px] text-text-dim mb-3">Persisted decisions · timestamps in UTC</p>
      {!hasTraffic ? (
        <div className="flex-1 min-h-[140px] flex items-center justify-center text-xs text-text-dim" role="status">
          No persisted requests in this period.
        </div>
      ) : (
        <div className="flex-1 min-h-[140px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartRows} barGap={4} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 6" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis
              dataKey="label"
              interval={window === '30d' ? 4 : window === '7d' ? 11 : window === '1h' ? 9 : 3}
              tick={{ fill: '#8b90a0', fontSize: 9, fontWeight: 500 }}
              axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
              tickLine={false}
            />
            <YAxis hide />
            <Tooltip
              cursor={{ fill: 'rgba(249, 115, 22, 0.06)' }}
              animationDuration={180}
              contentStyle={{
                background: 'rgba(22, 24, 30, 0.96)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 12,
                color: '#f0f2f7',
                fontSize: 11,
                fontFamily: 'DM Sans, Inter, sans-serif',
                fontWeight: 600,
                boxShadow: '0 12px 40px rgba(0, 0, 0, 0.45)',
                padding: '10px 14px',
              }}
              labelStyle={{ color: '#8b90a0', marginBottom: 4 }}
            />
            <Bar
              dataKey="blocked"
              name="Blocked"
              fill="#f97316"
              radius={[6, 6, 0, 0]}
              maxBarSize={28}
              isAnimationActive={animate}
              animationDuration={animate ? 800 : 0}
            />
            <Bar
              dataKey="warned"
              name="Warned"
              fill="#fbbf24"
              radius={[6, 6, 0, 0]}
              maxBarSize={28}
              isAnimationActive={animate}
              animationDuration={animate ? 800 : 0}
            />
            <Bar
              dataKey="allowed"
              name="Allowed"
              fill="#3d5248"
              radius={[6, 6, 0, 0]}
              maxBarSize={28}
              isAnimationActive={animate}
              animationDuration={animate ? 800 : 0}
            />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
