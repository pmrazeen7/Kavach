import { useState } from 'react'
import { FileDown, Fingerprint, IdCard, Code2, ShieldAlert } from 'lucide-react'
import { useCompliance } from '../hooks/useIncidents'
import StatCard from '../components/ui/StatCard'
import PageHeader from '../components/ui/PageHeader'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'
import { celebrate, toast } from '../components/ui/Toast'
import { apiDownload } from '../lib/api'

const DPDP_SECTIONS = [
  {
    id: 'section_8',
    title: 'Section 8 — Obligations of Data Fiduciary',
    text: 'Every Data Fiduciary shall implement appropriate technical and organisational measures to ensure compliance and protect personal data by taking reasonable security safeguards.',
    relevance: 'Netrika-Trace detects and prevents unauthorized transmission of personal data to external AI services.',
  },
  {
    id: 'section_9',
    title: 'Section 9 — Processing by Significant Data Fiduciary',
    text: 'Significant Data Fiduciaries must appoint a DPO, conduct data audits, and perform periodic Data Protection Impact Assessments.',
    relevance: 'The audit log maintained by Netrika-Trace serves as evidence for data audits required under Section 9.',
  },
  {
    id: 'section_15',
    title: 'Section 15 — Personal Data Breach Notification',
    text: 'In the event of a breach, the Data Fiduciary shall notify the Board and affected Data Principals.',
    relevance: 'Netrika-Trace incident records facilitate timely breach notification with complete detection details.',
  },
]

export default function Compliance() {
  const { data: stats, isLoading, isError, error } = useCompliance()
  const [downloading, setDownloading] = useState(false)

  const download = async () => {
    setDownloading(true)
    try {
      await apiDownload('/api/v1/analytics/compliance/pdf', 'dpdp_compliance_report.pdf')
      toast.success('Report downloaded', 'dpdp_compliance_report.pdf')
      celebrate()
    } catch (err) {
      toast.error('Report download failed', err instanceof Error ? err.message : undefined)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="space-y-6" id="compliance-page">
      <PageHeader
        title="DPDP Act compliance"
        subtitle="Digital Personal Data Protection Act, 2023 (India)"
        action={
          <Button variant="primary" onClick={() => void download()} disabled={downloading}>
            <FileDown className="h-4 w-4" /> {downloading ? 'Preparing…' : 'Weekly report PDF'}
          </Button>
        }
      />

      {isError ? (
        <Card>
          <EmptyState kind="error" title="Unable to load compliance metrics" description={error instanceof Error ? error.message : undefined} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Aadhaar detections this week" aurora="red" icon={<Fingerprint className="h-4 w-4" />} value={stats?.AADHAAR ?? 0} loading={isLoading} />
          <StatCard label="PAN detections this week" aurora="peach" icon={<IdCard className="h-4 w-4" />} value={stats?.PAN ?? 0} loading={isLoading} />
          <StatCard label="Code detections this week" aurora="mint" icon={<Code2 className="h-4 w-4" />} value={stats?.SOURCE_CODE ?? 0} loading={isLoading} />
          <StatCard label="Total incidents this week" aurora="blue" icon={<ShieldAlert className="h-4 w-4" />} value={stats?.total_incidents ?? 0} loading={isLoading} />
        </div>
      )}

      <div>
        <h2 className="mb-3 text-base font-semibold text-fg">Applicable DPDP Act sections</h2>
        <div className="space-y-3">
          {DPDP_SECTIONS.map((section) => (
            <Card key={section.id} className="p-5">
              <div className="mb-2 text-sm font-semibold text-fg">{section.title}</div>
              <p className="mb-3 border-l-2 border-line pl-3 text-sm leading-relaxed text-muted">{section.text}</p>
              <p className="text-sm text-accent-fg">
                <span className="font-semibold">Relevance:</span> {section.relevance}
              </p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
