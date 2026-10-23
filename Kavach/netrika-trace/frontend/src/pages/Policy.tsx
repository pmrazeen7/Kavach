import { useState, useEffect, useCallback, useRef } from 'react'
import PolicyToggle from '../components/PolicyToggle'
import PageHeader from '../components/ui/PageHeader'
import Card from '../components/ui/Card'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import { toast } from '../components/ui/Toast'
import type { PolicyConfig } from '../types/incident'
import { apiFetch } from '../lib/api'

export default function Policy() {
  const [config, setConfig] = useState<PolicyConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    apiFetch<PolicyConfig>('/api/v1/policies', { signal: controller.signal })
      .then(setConfig)
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Unable to load policy')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [])

  useEffect(() => () => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
  }, [])

  const savePolicy = useCallback((updates: Partial<PolicyConfig>) => {
    if (!config) return
    setError('')
    setConfig({ ...config, ...updates })
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      apiFetch('/api/v1/policies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      }).then(() => {
        toast.success('Policy updated')
      }).catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Unable to save policy')
        toast.error('Unable to save policy')
      })
    }, 500)
  }, [config])

  return (
    <div id="policy-page">
      <PageHeader title="Policy configuration" subtitle="Tune detection thresholds and choose which detectors run on every request." />

      {error && !config ? (
        <Card><EmptyState kind="error" title="Unable to load policy" description={error} /></Card>
      ) : loading || !config ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2"><Skeleton className="h-56 rounded-2xl" /><Skeleton className="h-56 rounded-2xl" /></div>
      ) : (
        <>
          {error && <p role="alert" className="mb-4 rounded-xl bg-danger-soft p-3 text-sm text-danger-fg">{error}</p>}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="p-6">
              <h2 className="mb-5 text-base font-semibold text-fg">Threshold settings</h2>

              <div className="mb-6">
                <div className="mb-2 flex items-center justify-between">
                  <label htmlFor="block-threshold" className="text-sm font-medium text-fg">Block threshold</label>
                  <span className="rounded-full bg-danger-soft px-2.5 py-0.5 text-sm font-semibold tabular-nums text-danger-fg">{config.block_threshold}</span>
                </div>
                <input id="block-threshold" type="range" min={50} max={100} value={config.block_threshold} onChange={(e) => savePolicy({ block_threshold: Number(e.target.value) })} className="w-full accent-[rgb(var(--danger))]" />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label htmlFor="warn-threshold" className="text-sm font-medium text-fg">Warn threshold</label>
                  <span className="rounded-full bg-warn-soft px-2.5 py-0.5 text-sm font-semibold tabular-nums text-warn-fg">{config.warn_threshold}</span>
                </div>
                <input id="warn-threshold" type="range" min={10} max={69} value={Math.min(config.warn_threshold, 69)} onChange={(e) => savePolicy({ warn_threshold: Number(e.target.value) })} className="w-full accent-[rgb(var(--warn))]" />
              </div>
            </Card>

            <Card className="px-6 py-3">
              <h2 className="pb-1 pt-3 text-base font-semibold text-fg">Feature toggles</h2>
              <PolicyToggle label="Source code detection" description="Flags proprietary code in prompts" checked={config.enable_code} onChange={(v) => savePolicy({ enable_code: v })} />
              <PolicyToggle label="Secrets scanner" description="API keys, JWTs and credentials" checked={config.enable_secrets} onChange={(v) => savePolicy({ enable_secrets: v })} />
              <PolicyToggle label="PII detection" description="Aadhaar, PAN, phone and email" checked={config.enable_pii} onChange={(v) => savePolicy({ enable_pii: v })} />
              <PolicyToggle label="Semantic analysis" checked={config.enable_semantic} onChange={(v) => savePolicy({ enable_semantic: v })} />
              <PolicyToggle label="Local LLM simulation" checked={config.enable_local_llm} onChange={(v) => savePolicy({ enable_local_llm: v })} />
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
