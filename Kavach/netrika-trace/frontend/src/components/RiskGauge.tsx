import { useEffect, useState } from 'react'

interface RiskGaugeProps {
  score: number
  size?: number
}

export default function RiskGauge({ score, size = 90 }: RiskGaugeProps) {
  const [offset, setOffset] = useState(251.3)

  const radius = 40
  const circumference = 2 * Math.PI * radius
  const targetOffset = circumference * (1 - score / 100)

  const color = score >= 70 ? '#ff2d55' : score >= 30 ? '#ffb020' : '#00e87a'

  useEffect(() => {
    const timer = setTimeout(() => setOffset(targetOffset), 100)
    return () => clearTimeout(timer)
  }, [targetOffset])

  return (
    <div className="relative inline-block" style={{ width: size, height: size }} id="risk-gauge">
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        style={{ transform: 'rotate(-90deg)' }}
      >
        <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="6" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transition: 'stroke-dashoffset 1.5s ease-in-out',
            filter: `drop-shadow(0 0 6px ${color}40)`,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display font-bold text-2xl" style={{ color, lineHeight: 1 }}>
          {score}
        </span>
        <span className="label-uppercase text-[7px] mt-0.5">RISK</span>
      </div>
    </div>
  )
}
