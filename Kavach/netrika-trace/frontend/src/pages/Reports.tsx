import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Code2, Download, FileDown, Fingerprint, IdCard, ShieldAlert } from 'lucide-react'
import { useCompliance } from '../hooks/useIncidents'
import StatCard from '../components/ui/StatCard'
import PageHeader from '../components/ui/PageHeader'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'
import Character from '../components/ui/Character'
import { celebrate, toast } from '../components/ui/Toast'
import { apiDownload } from '../lib/api'
import { cn } from '../components/ui/cn'

const DPDP_SECTIONS = [
  {
    id: 'section_8',
    title: 'Section 8: Obligations of Data Fiduciary',
    text: 'Every Data Fiduciary shall implement appropriate technical and organisational measures to ensure compliance and protect personal data by taking reasonable security safeguards.',
    relevance: 'Kavach detects and prevents unauthorized transmission of personal data to external AI services.',
  },
  {
    id: 'section_9',
    title: 'Section 9: Processing by Significant Data Fiduciary',
    text: 'Significant Data Fiduciaries must appoint a DPO, conduct data audits, and perform periodic Data Protection Impact Assessments.',
    relevance: 'The audit log maintained by Kavach serves as evidence for data audits required under Section 9.',
  },
  {
    id: 'section_15',
    title: 'Section 15: Personal Data Breach Notification',
    text: 'In the event of a breach, the Data Fiduciary shall notify the Board and affected Data Principals.',
    relevance: 'Kavach incident records facilitate timely breach notification with complete detection details.',
  },
]

export default function Reports() {
  const { data: stats, isLoading, isError, error } = useCompliance()
  const [busy, setBusy] = useState<'pdf' | 'csv' | null>(null)
  const [open, setOpen] = useState<string | null>('section_8')

  const download = async (kind: 'pdf' | 'csv') => {
    setBusy(kind)
    try {
      if (kind === 'pdf') await apiDownload('/api/v1/analytics/compliance/pdf', 'dpdp_compliance_report.pdf')
      else await apiDownload('/api/v1/analytics/export', 'incidents.csv')
      toast.success(kind === 'pdf' ? 'Weekly report downloaded' : 'Incident export downloaded')
      celebrate()
    } catch (err) {
      toast.error('Download failed', err instanceof Error ? err.message : undefined)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-5" id="reports-page">
      <PageHeader
        title="Reports"
        subtitle="DPDP Act 2023 compliance evidence, ready to hand to an auditor."
        action={
          <div className="flex gap-2">
            <Button onClick={() => void download('csv')} disabled={busy !== null}>
              <Download className="h-4 w-4" /> {busy === 'csv' ? 'Preparing…' : 'Export incidents'}
            </Button>
            <Button variant="primary" onClick={() => void download('pdf')} disabled={busy !== null}>
              <FileDown className="h-4 w-4" /> {busy === 'pdf' ? 'Preparing…' : 'Weekly report PDF'}
            </Button>
          </div>
        }
      />

      {isError ? (
        <Card><EmptyState kind="error" title="Unable to load compliance metrics" description={error instanceof Error ? error.message : undefined} /></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Aadhaar detections this week" aurora="red" icon={<Fingerprint className="h-4 w-4" />} value={stats?.AADHAAR ?? 0} loading={isLoading} />
          <StatCard label="PAN detections this week" aurora="peach" icon={<IdCard className="h-4 w-4" />} value={stats?.PAN ?? 0} loading={isLoading} />
          <StatCard label="Code detections this week" aurora="mint" icon={<Code2 className="h-4 w-4" />} value={stats?.SOURCE_CODE ?? 0} loading={isLoading} />
          <StatCard label="Total incidents this week" aurora="blue" icon={<ShieldAlert className="h-4 w-4" />} value={stats?.total_incidents ?? 0} loading={isLoading} />
        </div>
      )}

      <Card className="p-2">
        <div className="flex items-center justify-between px-4 pb-1 pt-3">
          <h2 className="text-base font-semibold text-fg">Applicable DPDP Act sections</h2>
          <Character who="sage" pose="think" size={52} follow={false} />
        </div>
        {DPDP_SECTIONS.map((section) => {
          const expanded = open === section.id
          return (
            <div key={section.id} className="border-t border-line first:border-0">
              <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : section.id)} className="flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-left hover:bg-subtle/60">
                <span className="text-sm font-medium text-fg">{section.title}</span>
                <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted transition-transform', expanded && 'rotate-180')} />
              </button>
              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="px-4 pb-4">
                      <p className="border-l-2 border-line pl-3 text-sm leading-relaxed text-muted">{section.text}</p>
                      <p className="mt-3 text-sm text-accent-fg"><span className="font-semibold">Relevance:</span> {section.relevance}</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </Card>
    </div>
  )
}
