import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import CountUp from './CountUp'
import Skeleton from './Skeleton'

export type Aurora = 'blue' | 'red' | 'peach' | 'mint'

const blobs: Record<Aurora, [string, string, string]> = {
  blue: ['#93C5FD', '#C4B5FD', '#F9A8D4'],
  red: ['#FCA5A5', '#F9A8D4', '#FDBA74'],
  peach: ['#FDBA74', '#FDE68A', '#F9A8D4'],
  mint: ['#6EE7B7', '#93C5FD', '#FDE68A'],
}

interface Props {
  label: string
  value: number | null
  icon: ReactNode
  aurora: Aurora
  to?: string
  loading?: boolean
  error?: boolean
}

export default function StatCard({ label, value, icon, aurora, to, loading, error }: Props) {
  const [a, b, c] = blobs[aurora]
  const body = (
    <>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-50" style={{ filter: 'blur(36px)' }}>
        <div className="absolute -left-8 -top-10 h-40 w-40 animate-drift1 rounded-full" style={{ background: a }} />
        <div className="absolute -right-10 top-6 h-40 w-40 animate-drift2 rounded-full" style={{ background: b }} />
        <div className="absolute -bottom-14 left-1/3 h-36 w-36 animate-drift1 rounded-full" style={{ background: c }} />
      </div>
      <div className="relative">
        <span className="mb-6 inline-flex h-9 w-9 items-center justify-center rounded-full bg-surface/80 text-fg shadow-card backdrop-blur">
          {icon}
        </span>
        <div className="text-3xl font-semibold tabular-nums tracking-tight text-fg">
          {error ? '—' : loading || value === null ? <Skeleton className="h-9 w-24" /> : <CountUp value={value} />}
        </div>
        <div className="mt-1 text-sm text-muted">{label}</div>
      </div>
    </>
  )
  const cls = 'relative block overflow-hidden rounded-2xl border border-line bg-surface p-5 shadow-card'
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
