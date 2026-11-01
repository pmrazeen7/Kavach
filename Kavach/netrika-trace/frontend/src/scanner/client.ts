/** Main-thread client for the scanner: a worker for local scans, the API for the authoritative scan. */

import { apiFetch } from '../lib/api'
import type { WorkerRequest, WorkerResponse } from './worker'
import type { Finding, Policy, ScanOptions, ScanResult, ScannerSettings } from './types'

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, { resolve: (r: ScanResult) => void; reject: (e: Error) => void }>()

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const p = pending.get(e.data.id)
      if (!p) return
      pending.delete(e.data.id)
      if ('error' in e.data) p.reject(new Error(e.data.error))
      else p.resolve(e.data.result)
    }
  }
  return worker
}

/** Fast local scan (layers 0-3, 5), off the main thread. */
export function scanLocal(text: string, opts: ScanOptions = {}): Promise<ScanResult> {
  return new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    getWorker().postMessage({ id, text, opts } satisfies WorkerRequest)
  })
}

interface ServerFinding {
  layer: number
  type: string
  label: string
  category: Finding['category']
  start: number
  end: number
  confidence: number
  reasons: string[]
  view: string
  allowlistable: boolean
  fp: string
  masked: string
  action: Finding['action']
  needs_confirmation: boolean
  spans_messages: boolean
}
interface ServerResult {
  findings: ServerFinding[]
  score: number
  action: ScanResult['action']
  policy: Policy
  needs_confirmation: boolean
  elapsed_ms: number
  truncated: boolean
  layers: Record<string, number>
}

/** The server counts code points (Python); a textarea counts UTF-16 units. They differ only around emoji. */
function toUtf16(text: string, findings: Finding[]): Finding[] {
  if (!/[\ud800-\udbff]/.test(text)) return findings
  const map: number[] = []
  for (let i = 0; i < text.length; ) {
    map.push(i)
    i += text.codePointAt(i)! > 0xffff ? 2 : 1
  }
  map.push(text.length)
  return findings.map((f) => ({ ...f, start: map[Math.min(f.start, map.length - 1)], end: map[Math.min(f.end, map.length - 1)] }))
}

function fromServer(r: ServerResult, text: string): ScanResult {
  return {
    findings: toUtf16(text, r.findings.map((f) => ({
      layer: f.layer, type: f.type, label: f.label, category: f.category, start: f.start, end: f.end, confidence: f.confidence,
      reasons: f.reasons, view: f.view, allowlistable: f.allowlistable, fp: f.fp, masked: f.masked, action: f.action,
      needsConfirmation: f.needs_confirmation, spansMessages: f.spans_messages, source: 'server' as const,
    }))),
    score: r.score,
    action: r.action,
    policy: r.policy,
    needsConfirmation: r.needs_confirmation,
    elapsedMs: r.elapsed_ms,
    truncated: r.truncated,
    layers: r.layers,
  }
}

/** Authoritative scan on the server: adds the fingerprint layer and the keyed fingerprints. */
export async function scanServer(text: string, opts: { history?: string[]; confirmed?: string[]; deep?: boolean; signal?: AbortSignal } = {}): Promise<ScanResult> {
  const data = await apiFetch<ServerResult>('/api/v1/scanner/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, history: opts.history ?? [], confirmed: opts.confirmed ?? [], deep: opts.deep ?? false }),
    signal: opts.signal,
  })
  return fromServer(data, text)
}

export const fetchSettings = () => apiFetch<ScannerSettings & { fingerprint_count: number; source_root: string }>('/api/v1/scanner/settings')

export const saveSettings = (patch: Partial<ScannerSettings>) =>
  apiFetch<ScannerSettings & { fingerprint_count: number; source_root: string }>('/api/v1/scanner/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })

export const markSafe = (fp: string) =>
  apiFetch<{ allowlisted: boolean; count: number }>('/api/v1/scanner/allow', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fp }) })

export const removeAllowed = (fp: string) => apiFetch<{ count: number }>(`/api/v1/scanner/allow/${fp}`, { method: 'DELETE' })

export const ingestFingerprints = (paths: string[]) =>
  apiFetch<{ files: number; fingerprints: number; errors: string[]; rejected_outside_root: number; total: number }>('/api/v1/scanner/fingerprints/ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths }),
  })

export const addCanary = (label: string) =>
  apiFetch<{ label: string; total: number; value?: string }>('/api/v1/scanner/canaries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label }) })
