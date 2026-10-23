import { useEffect, useState } from 'react'

interface RiskGaugeProps {
  score: number
  size?: number
}

export default function RiskGauge({ score, size = 90 }: RiskGaugeProps) {
  const radius = 40
  const circumference = 2 * Math.PI * radius
  const [offset, setOffset] = useState(circumference)
  const targetOffset = circumference * (1 - score / 100)

  const color = score >= 70 ? '#EF4444' : score >= 30 ? '#F97316' : '#10B981'

  useEffect(() => {
    const timer = setTimeout(() => setOffset(targetOffset), 100)
    return () => clearTimeout(timer)
  }, [targetOffset])

  return (
    <div className="relative inline-block" style={{ width: size, height: size }} id="risk-gauge" role="img" aria-label={`Risk score ${score} out of 100`}>
      <svg width={size} height={size} viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="50" cy="50" r={radius} fill="none" stroke="rgb(var(--line))" strokeWidth="7" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-semibold tabular-nums leading-none" style={{ color }}>{score}</span>
        <span className="mt-1 text-[11px] font-medium text-muted">Risk</span>
      </div>
    </div>
  )
}
