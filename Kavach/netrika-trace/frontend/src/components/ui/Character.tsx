import { useEffect, useRef, useState } from 'react'
import { motion, type TargetAndTransition } from 'framer-motion'

export type CharacterId = 'kavi' | 'scout' | 'sage' | 'bolt'
export type Pose = 'idle' | 'wave' | 'jump' | 'think' | 'celebrate' | 'sleep'

export const CAST: Record<CharacterId, { name: string; role: string; blurb: string }> = {
  kavi: { name: 'Kavi', role: 'The Guardian', blurb: 'Stands at the border and decides what gets through.' },
  scout: { name: 'Scout', role: 'The Guide', blurb: 'Spots every request heading for an AI service.' },
  sage: { name: 'Sage', role: 'The Builder', blurb: 'Takes each payload apart and scores the risk.' },
  bolt: { name: 'Bolt', role: 'The Speedster', blurb: 'Cuts the connection before data escapes.' },
}

const INK = 'rgb(var(--accent-deep))'
const PAPER = 'rgb(var(--paper))'
const col = (name: string, a?: number) => `rgb(var(--${name})${a ? ` / ${a}` : ''})`

interface Props {
  who?: CharacterId
  pose?: Pose
  size?: number
  /** Pupils follow the cursor. */
  follow?: boolean
  /** Jumps when clicked. */
  interactive?: boolean
  className?: string
  label?: string
}

/** Face anchor per character: where the eyes sit. */
const FACE: Record<CharacterId, { x: number; y: number; gap: number }> = {
  kavi: { x: 60, y: 52, gap: 13 },
  scout: { x: 60, y: 62, gap: 13 },
  sage: { x: 60, y: 62, gap: 13 },
  bolt: { x: 58, y: 60, gap: 12 },
}

function Body({ who }: { who: CharacterId }) {
  switch (who) {
    case 'kavi':
      return (
        <g className="breathe">
          <path d="M60 10 98 24v32c0 26-17 42-38 48C39 98 22 82 22 56V24z" fill={col('accent-deep')} />
          <path d="M60 18 90 29v27c0 20-13 33-30 38-17-5-30-18-30-38V29z" fill={col('accent')} />
        </g>
      )
    case 'scout':
      return (
        <g>
          <path d="M60 14v14" stroke={INK} strokeWidth="4" strokeLinecap="round" />
          <circle cx="60" cy="11" r="7" fill={col('a-sun')} stroke={INK} strokeWidth="3" />
          <circle cx="60" cy="11" r="2.4" fill={INK} />
          <g className="breathe">
            <rect x="28" y="28" width="64" height="78" rx="30" fill={col('a-mint')} stroke={INK} strokeWidth="3" />
            <rect x="40" y="86" width="40" height="8" rx="4" fill={col('a-blue')} />
          </g>
        </g>
      )
    case 'sage':
      return (
        <g>
          <g className="breathe">
            <rect x="26" y="34" width="68" height="72" rx="22" fill={col('a-peach')} stroke={INK} strokeWidth="3" />
            <rect x="42" y="88" width="36" height="8" rx="4" fill={col('a-pink')} />
          </g>
          {/* hard hat */}
          <path d="M30 40c0-16 13-24 30-24s30 8 30 24z" fill={col('a-sun')} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <rect x="24" y="38" width="72" height="8" rx="4" fill={col('a-sun')} stroke={INK} strokeWidth="3" />
          <path d="M60 17v14" stroke={INK} strokeWidth="3" strokeLinecap="round" />
        </g>
      )
    case 'bolt':
      return (
        <g>
          <path d="M8 56h18M4 70h22M12 84h14" stroke={col('a-violet')} strokeWidth="4" strokeLinecap="round" />
          <g className="breathe">
            <path d="M30 44c0-20 14-30 32-30 22 0 32 18 28 44-3 28-20 48-38 48-16 0-24-14-24-34z" fill={col('a-pink')} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          </g>
          <path d="M92 20 78 46h12L80 70l22-30H90l8-20z" fill={col('a-sun')} stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
        </g>
      )
  }
}

