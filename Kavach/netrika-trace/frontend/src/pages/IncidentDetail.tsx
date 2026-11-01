import { Link, useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { CheckCheck, ChevronRight, FileDown, ShieldAlert, ShieldCheck, TriangleAlert } from 'lucide-react'
import { useIncidentDetail } from '../hooks/useIncidents'
import RiskGauge from '../components/RiskGauge'
import EntityTagCloud from '../components/EntityTagCloud'
import BreachSimulationViewer from '../components/BreachSimulationViewer'
import WhatWouldHappenTimeline from '../components/WhatWouldHappenTimeline'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import { celebrate, toast } from '../components/ui/Toast'
import type { Decision } from '../types/incident'
import { apiDownload, apiFetch } from '../lib/api'
import { queryClient } from '../lib/queryClient'

const bannerStyle: Record<Decision, { cls: string; text: string; icon: typeof ShieldAlert }> = {
  BLOCK: { cls: 'bg-danger-soft text-danger-fg', text: 'Request blocked. Data leak prevented.', icon: ShieldAlert },
  WARN: { cls: 'bg-warn-soft text-warn-fg', text: 'Warning issued. Potential data leak.', icon: TriangleAlert },
  ALLOW: { cls: 'bg-success-soft text-success-fg', text: 'Request allowed. Within safe parameters.', icon: ShieldCheck },
}

export default function IncidentDetail() {
  const { id } = useParams<{ id: string }>()
  const { data: incident, isLoading, isError, error } = useIncidentDetail(id || '')
  const [notes, setNotes] = useState('')
  const [savingReview, setSavingReview] = useState(false)

  useEffect(() => {
    setNotes(incident?.notes || '')
  }, [incident?.id, incident?.notes])

  if (isLoading) {
    return (
      <div className="space-y-4" role="status" aria-label="Loading incident">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-44 w-full rounded-2xl" />
        <Skeleton className="h-16 w-full rounded-2xl" />
      </div>
    )
  }

  if (isError || !incident) {
    return (
      <Card>
        <EmptyState
          kind={isError ? 'error' : 'search'}
          title={isError ? 'Unable to load incident' : 'Incident not found'}
          description={isError && error instanceof Error ? error.message : undefined}
          action={<Link to="/incidents"><Button variant="primary">Back to incidents</Button></Link>}
        />
      </Card>
    )
  }

  let entities: Record<string, number> = {}
  try {
    entities = JSON.parse(incident.entities_json || '{}')
  } catch { /* ignore */ }

  const banner = bannerStyle[incident.decision]
  const BannerIcon = banner.icon

  const saveReview = async () => {
    try {
      setSavingReview(true)
      await apiFetch(`/api/v1/incidents/${incident.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      })
      await queryClient.invalidateQueries({ queryKey: ['incident', incident.id] })
      await queryClient.invalidateQueries({ queryKey: ['incidents'] })
      toast.success('Incident marked reviewed')
      celebrate()
    } catch (err) {
      toast.error('Unable to mark incident reviewed', err instanceof Error ? err.message : undefined)
    } finally {
      setSavingReview(false)
    }
  }

  return (
    <div className="space-y-5" id="incident-detail-page">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-muted">
        <Link to="/incidents" className="hover:text-fg">Incidents</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-mono text-fg">#{(incident.id || '').slice(0, 8)}</span>
      </nav>

      <Card className="flex flex-wrap items-start gap-8 p-6">
        <RiskGauge score={incident.risk_score} size={150} />
        <div className="grid min-w-[260px] flex-1 grid-cols-1 gap-5 sm:grid-cols-3">
          <MetaItem label="Timestamp" value={incident.timestamp ? new Date(incident.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '—'} />
          <MetaItem label="Source IP" value={incident.user_ip} mono />
          <MetaItem label="Target endpoint" value={incident.target_host} mono />
          <MetaItem label="HTTP method" value={incident.http_method} />
          <MetaItem label="Payload size" value={`${(incident.payload_size_bytes || 0).toLocaleString()} bytes`} />
          <MetaItem label="Entities" value={`${Object.keys(entities).length} types`} />
        </div>
      </Card>

      <div className={`flex items-center justify-center gap-2 rounded-2xl px-6 py-3 text-center font-semibold ${banner.cls}`}>
        <BannerIcon className="h-5 w-5" /> {banner.text}
      </div>

      <section>
        <h2 className="mb-3 text-base font-semibold text-fg">Detected entity types</h2>
        <EntityTagCloud entities={entities} />
      </section>

      {incident.simulation_html && <BreachSimulationViewer text={incident.simulation_html} entities={entities} />}

      {incident.decision !== 'ALLOW' && <WhatWouldHappenTimeline />}

      <Card className="p-5">
        <label htmlFor="incident-review-notes" className="mb-2 block text-base font-semibold text-fg">Review notes</label>
        <textarea
          id="incident-review-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={4000}
          rows={4}
          placeholder="Add investigation notes (up to 4000 characters)"
          className="w-full rounded-xl border border-line bg-surface p-3 text-sm text-fg placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
        />
        <div className="mt-1 text-right text-xs text-muted">{notes.length}/4000</div>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <Button
            onClick={() =>
              void apiDownload(`/api/v1/incidents/${incident.id}/pdf`, `incident_${incident.id.slice(0, 8)}.pdf`).catch((err: unknown) =>
                toast.error('PDF export failed', err instanceof Error ? err.message : undefined),
              )
            }
          >
            <FileDown className="h-4 w-4" /> Download PDF
          </Button>
          <Button variant="primary" disabled={savingReview || (incident.reviewed && notes === (incident.notes || ''))} onClick={() => void saveReview()}>
            <CheckCheck className="h-4 w-4" /> {savingReview ? 'Saving…' : incident.reviewed ? 'Update review' : 'Save notes & mark reviewed'}
          </Button>
        </div>
      </Card>
    </div>
  )
}

function MetaItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-xs font-medium text-muted">{label}</div>
      <div className={`truncate text-sm text-fg ${mono ? 'font-mono' : 'font-medium'}`}>{value}</div>
    </div>
  )
}
