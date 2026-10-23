import { useMemo } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import Card from './ui/Card'

const COLORS = [1, 2, 3, 4, 5].map((n) => `rgb(var(--chart-${n}))`)

export default function EntityDonutChart({ data }: { data: Record<string, number> }) {
  const { rows, total } = useMemo(() => {
    const all = Object.entries(data).filter(([, v]) => v > 0).sort(([, a], [, b]) => b - a)
    const top = all.slice(0, 4).map(([name, value]) => ({ name: name.replace(/_/g, ' '), value }))
    const other = all.slice(4).reduce((a, [, v]) => a + v, 0)
    const rows = other > 0 ? [...top, { name: 'Other', value: other }] : top
    return { rows, total: rows.reduce((a, r) => a + r.value, 0) }
  }, [data])

  return (
    <Card className="flex h-full flex-col p-5" id="entity-donut">
      <h2 className="text-base font-semibold text-fg">Detection mix</h2>
      <p className="text-xs text-muted">What the detectors found, all time</p>
      <div className="mt-3 flex flex-1 items-center gap-5">
        <div className="relative h-[140px] w-[140px] shrink-0">
          {rows.length === 0 ? (
            <div className="flex h-full w-full items-center justify-center rounded-full border border-line text-xs text-muted">No data</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={rows} cx="50%" cy="50%" innerRadius={46} outerRadius={64} paddingAngle={3} dataKey="value" stroke="none" isAnimationActive animationDuration={900}>
                    {rows.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--line))', borderRadius: 12, fontSize: 12, color: 'rgb(var(--fg))' }}
                    labelStyle={{ color: 'rgb(var(--muted))' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-semibold tabular-nums text-fg">{total}</span>
                <span className="text-[11px] text-muted">entities</span>
              </div>
            </>
          )}
        </div>
        <ul className="min-w-0 flex-1 space-y-2">
          {rows.map((r, i) => (
            <li key={r.name} className="flex items-center gap-2 text-xs">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
              <span className="flex-1 truncate text-muted">{r.name}</span>
              <span className="font-medium tabular-nums text-fg">{total > 0 ? Math.round((r.value / total) * 100) : 0}%</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  )
}
