import { useMemo } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import type { HourlyData } from '../types/incident'
import Card from './ui/Card'
import Tabs from './ui/Tabs'

export type Window = '1h' | '24h' | '7d' | '30d'
const RANGES: Array<{ id: Window; label: string }> = [
  { id: '1h', label: '1h' },
  { id: '24h', label: '24h' },
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' },
]

const SERIES = [
  { key: 'allowed', name: 'Allowed', color: 'rgb(var(--success))', id: 'g-allowed' },
  { key: 'warned', name: 'Warned', color: 'rgb(var(--warn))', id: 'g-warned' },
  { key: 'blocked', name: 'Blocked', color: 'rgb(var(--danger))', id: 'g-blocked' },
] as const

export default function DecisionsChart({ data, window, onWindowChange }: { data: HourlyData[]; window: Window; onWindowChange: (w: Window) => void }) {
  const rows = useMemo(
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
    [data, window],
  )
  const hasTraffic = data.some((b) => b.BLOCK + b.WARN + b.ALLOW > 0)

  return (
    <Card className="flex h-full flex-col p-5" id="decisions-chart">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-fg">Traffic decisions</h2>
          <p className="text-xs text-muted">Persisted decisions, timestamps in UTC</p>
        </div>
        <Tabs label="Time range" size="sm" tabs={RANGES} value={window} onChange={onWindowChange} />
      </div>
      <div className="mt-3 flex gap-4 text-xs text-muted">
        {[...SERIES].reverse().map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} /> {s.name}
          </span>
        ))}
      </div>
      {!hasTraffic ? (
        <div className="flex min-h-[200px] flex-1 items-center justify-center text-sm text-muted" role="status">
          No persisted requests in this period.
        </div>
      ) : (
        <div className="mt-2 h-[210px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={rows} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
              <defs>
                {SERIES.map((s) => (
                  <linearGradient key={s.id} id={s.id} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 6" stroke="rgb(var(--line))" vertical={false} />
              <XAxis
                dataKey="label"
                interval={window === '30d' ? 4 : window === '7d' ? 11 : window === '1h' ? 9 : 3}
                tick={{ fill: 'rgb(var(--faint))', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ stroke: 'rgb(var(--line))' }}
                contentStyle={{
                  background: 'rgb(var(--surface))',
                  border: '1px solid rgb(var(--line))',
                  borderRadius: 12,
                  color: 'rgb(var(--fg))',
                  fontSize: 12,
                  boxShadow: 'var(--shadow-pop)',
                }}
                labelStyle={{ color: 'rgb(var(--muted))', marginBottom: 4 }}
              />
              {SERIES.map((s) => (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.name}
                  stackId="1"
                  stroke={s.color}
                  strokeWidth={2}
                  fill={`url(#${s.id})`}
                  isAnimationActive
                  animationDuration={900}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}
