import { Link } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'

const COLORS = ['#4F46E5', '#F59E0B', '#10B981', '#EC4899', '#94A3B8']

interface EntityDonutChartProps {
  data: Record<string, number>
}

export default function EntityDonutChart({ data }: EntityDonutChartProps) {
  const [animate, setAnimate] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setAnimate(false), 1200)
    return () => clearTimeout(timer)
  }, [])

  const { chartData, total, topShare } = useMemo(() => {
    const entries = Object.entries(data)
      .filter(([, v]) => v > 0)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 4)
    const otherSum = Object.entries(data)
      .filter(([, v]) => v > 0)
      .sort(([, a], [, b]) => b - a)
      .slice(4)
      .reduce((acc, [, v]) => acc + v, 0)

    const rows = [
      ...entries.map(([name, value]) => ({ name: name.replace(/_/g, ' '), value })),
      ...(otherSum > 0 ? [{ name: 'Other', value: otherSum }] : []),
    ]
    const sum = rows.reduce((a, d) => a + d.value, 0)
    const share = sum > 0 ? Math.round((rows[0]?.value || 0) / sum * 100) : 0

    return { chartData: rows, total: sum, topShare: share }
  }, [data])

  return (
    <div className="rounded-2xl border border-line bg-surface shadow-card p-5 h-full flex flex-col" id="entity-donut">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="panel-title mb-1">Detection mix</div>
          <div className="flex items-baseline gap-1.5 mt-2">
            <span className="text-2xl font-bold text-text tabular-nums">
              {total > 0 ? `${topShare}%` : '—'}
            </span>
            <span className="text-xs text-text-dim">top entity share</span>
          </div>
        </div>
        <Link to="/compliance" className="text-xs font-medium text-accent hover:underline">
          View more
        </Link>
      </div>

      <div className="flex-1 flex items-center gap-4 min-h-[160px]">
        <div className="w-[130px] h-[130px] shrink-0">
          {chartData.length === 0 ? (
            <div className="w-full h-full rounded-full border border-line flex items-center justify-center text-xs text-text-dim">
              No data
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={44}
                  outerRadius={58}
                  paddingAngle={3}
                  dataKey="value"
                  stroke="none"
                  isAnimationActive={animate}
                  animationDuration={animate ? 900 : 0}
                >
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  animationDuration={200}
                  contentStyle={{
                    background: 'rgb(var(--surface))',
                    border: '1px solid rgb(var(--line))',
                    borderRadius: 12,
                    fontSize: 11,
                    color: 'rgb(var(--fg))',
                    boxShadow: '0 12px 32px rgb(16 24 40 / 0.12)',
                  }}
                  labelStyle={{ color: 'rgb(var(--muted))' }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="flex-1 space-y-2 min-w-0">
          {chartData.slice(0, 3).map((row, i) => (
            <div key={row.name} className="flex items-center gap-2 text-[11px]">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: COLORS[i % COLORS.length] }}
              />
              <span className="text-text-dim truncate flex-1">{row.name}</span>
              <span className="font-mono font-bold text-text tabular-nums">
                {total > 0 ? Math.round((row.value / total) * 100) : 0}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