function Eyes({ who, pose }: { who: CharacterId; pose: Pose }) {
  const f = FACE[who]
  const closedHappy = pose === 'celebrate'
  const closedSleep = pose === 'sleep'
  const eyeWhite = who === 'kavi' ? PAPER : PAPER
  const lx = f.x - f.gap
  const rx = f.x + f.gap
  if (closedHappy) {
    return (
      <g stroke={who === 'kavi' ? PAPER : INK} strokeWidth="3.4" strokeLinecap="round" fill="none">
        <path d={`M${lx - 5} ${f.y + 2}q5 -7 10 0`} />
        <path d={`M${rx - 5} ${f.y + 2}q5 -7 10 0`} />
      </g>
    )
  }
  if (closedSleep) {
    return (
      <g stroke={who === 'kavi' ? PAPER : INK} strokeWidth="3.2" strokeLinecap="round" fill="none">
        <path d={`M${lx - 5} ${f.y}q5 5 10 0`} />
        <path d={`M${rx - 5} ${f.y}q5 5 10 0`} />
      </g>
    )
  }
  const look = pose === 'think' ? 'translate(2px,-3px)' : 'translate(calc(var(--px, 0) * 3.2px), calc(var(--py, 0) * 3.2px))'
  return (
    <g>
      {[lx, rx].map((x) => (
        <g key={x} className="eye-blink">
          <ellipse cx={x} cy={f.y} rx="6" ry="7" fill={eyeWhite} stroke={who === 'kavi' ? 'none' : INK} strokeWidth="1.6" />
          <circle cx={x} cy={f.y} r="2.8" fill={INK} style={{ transform: look, transition: 'transform .12s ease-out' }} />
        </g>
      ))}
    </g>
  )
}

function Mouth({ who, pose }: { who: CharacterId; pose: Pose }) {
  const f = FACE[who]
  const stroke = who === 'kavi' ? PAPER : INK
  const y = f.y + 14
  if (pose === 'think') return <path d={`M${f.x - 5} ${y + 2}h10`} stroke={stroke} strokeWidth="3" strokeLinecap="round" />
  if (pose === 'celebrate') return <path d={`M${f.x - 8} ${y - 1}q8 14 16 0z`} fill={stroke} />
  if (pose === 'sleep') return <circle cx={f.x} cy={y + 2} r="2.4" fill={stroke} />
  return <path d={`M${f.x - 7} ${y}q7 7 14 0`} stroke={stroke} strokeWidth="3" strokeLinecap="round" fill="none" />
}

function Cheeks({ who }: { who: CharacterId }) {
  const f = FACE[who]
  return (
    <g opacity="0.7">
      <circle cx={f.x - f.gap - 9} cy={f.y + 12} r="4" fill={col('a-pink')} />
      <circle cx={f.x + f.gap + 9} cy={f.y + 12} r="4" fill={col('a-pink')} />
    </g>
  )
}

