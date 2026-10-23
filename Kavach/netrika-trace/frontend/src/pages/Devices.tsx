import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Laptop, ShieldCheck, RefreshCw, Smartphone, Monitor } from 'lucide-react'
import { apiFetch } from '../lib/api'

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
    fetchDevices()
  }, [])

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text">Registered Enterprise Devices</h1>
          <p className="text-sm text-text-dim mt-1">
            Active endpoint browser extension installations across the organization
          </p>
        </div>
        <button
          onClick={fetchDevices}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-text text-sm font-medium transition-all"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">
          <span>{error}</span>
          <button type="button" onClick={() => void fetchDevices()} className="ml-3 underline">Retry</button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {devices.map((dev) => (
          <motion.div
            key={dev.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-5 rounded-2xl bg-grapho-surface/80 border border-white/[0.08] backdrop-blur-xl flex items-start gap-4 shadow-xl"
          >
            <div className="w-12 h-12 rounded-xl bg-grapho-orange/10 border border-grapho-orange/20 flex items-center justify-center text-grapho-orange shrink-0">
              <Laptop className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-text text-sm truncate">{dev.device_uuid}</span>
                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-medium">
                  <ShieldCheck className="w-3 h-3" /> Active
                </span>
              </div>
              <p className="text-xs text-text-dim">User ID: {dev.user_id}</p>
              <div className="pt-2 flex flex-wrap gap-2 text-[11px] text-text-dim">
                <span className="px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06]">
                  OS: {dev.os}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06]">
                  Browser: {dev.browser}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06]">
                  Extension: {dev.ext_version}
                </span>
              </div>
            </div>
          </motion.div>
        ))}
        {!loading && !error && devices.length === 0 && (
          <p className="col-span-full rounded-xl border border-white/[0.06] p-6 text-center text-sm text-text-dim">
            No registered devices found.
          </p>
        )}
      </div>
    </div>
  )
}
