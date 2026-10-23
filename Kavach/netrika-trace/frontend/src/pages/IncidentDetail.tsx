import { useParams, useNavigate } from 'react-router-dom'
import { useIncidentDetail } from '../hooks/useIncidents'
import RiskGauge from '../components/RiskGauge'
import EntityTagCloud from '../components/EntityTagCloud'
import BreachSimulationViewer from '../components/BreachSimulationViewer'
import WhatWouldHappenTimeline from '../components/WhatWouldHappenTimeline'
import type { Decision } from '../types/incident'
import { apiDownload, apiFetch } from '../lib/api'
import { queryClient } from '../lib/queryClient'
import { useEffect, useState } from 'react'

const bannerStyle: Record<Decision, { bg: string; text: string }> = {
  BLOCK: { bg: 'bg-red', text: 'REQUEST BLOCKED — DATA LEAK PREVENTED' },
  WARN: { bg: 'bg-amber', text: 'WARNING ISSUED — POTENTIAL DATA LEAK' },
  ALLOW: { bg: 'bg-green', text: 'REQUEST ALLOWED — WITHIN SAFE PARAMETERS' },
}

export default function IncidentDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: incident, isLoading, isError, error } = useIncidentDetail(id || '')
  const [actionError, setActionError] = useState('')
  const [notes, setNotes] = useState('')
  const [savingReview, setSavingReview] = useState(false)

  useEffect(() => {
    setNotes(incident?.notes || '')
  }, [incident?.id, incident?.notes])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-text-dim label-uppercase">Loading incident data...</div>
      </div>
    )
  }

  if (isError || !incident) {
    return (
      <div className="text-center py-12">
        <div role={isError ? 'alert' : undefined} className="text-text-dim text-sm">
          {isError ? (error instanceof Error ? error.message : 'Unable to load incident') : 'Incident not found'}
        </div>
        <button
          onClick={() => navigate('/dashboard')}
          className="mt-4 px-4 py-2 border border-border text-text-dim text-xs hover:bg-bg3 transition"
        >
          ← Back to War Room
        </button>
      </div>
    )
  }

  let entities: Record<string, number> = {}
  try {
    entities = JSON.parse(incident.entities_json || '{}')
  } catch { /* ignore */ }

  const banner = bannerStyle[incident.decision]

  return (
    <div className="space-y-6" id="incident-detail-page">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-text-dim">
        <button onClick={() => navigate('/dashboard')} className="hover:text-text transition">
          War Room
        </button>
        <span>›</span>
        <span className="text-text font-mono">Incident #{(incident.id || '').slice(0, 8)}</span>
      </div>

      {/* Hero Row: Gauge + Metadata */}
      <div className="flex items-start gap-8">
        <RiskGauge score={incident.risk_score} size={160} />
        <div className="flex-1 grid grid-cols-3 gap-4">
          <MetaItem label="TIMESTAMP" value={incident.timestamp ? new Date(incident.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '—'} />
          <MetaItem label="SOURCE IP" value={incident.user_ip} mono />
          <MetaItem label="TARGET ENDPOINT" value={incident.target_host} mono />
          <MetaItem label="HTTP METHOD" value={incident.http_method} />
          <MetaItem label="PAYLOAD SIZE" value={`${(incident.payload_size_bytes || 0).toLocaleString()} bytes`} />
          <MetaItem label="ENTITIES" value={`${Object.keys(entities).length} types`} />
        </div>
      </div>

      {/* Decision Banner */}
      <div className={`${banner.bg} rounded py-3 px-6 text-center`}>
        <span className="font-display font-bold text-lg text-black tracking-wider">
          {banner.text}
        </span>
      </div>

      {/* Entity Tags */}
      <div>
        <div className="panel-title mb-3">DETECTED ENTITY TYPES</div>
        <EntityTagCloud entities={entities} />
      </div>

      {/* Breach Simulation */}
      {incident.simulation_html && (
        <BreachSimulationViewer text={incident.simulation_html} entities={entities} />
      )}

      {/* Timeline */}
      {incident.decision !== 'ALLOW' && <WhatWouldHappenTimeline />}

      {/* Actions */}
      <div className="space-y-2">
        <label htmlFor="incident-review-notes" className="panel-title block mb-2">REVIEW NOTES</label>
        <textarea
          id="incident-review-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={4000}
          rows={4}
          placeholder="Add investigation notes (up to 4000 characters)"
          className="w-full rounded-lg border border-border bg-bg3 p-3 text-sm text-text placeholder:text-text-dim focus:outline-none focus:border-grapho-orange"
        />
        <div className="text-right text-xs text-text-dim">{notes.length}/4000</div>
      </div>
      <div className="flex items-center gap-4 pt-4 border-t border-border">
        <button
          type="button"
          onClick={() => {
            setActionError('')
            void apiDownload(
              `/api/v1/incidents/${incident.id}/pdf`,
              `incident_${incident.id.slice(0, 8)}.pdf`
            ).catch((err: unknown) => setActionError(err instanceof Error ? err.message : 'PDF export failed'))
          }}
          className="px-5 py-2 border border-red text-red text-xs tracking-wider uppercase hover:bg-red hover:text-black transition font-mono"
        >
          Download PDF
        </button>
        <button
          disabled={savingReview || (incident.reviewed && notes === (incident.notes || ''))}
          onClick={async () => {
            try {
              setSavingReview(true)
              setActionError('')
              await apiFetch(`/api/v1/incidents/${incident.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notes }),
              })
              await queryClient.invalidateQueries({ queryKey: ['incident', incident.id] })
              await queryClient.invalidateQueries({ queryKey: ['incidents'] })
            } catch (err) {
              setActionError(err instanceof Error ? err.message : 'Unable to mark incident reviewed')
            } finally {
              setSavingReview(false)
            }
          }}
          className="px-5 py-2 border border-green text-green text-xs tracking-wider uppercase hover:bg-green hover:text-black transition font-mono"
        >
          {savingReview ? 'Saving…' : incident.reviewed ? 'Update Review' : 'Save Notes & Mark Reviewed'}
        </button>
        <button
          onClick={() => navigate('/dashboard')}
          className="px-5 py-2 border border-border text-text-dim text-xs tracking-wider uppercase hover:bg-bg3 transition font-mono"
        >
          ← Back to War Room
        </button>
      </div>
      {actionError && <p role="alert" className="text-sm text-rose-300">{actionError}</p>}
    </div>
  )
}

function MetaItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="label-uppercase mb-1">{label}</div>
      <div className={`text-sm text-text ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  )
}
