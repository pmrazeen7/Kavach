import { motion } from 'framer-motion'
import { Laptop, RefreshCw, ShieldCheck } from 'lucide-react'
import { useDevices } from '../hooks/useWorkspace'
import PageHeader from '../components/ui/PageHeader'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'

export default function Devices() {
  const { data: devices = [], isLoading, isError, error, refetch, isFetching } = useDevices()

  return (
    <div className="space-y-5">
      <PageHeader
        title="Devices"
        subtitle="Browser extension installations reporting in across the organization."
        action={
          <Button onClick={() => void refetch()}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        }
      />

      {isError && (
        <Card>
          <EmptyState kind="error" title="Unable to load devices" description={error instanceof Error ? error.message : undefined} action={<Button variant="primary" onClick={() => void refetch()}>Retry</Button>} />
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {isLoading && Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-3xl" />)}
        {devices.map((dev, i) => (
          <motion.div key={dev.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.04 }}>
            <Card className="flex items-start gap-4 rounded-3xl p-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent-fg">
                <Laptop className="h-6 w-6" strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-fg">{dev.device_uuid}</span>
                  <Badge tone="success"><ShieldCheck className="h-3 w-3" /> Active</Badge>
                </div>
                <p className="text-xs text-muted">User ID: {dev.user_id}</p>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Badge>OS: {dev.os}</Badge>
                  <Badge>Browser: {dev.browser}</Badge>
                  <Badge>Extension: {dev.ext_version}</Badge>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>
      {!isLoading && !isError && devices.length === 0 && (
        <Card>
          <EmptyState title="No registered devices" description="Install the browser extension and sign in from its popup to see devices here." mascot="wave" />
        </Card>
      )}
    </div>
  )
}
