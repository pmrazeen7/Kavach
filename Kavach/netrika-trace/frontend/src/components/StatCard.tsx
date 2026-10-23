interface StatCardProps {
  label: string
  value: number | string
  variant: 'blue' | 'red' | 'amber' | 'green'
  subtext?: string
}

const variantStyles = {
  blue: { text: 'text-blue', glow: 'from-blue/20 to-transparent' },
  red: { text: 'text-red', glow: 'from-red/20 to-transparent' },
  amber: { text: 'text-amber', glow: 'from-amber/20 to-transparent' },
  green: { text: 'text-green', glow: 'from-green/20 to-transparent' },
}

export default function StatCard({ label, value, variant, subtext }: StatCardProps) {
  const style = variantStyles[variant]

  return (
    <div
      className="glass-card p-6 relative overflow-hidden group hover:border-line transition-all duration-300"
      id={`stat-${variant}`}
    >
      <div
        className={`absolute -right-6 -top-6 w-28 h-28 rounded-full bg-gradient-to-br ${style.glow} blur-2xl opacity-60 group-hover:opacity-90 transition-opacity duration-500`}
      />
      <div className="label-uppercase mb-3 relative z-10">{label}</div>
      <div className={`font-sans font-bold text-4xl ${style.text} relative z-10 tabular-nums`}>{value}</div>
      {subtext && <div className="text-xs text-text-dim mt-2 font-medium relative z-10">{subtext}</div>}
    </div>
  )
}
