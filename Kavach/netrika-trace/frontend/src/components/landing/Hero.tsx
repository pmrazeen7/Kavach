import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion'
import { ArrowRight, Code2, FileText, Fingerprint, KeyRound, Lock, ShieldCheck } from 'lucide-react'
import Character from '../ui/Character'
import Button from '../ui/Button'
import Magnetic from './Magnetic'

const ORBIT = [ShieldCheck, Lock, Fingerprint, KeyRound, Code2, FileText]

function Orbit({ radius, duration, icons, reverse }: { radius: number; duration: number; icons: typeof ORBIT; reverse?: boolean }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      aria-hidden="true"
      className="absolute left-1/2 top-1/2"
      style={{ width: radius * 2, height: radius * 2, marginLeft: -radius, marginTop: -radius }}
      animate={reduce ? undefined : { rotate: reverse ? -360 : 360 }}
      transition={{ duration, repeat: Infinity, ease: 'linear' }}
    >
      <div className="absolute inset-0 rounded-full border border-dashed border-line" />
      {icons.map((Icon, i) => {
        const a = (i / icons.length) * Math.PI * 2
        return (
          <motion.span
            key={i}
            className="absolute flex h-10 w-10 items-center justify-center rounded-2xl border border-line bg-surface text-accent shadow-card"
            style={{ left: radius + Math.cos(a) * radius - 20, top: radius + Math.sin(a) * radius - 20 }}
            animate={reduce ? undefined : { rotate: reverse ? 360 : -360 }}
            transition={{ duration, repeat: Infinity, ease: 'linear' }}
          >
            <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </motion.span>
        )
      })}
    </motion.div>
  )
}

export default function Hero() {
  const reduce = useReducedMotion()
  const mx = useMotionValue(0)
  const my = useMotionValue(0)
  const sx = useSpring(mx, { stiffness: 80, damping: 16 })
  const sy = useSpring(my, { stiffness: 80, damping: 16 })
  const farX = useTransform(sx, (v) => v * -14)
  const farY = useTransform(sy, (v) => v * -14)
  const nearX = useTransform(sx, (v) => v * 22)
  const nearY = useTransform(sy, (v) => v * 22)

  useEffect(() => {
    if (reduce) return
    const onMove = (e: PointerEvent) => {
      mx.set(e.clientX / window.innerWidth - 0.5)
      my.set(e.clientY / window.innerHeight - 0.5)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [reduce, mx, my])

  return (
    <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 pb-16 pt-12 lg:grid-cols-[1.05fr_.95fr] lg:pt-20" id="top">
      <div>
        <motion.span initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface py-1.5 pl-2 pr-4 text-[13px] font-medium text-muted shadow-card">
          <b className="rounded-full bg-accent-soft px-2.5 py-0.5 font-semibold text-accent-fg">New</b> On-premise agentic DLP for AI traffic
        </motion.span>
        <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="mt-5 text-[clamp(38px,5.4vw,64px)] font-extrabold leading-[1.04] tracking-[-0.035em] text-fg">
          The guardian of your <span className="bg-gradient-to-r from-accent via-aurora-pink to-warn bg-clip-text text-transparent">AI border</span>
        </motion.h1>
        <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }} className="mt-5 max-w-xl text-lg text-muted">
          Autonomous AI security for the modern enterprise. Catch Shadow AI data leaks while they happen, with agents that understand context, not just keywords.
        </motion.p>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 }} className="mt-8 flex flex-wrap items-center gap-3">
          <Magnetic>
            <Link to="/login">
              <Button variant="primary" className="h-[52px] px-7 text-base shadow-glow">
                Launch Kavach <ArrowRight className="h-[18px] w-[18px]" />
              </Button>
            </Link>
          </Magnetic>
          <a href="#pipeline">
            <Button className="h-[52px] px-7 text-base">See how it works</Button>
          </a>
        </motion.div>
        <motion.ul initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-[13px] font-medium text-faint">
          {['100% on-premise', 'DPDP Act ready', 'Allow, warn or block in real time'].map((t) => (
            <li key={t} className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-success" strokeWidth={2} /> {t}</li>
          ))}
        </motion.ul>
      </div>

      <div className="relative mx-auto aspect-square w-full max-w-[480px]" aria-label="Kavi the guardian surrounded by orbiting security icons">
        <motion.div className="absolute inset-0" style={{ x: farX, y: farY }}>
          <Orbit radius={210} duration={50} icons={ORBIT} />
          <Orbit radius={140} duration={34} icons={ORBIT.slice(0, 4)} reverse />
        </motion.div>
        <motion.div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ x: nearX, y: nearY }}>
          <Character who="kavi" pose="wave" size={200} interactive />
        </motion.div>

        <motion.div className="absolute -left-2 top-[14%] animate-float rounded-2xl border border-line bg-surface px-4 py-3 shadow-pop" style={{ x: nearX }}>
          <div className="text-xs text-muted">Blocked today</div>
          <div className="text-2xl font-semibold tabular-nums text-fg">212</div>
        </motion.div>
        <motion.div className="absolute -right-2 top-[42%] animate-float rounded-2xl border border-line bg-surface px-4 py-3 shadow-pop [animation-delay:1.5s]" style={{ x: farX }}>
          <div className="text-xs text-muted">Risk score</div>
          <div className="flex items-center gap-2"><span className="text-2xl font-semibold tabular-nums text-danger">94</span><span className="rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-semibold text-danger-fg">Blocked</span></div>
        </motion.div>
        <motion.div className="absolute bottom-[8%] left-[4%] flex animate-float items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-medium text-fg shadow-pop [animation-delay:3s]" style={{ y: nearY }}>
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-success-soft text-success-fg"><ShieldCheck className="h-4 w-4" /></span>
          Connection reset
        </motion.div>
      </div>
    </div>
  )
}
