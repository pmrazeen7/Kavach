import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Drawer from './ui/Drawer'
import Button from './ui/Button'
import Character, { CAST, type CharacterId, type Pose } from './ui/Character'
import { celebrate } from './ui/Toast'

const STEPS: Array<{ who: CharacterId; pose: Pose; title: string; body: string }> = [
  { who: 'scout', pose: 'wave', title: 'Scout watches the border', body: 'Every request heading to an AI service is spotted and paused. Devices appear under Overview → Devices once the extension reports in.' },
  { who: 'sage', pose: 'think', title: 'Sage scores the risk', body: 'Payloads are taken apart for Aadhaar, PAN, secrets and source code. Tune what counts under Govern → Detection.' },
  { who: 'bolt', pose: 'jump', title: 'Bolt cuts the leak', body: 'Risky requests are blocked or warned in milliseconds. Review them from Incidents and export reports from Reports.' },
]

export function onboardingSeen() {
  try {
    return localStorage.getItem('netrika_onboarded') === '1'
  } catch {
    return true
  }
}

export default function Onboarding({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0)
  const last = step === STEPS.length - 1
  const s = STEPS[step]

  const finish = () => {
    try { localStorage.setItem('netrika_onboarded', '1') } catch { /* ignore */ }
    celebrate()
    setStep(0)
    onClose()
  }

  return (
    <Drawer
      open={open}
      onClose={finish}
      title="Meet the crew"
      subtitle={`Step ${step + 1} of ${STEPS.length}`}
      footer={
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5" aria-hidden="true">
            {STEPS.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-6 bg-accent' : 'w-1.5 bg-line'}`} />
            ))}
          </div>
          <div className="flex gap-2">
            {step > 0 && <Button onClick={() => setStep(step - 1)}>Back</Button>}
            <Button variant="primary" onClick={() => (last ? finish() : setStep(step + 1))}>{last ? 'Start exploring' : 'Next'}</Button>
          </div>
        </div>
      }
    >
      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col items-center text-center">
          <div className="mt-4"><Character who={s.who} pose={s.pose} size={170} /></div>
          <div className="mt-2 text-sm font-semibold text-accent">{CAST[s.who].name} · {CAST[s.who].role}</div>
          <h3 className="mt-1 text-xl font-semibold tracking-tight text-fg">{s.title}</h3>
          <p className="mt-2 max-w-sm text-sm text-muted">{s.body}</p>
        </motion.div>
      </AnimatePresence>
    </Drawer>
  )
}
