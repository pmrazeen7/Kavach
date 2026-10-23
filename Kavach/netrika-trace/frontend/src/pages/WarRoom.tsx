import { lazy, Suspense, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Activity, ArrowRight, ShieldAlert, ShieldCheck, TriangleAlert, X } from 'lucide-react'
import { useIncidents, useStats, useEndpointStats } from '../hooks/useIncidents'
import EndpointHealthGrid from '../components/EndpointHealthGrid'
import LiveTicker from '../components/LiveTicker'
import IncidentTable from '../components/IncidentTable'
import PageHeader from '../components/ui/PageHeader'
import StatCard from '../components/ui/StatCard'
import Card from '../components/ui/Card'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import Mascot from '../components/ui/Mascot'
import Button from '../components/ui/Button'
import { getUser } from '../components/layout/nav'

const HourlyBarChart = lazy(() => import('../components/HourlyBarChart'))
const EntityDonutChart = lazy(() => import('../components/EntityDonutChart'))

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
}
const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const } },
}

function ChartFallback({ className }: { className?: string }) {
  return <Skeleton className={`rounded-2xl ${className ?? ''}`} />
}

function readDismissed() {
  try {
    return localStorage.getItem('netrika_welcome') === '1'
  } catch {
    return false
  }
}

export default function WarRoom() {
  const [window, setWindow] = useState<'1h' | '24h' | '7d' | '30d'>('24h')
  const [welcomeHidden, setWelcomeHidden] = useState(readDismissed)
  const { data: incidents = [], isLoading: incidentsLoading, isError: incidentsError } = useIncidents(50)
  const { data: statsData, isLoading: statsLoading, isError: statsError } = useStats(window)
  const { data: endpointStats = [], isError: endpointsError } = useEndpointStats()

  const stats = statsData?.stats || { total: 0, blocked: 0, warned: 0, allowed: 0 }
  const hourly = statsData?.hourly || []
  const entityBreakdown = statsData?.entity_breakdown || {}
  const user = getUser()
  const firstName = (user.name || user.email || '').split(/[@\s]/)[0]

  const dismissWelcome = () => {
    setWelcomeHidden(true)
    try { localStorage.setItem('netrika_welcome', '1') } catch { /* ignore */ }
  }

  const kpi = { loading: statsLoading, error: statsError }

  return (
    <motion.div className="flex w-full flex-col" id="war-room-page" variants={stagger} initial="hidden" animate="show">
      <motion.div variants={fadeUp}>
        <PageHeader
          title="Traffic report"
          subtitle="Request totals use the selected UTC window; detection and endpoint breakdowns are all-time."
          action={
            <Link to="/evaluation">
              <Button><Activity className="h-4 w-4" /> Model evaluation</Button>
            </Link>
          }
        />
      </motion.div>

      {!welcomeHidden && (
        <motion.div variants={fadeUp} className="relative mb-4 flex items-center gap-5 overflow-hidden rounded-2xl border border-line bg-accent-soft/60 p-4 pr-12">
          <Mascot pose="wave" size={84} />
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-fg">Welcome{firstName ? `, ${firstName}` : ''}! I&apos;m Kavi.</h2>
            <p className="mt-1 text-sm text-muted">
              I watch every AI prompt that leaves your network. Press <kbd className="rounded border border-line bg-surface px-1 text-xs">Ctrl K</kbd> to jump anywhere.
            </p>
          </div>
          <button type="button" aria-label="Dismiss welcome message" onClick={dismissWelcome} className="absolute right-3 top-3 rounded-lg p-1 text-muted hover:bg-surface hover:text-fg">
            <X className="h-4 w-4" />
          </button>
        </motion.div>
      )}

      <motion.div variants={fadeUp} className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total requests" aurora="blue" icon={<Activity className="h-4 w-4" />} value={stats.total} to="/search" {...kpi} />
        <StatCard label="Blocked" aurora="red" icon={<ShieldAlert className="h-4 w-4" />} value={stats.blocked} to="/search?decision=BLOCK" {...kpi} />
        <StatCard label="Warned" aurora="peach" icon={<TriangleAlert className="h-4 w-4" />} value={stats.warned} to="/search?decision=WARN" {...kpi} />
        <StatCard label="Allowed" aurora="mint" icon={<ShieldCheck className="h-4 w-4" />} value={stats.allowed} to="/search?decision=ALLOW" {...kpi} />
      </motion.div>

      <motion.div variants={fadeUp} className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="min-h-[260px] xl:col-span-8">
          {statsError ? (
            <Card className="h-full"><EmptyState kind="error" title="Analytics are unavailable" description="Reload the page to try again." /></Card>
          ) : statsLoading ? (
            <ChartFallback className="h-full min-h-[260px]" />
          ) : (
            <Suspense fallback={<ChartFallback className="h-full min-h-[260px]" />}>
              <HourlyBarChart data={hourly} window={window} onWindowChange={setWindow} />
            </Suspense>
          )}
        </div>
        <div className="min-h-[220px] xl:col-span-4">
          {statsError ? (
            <Card className="h-full"><EmptyState kind="error" title="Detection mix unavailable" /></Card>
          ) : statsLoading ? (
            <ChartFallback className="h-full min-h-[220px]" />
          ) : (
            <Suspense fallback={<ChartFallback className="h-full min-h-[220px]" />}>
              <EntityDonutChart data={entityBreakdown} />
            </Suspense>
          )}
        </div>
      </motion.div>

      <motion.div variants={fadeUp} className="mb-4">
        {incidentsError ? (
          <Card><EmptyState kind="error" title="Recent activity is unavailable" /></Card>
        ) : (
          <IncidentTable
            title="Recent incidents"
            incidents={incidents}
            loading={incidentsLoading}
            pageSize={5}
            selectable={false}
            toolbar={
              <Link to="/incidents" className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
                View all <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            }
          />
        )}
      </motion.div>

      <motion.div variants={fadeUp} className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {endpointsError ? (
          <Card><EmptyState kind="error" title="Endpoint traffic is unavailable" /></Card>
        ) : (
          <EndpointHealthGrid data={endpointStats} />
        )}
        {incidentsError ? null : incidentsLoading ? <ChartFallback className="min-h-[150px]" /> : <LiveTicker incidents={incidents} />}
      </motion.div>
    </motion.div>
  )
}
