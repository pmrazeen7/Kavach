import { lazy, Suspense, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useIncidents, useStats, useEndpointStats } from '../hooks/useIncidents'
import EndpointHealthGrid from '../components/EndpointHealthGrid'
import LiveTicker from '../components/LiveTicker'
import { ArrowUpRight, Shield, Activity, TrendingUp, Zap } from 'lucide-react'

const HourlyBarChart = lazy(() => import('../components/HourlyBarChart'))
const EntityDonutChart = lazy(() => import('../components/EntityDonutChart'))

const stagger = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.07, delayChildren: 0.06 },
  },
}

const fadeUp = {
  hidden: { opacity: 0, y: 22 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const },
  },
}

function ChartFallback({ className }: { className?: string }) {
  return <div className={`glass-card animate-pulse ${className ?? ''}`} />
}

export default function WarRoom() {
  const [window, setWindow] = useState<'1h' | '24h' | '7d' | '30d'>('24h')
  const { data: incidents = [], isLoading: incidentsLoading, isError: incidentsError } = useIncidents(50)
  const { data: statsData, isLoading: statsLoading, isError: statsError } = useStats(window)
  const { data: endpointStats = [], isError: endpointsError } = useEndpointStats()

  const stats = statsData?.stats || { total: 0, blocked: 0, warned: 0, allowed: 0 }
  const hourly = statsData?.hourly || []
  const entityBreakdown = statsData?.entity_breakdown || {}

  const metricTiles = useMemo(
    () => [
      { label: 'Total requests', value: statsError ? '—' : statsLoading ? '…' : stats.total.toLocaleString(), icon: Zap, accent: 'text-grapho-orange', decision: '' },
      { label: 'Blocked', value: statsError ? '—' : statsLoading ? '…' : stats.blocked.toLocaleString(), icon: Shield, accent: 'text-red', decision: 'BLOCK' },
      { label: 'Warnings', value: statsError ? '—' : statsLoading ? '…' : stats.warned.toLocaleString(), icon: TrendingUp, accent: 'text-amber', decision: 'WARN' },
      { label: 'Allowed', value: statsError ? '—' : statsLoading ? '…' : stats.allowed.toLocaleString(), icon: Activity, accent: 'text-green', decision: 'ALLOW' },
    ],
    [stats.total, stats.blocked, stats.warned, stats.allowed, statsLoading, statsError]
  )

  return (
    <motion.div
      className="flex flex-col w-full min-h-full pb-2"
      id="war-room-page"
      variants={stagger}
      initial="hidden"
      animate="show"
    >
      <motion.div variants={fadeUp} className="flex items-end justify-between mb-6 shrink-0 gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-text">Traffic report</h1>
          <p className="text-sm text-text-dim mt-1">Traffic and request totals use the selected UTC window; detection and endpoint breakdowns are all-time</p>
        </div>
      </motion.div>

      <motion.div
        variants={fadeUp}
        className="grid grid-cols-1 xl:grid-cols-12 gap-4 mb-4 shrink-0"
      >
        <div className="xl:col-span-8 min-h-[220px]">
          {statsError ? (
            <div role="alert" className="glass-card p-5 text-sm text-danger-fg">Analytics are unavailable. Retry the page to load traffic.</div>
          ) : statsLoading ? (
            <ChartFallback className="min-h-[220px]" />
          ) : (
            <Suspense fallback={<ChartFallback className="min-h-[220px]" />}>
              <HourlyBarChart data={hourly} window={window} onWindowChange={setWindow} />
            </Suspense>
          )}
        </div>

        <div className="xl:col-span-4 min-h-[200px]">
          {statsError ? (
            <div role="alert" className="glass-card p-5 text-sm text-danger-fg">Detection breakdown unavailable.</div>
          ) : statsLoading ? (
            <ChartFallback className="min-h-[200px]" />
          ) : (
            <Suspense fallback={<ChartFallback className="min-h-[200px]" />}>
              <EntityDonutChart data={entityBreakdown} />
            </Suspense>
          )}
        </div>
      </motion.div>

      <motion.div variants={fadeUp} className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-4 shrink-0">
        <div className="lg:col-span-5 grid grid-cols-2 gap-3">
          {metricTiles.map((tile) => (
            <Link
              key={tile.label}
              to={tile.decision ? `/search?decision=${tile.decision}` : '/search'}
              className="glass-card p-4 relative overflow-hidden cursor-default group transition-transform duration-200 hover:-translate-y-1 hover:shadow-[0_20px_50px_rgba(0,0,0,0.45)]"
            >
              <div className="absolute -right-2 -top-2 w-16 h-16 rounded-full bg-grapho-orange/5 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="flex justify-between items-start mb-2">
                <tile.icon className={`w-4 h-4 ${tile.accent}`} strokeWidth={2} />
                <ArrowUpRight className="w-3.5 h-3.5 text-text-dim opacity-30 group-hover:opacity-60 transition-opacity" aria-hidden="true" />
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-text-dim mb-1">{tile.label}</div>
              <div className={`text-2xl font-bold tabular-nums ${tile.accent}`}>{tile.value}</div>
            </Link>
          ))}
        </div>

        <div className="lg:col-span-7 min-h-[200px]">
          {statsError ? (
            <div role="alert" className="glass-card p-5 text-sm text-danger-fg">Request totals are unavailable.</div>
          ) : statsLoading ? (
            <div className="glass-card p-5 min-h-[200px] animate-pulse" aria-label="Loading request totals" />
          ) : (
            <div className="glass-card h-full p-5 flex flex-col justify-center">
              <p className="text-sm font-semibold text-text">Request decisions in selected period</p>
              <p className="mt-2 text-sm text-text-dim">
                Counts are based on persisted incidents in the selected time range. Evaluation metrics are available on the Model Evaluation page.
              </p>
              <Link to="/evaluation" className="mt-4 w-fit text-sm font-semibold text-grapho-orange hover:underline">
                View model evaluations
              </Link>
            </div>
          )}
        </div>
      </motion.div>

      <motion.div variants={fadeUp} className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-2 shrink-0">
        {endpointsError ? (
          <div role="alert" className="glass-card p-5 text-sm text-danger-fg">Endpoint traffic is unavailable.</div>
        ) : (
          <EndpointHealthGrid data={endpointStats} />
        )}
        {incidentsError ? (
          <div role="alert" className="glass-card p-5 text-sm text-danger-fg">Recent request activity is unavailable.</div>
        ) : incidentsLoading ? (
          <div className="glass-card p-5 min-h-[150px] animate-pulse" aria-label="Loading recent activity" />
        ) : (
          <LiveTicker incidents={incidents} />
        )}
      </motion.div>
    </motion.div>
  )
}
