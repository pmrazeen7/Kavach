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
    <div className="rounded-2xl border border-line bg-surface shadow-card p-5 flex flex-col h-full min-h-[260px]" id="hourly-chart">
      <div className="flex items-center justify-between mb-1">
        <div className="panel-title mb-0 flex-1">Traffic decisions</div>
        <select
          aria-label="Traffic time range"
          value={window}
          onChange={(event) => onWindowChange(event.target.value as HourlyBarChartProps['window'])}
          className="text-xs font-medium text-fg bg-subtle border border-line rounded-lg px-2 py-1"
        >
          <option value="1h">Last hour</option>
          <option value="24h">24 hours</option>
          <option value="7d">7 days</option>
          <option value="30d">30 days</option>
        </select>
      </div>
      <p className="text-[11px] text-text-dim mb-3">Persisted decisions, timestamps in UTC</p>
      {!hasTraffic ? (
        <div className="flex-1 min-h-[140px] flex items-center justify-center text-xs text-text-dim" role="status">
          No persisted requests in this period.
        </div>
      ) : (
        <div className="h-[190px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartRows} barGap={4} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 6" stroke="rgb(156 163 175 / 0.25)" vertical={false} />
            <XAxis
              dataKey="label"
              interval={window === '30d' ? 4 : window === '7d' ? 11 : window === '1h' ? 9 : 3}
              tick={{ fill: '#9CA3AF', fontSize: 11 }}
              axisLine={{ stroke: 'rgb(156 163 175 / 0.3)' }}
              tickLine={false}
            />
            <YAxis hide />
            <Tooltip
              cursor={{ fill: 'rgb(79 70 229 / 0.06)' }}
              animationDuration={180}
              contentStyle={{
                background: 'rgb(var(--surface))',
                border: '1px solid rgb(var(--line))',
                borderRadius: 12,
                color: 'rgb(var(--fg))',
                fontSize: 11,
                fontFamily: 'Inter, sans-serif',
                fontWeight: 600,
                boxShadow: '0 12px 32px rgb(16 24 40 / 0.12)',
                padding: '10px 14px',
              }}
              labelStyle={{ color: 'rgb(var(--muted))', marginBottom: 4 }}
            />
            <Bar
              dataKey="blocked"
              name="Blocked"
              fill="#EF4444"
              radius={[6, 6, 0, 0]}
              maxBarSize={28}
              isAnimationActive={animate}
              animationDuration={animate ? 800 : 0}
            />
            <Bar
              dataKey="warned"
              name="Warned"
              fill="#F59E0B"
              radius={[6, 6, 0, 0]}
              maxBarSize={28}
              isAnimationActive={animate}
              animationDuration={animate ? 800 : 0}
            />
            <Bar
              dataKey="allowed"
              name="Allowed"
              fill="#34D399"
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
