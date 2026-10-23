import { useState, useEffect, useCallback, useRef } from 'react'
import PolicyToggle from '../components/PolicyToggle'
import type { PolicyConfig } from '../types/incident'
import { apiFetch } from '../lib/api'

export default function Policy() {
  const [config, setConfig] = useState<PolicyConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saveToast, setSaveToast] = useState(false)
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
        setSaveToast(true)
        setTimeout(() => setSaveToast(false), 3000)
      }).catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Unable to save policy')
      })
    }, 500)
  }, [config])

  return (
    <div className="space-y-8" id="policy-page">
      <h1 className="font-display font-bold text-2xl text-text tracking-wider">
        POLICY CONFIGURATION
      </h1>

      {error && <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">{error}</p>}
      {loading || !config ? (
        !error && <div className="h-48 rounded-2xl bg-white/[0.05] animate-pulse" aria-label="Loading policy" />
      ) : (
      <div className="grid grid-cols-2 gap-8">
        {/* Thresholds */}
        <div className="bg-bg2 border border-border rounded p-6">
          <div className="panel-title mb-6">THRESHOLD SETTINGS</div>

          <div className="mb-6">
            <div className="flex justify-between mb-2">
              <span className="label-uppercase">BLOCK THRESHOLD</span>
              <span className="font-display font-bold text-lg text-red">{config.block_threshold}</span>
            </div>
            <input
              type="range"
              min={50}
              max={100}
              value={config.block_threshold}
              onChange={e => savePolicy({ block_threshold: Number(e.target.value) })}
              className="w-full h-1 appearance-none bg-bg3 rounded outline-none accent-red"
            />
          </div>

          <div>
            <div className="flex justify-between mb-2">
              <span className="label-uppercase">WARN THRESHOLD</span>
              <span className="font-display font-bold text-lg text-amber">{config.warn_threshold}</span>
            </div>
            <input
              type="range"
              min={10}
              max={69}
              value={Math.min(config.warn_threshold, 69)}
              onChange={e => savePolicy({ warn_threshold: Number(e.target.value) })}
              className="w-full h-1 appearance-none bg-bg3 rounded outline-none accent-amber"
            />
          </div>
        </div>

        {/* Feature Toggles */}
        <div className="bg-bg2 border border-border rounded p-6">
          <div className="panel-title mb-6">FEATURE TOGGLES</div>
          <PolicyToggle
            label="💻 Source Code Detection"
            checked={config.enable_code}
            onChange={v => savePolicy({ enable_code: v })}
          />
          <PolicyToggle
            label="🔑 Secrets Scanner (API keys, JWTs)"
            checked={config.enable_secrets}
            onChange={v => savePolicy({ enable_secrets: v })}
          />
          <PolicyToggle
            label="PII detection"
            checked={config.enable_pii}
            onChange={v => savePolicy({ enable_pii: v })}
          />
          <PolicyToggle
            label="Semantic analysis"
            checked={config.enable_semantic}
            onChange={v => savePolicy({ enable_semantic: v })}
          />
          <PolicyToggle
            label="Local LLM simulation"
            checked={config.enable_local_llm}
            onChange={v => savePolicy({ enable_local_llm: v })}
          />
        </div>
      </div>
      )}

      {/* Save Toast */}
      {saveToast && (
        <div className="fixed bottom-6 right-6 bg-bg2 border border-green text-green px-6 py-3 rounded text-sm font-mono shadow-lg z-50">
          ✓ Policy updated
        </div>
      )}
    </div>
  )
}
