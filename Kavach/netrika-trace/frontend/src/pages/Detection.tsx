import { useSearchParams } from 'react-router-dom'
import PageHeader from '../components/ui/PageHeader'
import Tabs from '../components/ui/Tabs'
import RulesPanel from '../components/detection/RulesPanel'
import QualityPanel from '../components/detection/QualityPanel'
import ScannerPanel from '../components/detection/ScannerPanel'

type TabId = 'rules' | 'scanner' | 'quality'
const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'rules', label: 'Rules' },
  { id: 'scanner', label: 'Scanner' },
  { id: 'quality', label: 'Model quality' },
]

export default function Detection() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab: TabId = raw === 'quality' ? 'quality' : raw === 'scanner' ? 'scanner' : 'rules'

  return (
    <div id="detection-page">
      <PageHeader
        title="Detection"
        subtitle="Tune what gets flagged, how the live scanner behaves, and how well the model performs."
        action={<Tabs label="Detection sections" tabs={TABS} value={tab} onChange={(id) => setParams(id === 'rules' ? {} : { tab: id }, { replace: true })} />}
      />
      {tab === 'rules' ? <RulesPanel /> : tab === 'scanner' ? <ScannerPanel /> : <QualityPanel />}
    </div>
  )
}
