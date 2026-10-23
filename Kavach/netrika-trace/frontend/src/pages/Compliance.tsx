import { useState } from 'react'
import { useCompliance } from '../hooks/useIncidents'
import StatCard from '../components/StatCard'
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
  const [downloadError, setDownloadError] = useState('')

  return (
    <div className="space-y-8" id="compliance-page">
      <div>
        <h1 className="font-sans font-bold text-2xl text-text tracking-wider">
          DPDP ACT COMPLIANCE
        </h1>
        <p className="label-uppercase mt-1">Digital Personal Data Protection Act, 2023 (India)</p>
      </div>

      {isError ? (
        <p role="alert" className="text-sm text-danger-fg">
          {error instanceof Error ? error.message : 'Unable to load compliance metrics'}
        </p>
      ) : isLoading ? (
        <div className="h-24 rounded-2xl bg-subtle animate-pulse" aria-label="Loading compliance metrics" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard label="AADHAAR DETECTIONS" value={stats?.AADHAAR ?? 0} variant="red" subtext="This week" />
          <StatCard label="PAN DETECTIONS" value={stats?.PAN ?? 0} variant="red" subtext="This week" />
          <StatCard label="CODE DETECTIONS" value={stats?.SOURCE_CODE ?? 0} variant="amber" subtext="This week" />
          <StatCard label="TOTAL INCIDENTS" value={stats?.total_incidents ?? 0} variant="blue" subtext="This week" />
        </div>
      )}

      {/* DPDP Sections */}
      <div>
        <div className="panel-title mb-4">APPLICABLE DPDP ACT SECTIONS</div>
        <div className="space-y-4">
          {DPDP_SECTIONS.map((section) => (
            <div key={section.id} className="bg-bg2 border border-border rounded p-5">
              <div className="font-sans font-bold text-sm text-text tracking-wider mb-2">
                {section.title}
              </div>
              <div className="text-xs text-text-dim leading-relaxed mb-3 border-l-2 border-border pl-3">
                {section.text}
              </div>
              <div className="text-xs text-blue">
                <span className="font-bold">Relevance:</span> {section.relevance}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Generate Report */}
      <div className="flex gap-4">
        <a
          href="#download"
          onClick={(event) => {
            event.preventDefault()
            setDownloadError('')
            void apiDownload('/api/v1/analytics/compliance/pdf', 'dpdp_compliance_report.pdf')
              .catch((err: unknown) => setDownloadError(err instanceof Error ? err.message : 'Report download failed'))
          }}
          className="inline-flex items-center gap-2 px-6 py-3 bg-red text-black font-sans font-bold text-sm tracking-wider rounded hover:opacity-90 transition"
        >
          📄 GENERATE WEEKLY REPORT PDF
        </a>
        {downloadError && <p role="alert" className="text-sm text-danger-fg">{downloadError}</p>}
      </div>
    </div>
  )
}
