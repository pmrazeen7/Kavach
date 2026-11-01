import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import Aurora, { type AuroraTone } from './Aurora'
import CountUp from './CountUp'
import Skeleton from './Skeleton'
import Sparkline from './Sparkline'

export type Aurora4 = AuroraTone

interface Props {
  label: string
  value: number | null
  icon: ReactNode
  aurora: AuroraTone
  to?: string
  loading?: boolean
  error?: boolean
  spark?: number[]
}

export default function StatCard({ label, value, icon, aurora, to, loading, error, spark }: Props) {
  const body = (
    <>
      <Aurora tone={aurora} />
      <div className="relative">
        <div className="mb-5 flex items-start justify-between">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-surface/80 text-fg shadow-card backdrop-blur">
            {icon}
          </span>
          {spark && !loading && !error && <Sparkline values={spark} />}
        </div>
        <div className="text-3xl font-semibold tabular-nums tracking-tight text-fg">
          {error ? '—' : loading || value === null ? <Skeleton className="h-9 w-24" /> : <CountUp value={value} />}
        </div>
        <div className="mt-1 text-sm text-muted">{label}</div>
      </div>
    </>
  )
  const cls = 'relative block overflow-hidden rounded-3xl border border-line bg-surface p-5 shadow-card'
  return (
    <motion.div whileHover={{ y: -4 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}>
      {to ? (
        <Link to={to} className={cls}>
          {body}
        </Link>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </motion.div>
  )
}