function Arms({ pose, who }: { pose: Pose; who: CharacterId }) {
  const stroke = who === 'kavi' ? col('accent-deep') : INK
  const hand = col('a-sun')
  const y = who === 'kavi' ? 72 : 80
  const lx = who === 'bolt' ? 32 : 26
  const rx = who === 'bolt' ? 90 : 94
  const limb = { stroke, strokeWidth: 6, strokeLinecap: 'round' as const, fill: 'none' }

  if (pose === 'celebrate') {
    return (
      <g>
        <path d={`M${lx} ${y}c-10 -6 -12 -20 -8 -30`} {...limb} />
        <path d={`M${rx} ${y}c10 -6 12 -20 8 -30`} {...limb} />
        <circle cx={lx - 8} cy={y - 32} r="5" fill={hand} />
        <circle cx={rx + 8} cy={y - 32} r="5" fill={hand} />
      </g>
    )
  }
  if (pose === 'think') {
    return (
      <g>
        <path d={`M${lx} ${y}c0 8 4 12 8 12`} {...limb} />
        <path d={`M${rx} ${y}c-4 -4 -14 -8 -20 -2`} {...limb} />
        <circle cx={rx - 20} cy={y - 2} r="5" fill={hand} />
      </g>
    )
  }
  return (
    <g>
      <path d={`M${lx} ${y}c-6 4 -8 12 -6 18`} {...limb} />
      <motion.g
        style={{ transformOrigin: `${rx}px ${y}px`, transformBox: 'view-box' }}
        animate={pose === 'wave' ? { rotate: [0, -24, 6, -24, 0] } : { rotate: 0 }}
        transition={pose === 'wave' ? { duration: 1.5, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
      >
        <path d={`M${rx} ${y}c8 -4 12 -14 8 -22`} {...limb} />
        <circle cx={rx + 8} cy={y - 24} r="5" fill={hand} />
      </motion.g>
    </g>
  )
}

function Extras({ pose }: { pose: Pose }) {
  if (pose === 'think')
    return (
      <g fill={col('faint')}>
        <circle cx="100" cy="30" r="3" />
        <circle cx="108" cy="20" r="4.5" />
        <circle cx="114" cy="8" r="6" />
      </g>
    )
  if (pose === 'sleep')
    return (
      <motion.g fill={col('muted')} animate={{ y: [0, -8], opacity: [0, 1, 0] }} transition={{ duration: 2.4, repeat: Infinity }}>
        <path d="M92 28h10l-10 12h10" stroke={col('muted')} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </motion.g>
    )
  if (pose === 'celebrate')
    return (
      <motion.g
        animate={{ scale: [0.8, 1.15, 0.8], rotate: [0, 12, 0] }}
        style={{ transformOrigin: '60px 14px', transformBox: 'view-box' }}
        transition={{ duration: 1.2, repeat: Infinity }}
      >
        <path d="M16 20l3 6 6 3-6 3-3 6-3-6-6-3 6-3z" fill={col('a-sun')} />
        <path d="M98 10l2.4 4.8 4.8 2.4-4.8 2.4-2.4 4.8-2.4-4.8-4.8-2.4 4.8-2.4z" fill={col('a-pink')} />
        <circle cx="60" cy="6" r="3" fill={col('a-mint')} />
      </motion.g>
    )
  return null
}

const rootMotion: Record<Pose, TargetAndTransition> = {
  idle: { y: [0, -3, 0] },
  wave: { y: [0, -3, 0] },
  think: { y: [0, -2, 0] },
  sleep: { y: [0, 1, 0] },
  jump: { y: [0, -22, 0], scaleY: [1, 1.06, 0.94, 1] },
  celebrate: { y: [0, -14, 0], rotate: [-2, 2, -2] },
}

export default function Character({ who = 'kavi', pose = 'idle', size = 120, follow = true, interactive = false, className, label }: Props) {
  const ref = useRef<SVGSVGElement>(null)
  const [override, setOverride] = useState<Pose | null>(null)
  const active = override ?? pose

  useEffect(() => {
    if (!follow || active === 'sleep' || active === 'think') return
    let raf = 0
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const el = ref.current
        if (!el) return
        const r = el.getBoundingClientRect()
        const dx = e.clientX - (r.left + r.width / 2)
        const dy = e.clientY - (r.top + r.height / 2)
        const d = Math.max(60, Math.hypot(dx, dy))
        el.style.setProperty('--px', String(Math.max(-1, Math.min(1, dx / d))))
        el.style.setProperty('--py', String(Math.max(-1, Math.min(1, dy / d))))
      })
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      cancelAnimationFrame(raf)
    }
  }, [follow, active])

  const reducedMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const dur = active === 'jump' ? 0.6 : active === 'celebrate' ? 0.8 : active === 'sleep' ? 4 : 3.2

  const svg = (
    <motion.svg
      ref={ref}
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role="img"
      aria-label={label ?? `${CAST[who].name}, ${CAST[who].role}`}
      className={className}
      animate={reducedMotion ? undefined : rootMotion[active]}
      transition={{ duration: dur, repeat: active === 'jump' && override ? 0 : Infinity, ease: 'easeInOut' }}
      style={{ overflow: 'visible', cursor: interactive ? 'pointer' : undefined }}
      onClick={
        interactive
          ? () => {
              setOverride('jump')
              setTimeout(() => setOverride(null), 650)
            }
          : undefined
      }
    >
      <ellipse cx="60" cy="112" rx="28" ry="4" fill={col('line')} />
      <Body who={who} />
      <Cheeks who={who} />
      <Eyes who={who} pose={active} />
      <Mouth who={who} pose={active} />
      <Arms who={who} pose={active} />
      <Extras pose={active} />
    </motion.svg>
  )
  return svg
}
