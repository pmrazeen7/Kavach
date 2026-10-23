import { useRef, useState } from 'react'
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import { Eye, Search, Zap } from 'lucide-react'
import Character, { CAST, type CharacterId, type Pose } from '../ui/Character'
import { cn } from '../ui/cn'

const STEPS: Array<{ who: CharacterId; pose: Pose; icon: typeof Eye; title: string; body: string; chips: string[] }> = [
  {
    who: 'scout',
    pose: 'wave',
    icon: Eye,
    title: 'Scout spots every request',
    body: 'The proxy watches outbound traffic and recognises calls to AI services. The request is paused before a single byte leaves.',
    chips: ['mitmproxy', '15 known AI endpoints', 'Request paused'],
  },
  {
    who: 'sage',
    pose: 'think',
    icon: Search,
    title: 'Sage takes it apart',
    body: 'Presidio, SpaCy, semantic scoring and code and secret detectors read the payload and combine into one risk score.',
    chips: ['Presidio PII', 'SpaCy NER', 'Secrets and code', 'Risk 0 to 100'],
  },
  {
    who: 'bolt',
    pose: 'jump',
    icon: Zap,
    title: 'Bolt cuts the leak',
    body: 'Over the block threshold the connection is stopped and a red screen is shown. In the warn band a banner is injected. Everything is logged for audit.',
    chips: ['Allow', 'Warn', 'Block', 'Audit trail'],
  },
]

/** Scroll-pinned story: a packet travels Scout, Sage, Bolt as you scroll. */
export default function PipelineStory() {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const [active, setActive] = useState(0)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] })
  const left = useTransform(scrollYProgress, [0, 1], ['16%', '84%'])
  const fill = useTransform(scrollYProgress, [0, 1], ['0%', '100%'])

  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    setActive(v < 0.34 ? 0 : v < 0.67 ? 1 : 2)
  })

  const step = STEPS[active]

  return (
    <section id="pipeline" ref={ref} className="relative" style={{ height: reduce ? 'auto' : '280vh' }}>
      <div className={cn('flex flex-col justify-center overflow-hidden', reduce ? 'py-20' : 'sticky top-0 h-screen')}>
        <div className="mx-auto w-full max-w-6xl px-6">
          <div className="text-center">
            <div className="mb-2 text-sm font-semibold text-accent">How it works</div>
            <h2 className="mx-auto max-w-2xl text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">Three agents, one millisecond pipeline</h2>
            <p className="mx-auto mt-3 max-w-xl text-muted">Keep scrolling and follow a request through the border.</p>
          </div>

          <div className="relative mt-10">
            <div className="absolute left-[16%] right-[16%] top-[58px] h-1 rounded-full bg-line" aria-hidden="true">
              <motion.div className="h-full rounded-full bg-accent" style={{ width: reduce ? '100%' : fill }} />
            </div>
            <motion.div
              aria-hidden="true"
              className="absolute top-[46px] z-10 h-6 w-6 -translate-x-1/2 rounded-lg border-2 border-accent bg-surface shadow-glow"
              style={{ left: reduce ? '50%' : left }}
            >
              <span className="absolute inset-1 rounded-sm bg-accent/30" />
            </motion.div>

            <div className="grid grid-cols-3 gap-4">
              {STEPS.map((s, i) => (
                <div key={s.who} className="flex flex-col items-center text-center">
                  <motion.div animate={{ scale: i === active || reduce ? 1.12 : 0.9, opacity: i === active || reduce ? 1 : 0.55 }} transition={{ type: 'spring', stiffness: 200, damping: 18 }}>
                    <Character who={s.who} pose={i === active ? s.pose : 'idle'} size={120} follow={false} />
                  </motion.div>
                  <div className="mt-2 text-sm font-semibold text-fg">{CAST[s.who].name}</div>
                  <div className="text-xs text-muted">{CAST[s.who].role}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="mx-auto mt-10 max-w-2xl">
            <AnimatePresence mode="wait">
              <motion.div key={active} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }} className="rounded-3xl border border-line bg-surface p-6 shadow-card">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent-soft text-accent-fg"><step.icon className="h-5 w-5" strokeWidth={1.75} /></span>
                  <h3 className="text-lg font-semibold text-fg">{step.title}</h3>
                </div>
                <p className="mt-3 text-muted">{step.body}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {step.chips.map((c) => <span key={c} className="rounded-full border border-line bg-subtle px-3 py-1 text-xs font-medium text-muted">{c}</span>)}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  )
}
