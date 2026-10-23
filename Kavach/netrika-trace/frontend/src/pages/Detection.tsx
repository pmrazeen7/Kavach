import { useSearchParams } from 'react-router-dom'
import PageHeader from '../components/ui/PageHeader'
import Tabs from '../components/ui/Tabs'
import RulesPanel from '../components/detection/RulesPanel'
import QualityPanel from '../components/detection/QualityPanel'

type TabId = 'rules' | 'quality'
const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'rules', label: 'Rules' },
  { id: 'quality', label: 'Model quality' },
]

export default function Detection() {
  const [params, setParams] = useSearchParams()
  const tab: TabId = params.get('tab') === 'quality' ? 'quality' : 'rules'

  return (
    <div id="detection-page">
      <PageHeader
        title="Detection"
        subtitle="Tune what gets flagged, and check how well the model performs."
        action={<Tabs label="Detection sections" tabs={TABS} value={tab} onChange={(id) => setParams(id === 'rules' ? {} : { tab: id }, { replace: true })} />}
      />
      {tab === 'rules' ? <RulesPanel /> : <QualityPanel />}
    </div>
  )
}
