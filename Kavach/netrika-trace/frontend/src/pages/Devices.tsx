import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Laptop, ShieldCheck, RefreshCw } from 'lucide-react'
import { apiFetch } from '../lib/api'
import PageHeader from '../components/ui/PageHeader'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'

interface Device {
  id: string
  device_uuid: string
  user_id: string
  os: string
  browser: string
  ext_version: string
  last_seen: string
}

export default function Devices() {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchDevices = async () => {
    setLoading(true)
    setError('')
    try {
      setDevices(await apiFetch<Device[]>('/api/v1/auth/devices'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load registered devices')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchDevices()
  }, [])

  return (
    <div className="space-y-5">
      <PageHeader
        title="Registered devices"
        subtitle="Active endpoint browser extension installations across the organization"
        action={
          <Button onClick={() => void fetchDevices()}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        }
      />

      {error && (
        <Card>
          <EmptyState kind="error" title="Unable to load devices" description={error} action={<Button variant="primary" onClick={() => void fetchDevices()}>Retry</Button>} />
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {loading && devices.length === 0 && Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        {devices.map((dev, i) => (
          <motion.div key={dev.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.04 }}>
            <Card className="flex items-start gap-4 p-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-fg">
                <Laptop className="h-6 w-6" />
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
      {!loading && !error && devices.length === 0 && (
        <Card>
          <EmptyState title="No registered devices" description="Install the browser extension to see devices here." mascot="wave" />
        </Card>
      )}
    </div>
  )
}
