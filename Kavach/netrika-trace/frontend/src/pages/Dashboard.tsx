import { lazy, Suspense, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Activity, ArrowRight, FileBarChart2, Search, ShieldAlert, ShieldCheck, SlidersHorizontal, TriangleAlert } from 'lucide-react'
import { useEndpointStats, useIncidents, useStats } from '../hooks/useIncidents'
import { useDevices } from '../hooks/useWorkspace'
import IncidentTable from '../components/IncidentTable'
import InsightsCard from '../components/InsightsCard'
import Aurora from '../components/ui/Aurora'
import Card from '../components/ui/Card'
import Character from '../components/ui/Character'
import EmptyState from '../components/ui/EmptyState'
import Skeleton from '../components/ui/Skeleton'
import StatCard from '../components/ui/StatCard'
import { displayName, getUser, greeting } from '../components/layout/nav'
import { openPalette } from '../lib/palette'
import type { Window } from '../components/DecisionsChart'

const DecisionsChart = lazy(() => import('../components/DecisionsChart'))
const EntityDonutChart = lazy(() => import('../components/EntityDonutChart'))

const stagger = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.07, delayChildren: 0.04 } } }
const fadeUp = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const } } }

function QuickAction({ to, onClick, icon, children }: { to?: string; onClick?: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  const cls = 'inline-flex h-9 items-center gap-2 rounded-xl border border-line bg-surface/80 px-3 text-[13px] font-medium text-fg backdrop-blur transition-colors hover:bg-surface'
  return to ? (
    <Link to={to} className={cls}>{icon}{children}</Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>{icon}{children}</button>
  )
}

export default function Dashboard() {
  const [range, setRange] = useState<Window>('24h')
  const { data: incidents = [], isLoading: incidentsLoading, isError: incidentsError } = useIncidents(50)
  const { data: statsData, isLoading: statsLoading, isError: statsError } = useStats(range)
  const { data: endpointStats = [] } = useEndpointStats()
  const { data: devices } = useDevices()

  const stats = statsData?.stats ?? { total: 0, blocked: 0, warned: 0, allowed: 0 }
  const hourly = useMemo(() => statsData?.hourly ?? [], [statsData])
  const spark = useMemo(
    () => ({
      total: hourly.map((h) => h.BLOCK + h.WARN + h.ALLOW),
      blocked: hourly.map((h) => h.BLOCK),
      warned: hourly.map((h) => h.WARN),
      allowed: hourly.map((h) => h.ALLOW),
    }),
    [hourly],
  )
  const pending = incidents.filter((i) => !i.reviewed && i.decision !== 'ALLOW').length
  const name = displayName(getUser())
  const kpi = { loading: statsLoading, error: statsError }

  return (
    <motion.div className="flex w-full flex-col gap-4" id="dashboard-page" variants={stagger} initial="hidden" animate="show">
      <motion.section variants={fadeUp} className="relative overflow-hidden rounded-3xl border border-line bg-surface p-6 shadow-card">
        <Aurora tone="mix" strong />
        <div className="relative flex flex-wrap items-center gap-6">
          <Character who="kavi" pose="wave" size={104} interactive />
          <div className="min-w-[240px] flex-1">
            <h1 className="text-2xl font-semibold tracking-tight text-fg">{greeting()}{name ? `, ${name}` : ''}</h1>
            <p className="mt-1 text-sm text-muted">
              {pending > 0 ? `${pending} flagged request${pending === 1 ? ' is' : 's are'} waiting for review.` : 'The border is quiet. Nothing is waiting for review.'}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <QuickAction to="/incidents?unreviewed=1" icon={<ShieldAlert className="h-4 w-4" />}>Review pending{pending > 0 ? ` (${pending})` : ''}</QuickAction>
              <QuickAction onClick={openPalette} icon={<Search className="h-4 w-4" />}>Search</QuickAction>
              <QuickAction to="/reports" icon={<FileBarChart2 className="h-4 w-4" />}>Weekly report</QuickAction>
              <QuickAction to="/detection" icon={<SlidersHorizontal className="h-4 w-4" />}>Tune detection</QuickAction>
            </div>
          </div>
        </div>
      </motion.section>

      <motion.div variants={fadeUp} className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total requests" aurora="blue" icon={<Activity className="h-4 w-4" />} value={stats.total} spark={spark.total} to="/incidents" {...kpi} />
        <StatCard label="Blocked" aurora="red" icon={<ShieldAlert className="h-4 w-4" />} value={stats.blocked} spark={spark.blocked} to="/incidents?decision=BLOCK" {...kpi} />
        <StatCard label="Warned" aurora="peach" icon={<TriangleAlert className="h-4 w-4" />} value={stats.warned} spark={spark.warned} to="/incidents?decision=WARN" {...kpi} />
        <StatCard label="Allowed" aurora="mint" icon={<ShieldCheck className="h-4 w-4" />} value={stats.allowed} spark={spark.allowed} to="/incidents?decision=ALLOW" {...kpi} />
      </motion.div>

      <motion.div variants={fadeUp} className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="min-h-[300px] xl:col-span-8">
          {statsError ? (
            <Card className="h-full"><EmptyState kind="error" title="Analytics are unavailable" description="Reload the page to try again." /></Card>
          ) : statsLoading ? (
            <Skeleton className="h-full min-h-[300px] rounded-3xl" />
          ) : (
            <Suspense fallback={<Skeleton className="h-full min-h-[300px] rounded-3xl" />}>
              <DecisionsChart data={hourly} window={range} onWindowChange={setRange} />
            </Suspense>
          )}
        </div>
        <div className="min-h-[240px] xl:col-span-4">
          {statsError ? (
            <Card className="h-full"><EmptyState kind="error" title="Detection mix unavailable" /></Card>
          ) : statsLoading ? (
            <Skeleton className="h-full min-h-[240px] rounded-3xl" />
          ) : (
            <Suspense fallback={<Skeleton className="h-full min-h-[240px] rounded-3xl" />}>
              <EntityDonutChart data={statsData?.entity_breakdown ?? {}} />
            </Suspense>
          )}
        </div>
      </motion.div>

      <motion.div variants={fadeUp} className="grid grid-cols-1 items-start gap-4 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-8">
          {incidentsError ? (
            <Card><EmptyState kind="error" title="Recent activity is unavailable" /></Card>
          ) : (
            <IncidentTable
              title="Recent activity"
              incidents={incidents}
              loading={incidentsLoading}
              pageSize={5}
              toolbar={
                <Link to="/incidents" className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
                  View all <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              }
            />
          )}
        </div>
        <div className="xl:col-span-4">
          <InsightsCard incidents={incidents} endpoints={endpointStats} deviceCount={devices ? devices.length : null} />
        </div>
      </motion.div>
    </motion.div>
  )
}
