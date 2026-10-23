import { useEffect, useMemo, useState } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'

const COLORS = ['#6b9b7a', '#f97316', '#e8c547', '#6366f1', '#94a3b8']

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
    <div className="glass-card p-5 h-full flex flex-col" id="entity-donut">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="panel-title mb-1">DETECTION MIX</div>
          <div className="flex items-baseline gap-1.5 mt-2">
            <span className="text-2xl font-bold text-text tabular-nums">
              {total > 0 ? `${topShare}%` : '—'}
            </span>
            <span className="text-xs text-text-dim">top entity share</span>
          </div>
        </div>
        <button
          type="button"
          className="text-[11px] font-semibold text-grapho-orange hover:text-orange-400 transition-colors duration-300"
        >
          View more
        </button>
      </div>

      <div className="flex-1 flex items-center gap-4 min-h-[160px]">
        <div className="w-[130px] h-[130px] shrink-0">
          {chartData.length === 0 ? (
            <div className="w-full h-full rounded-full border border-white/[0.08] flex items-center justify-center text-xs text-text-dim">
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
                    background: 'rgba(22,24,30,0.95)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 12,
                    fontSize: 11,
                    color: '#f0f2f7',
                    boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
                  }}
                  labelStyle={{ color: '#8b90a0' }}
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
