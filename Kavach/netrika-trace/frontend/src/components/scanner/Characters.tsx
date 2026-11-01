import { motion, useReducedMotion } from 'framer-motion'

/**
 * The scanner's own cast, in the same rounded style as the rest of the crew
 * (theme palette only):
 *   Sentinel, a guard robot with a scanner visor
 *   Vault,    a safe that swallows redacted secrets
 *   Lens,     a magnifying-glass detective who explains why something was flagged
 */

const INK = 'rgb(var(--accent-deep))'
const PAPER = 'rgb(var(--paper))'
const col = (n: string, a?: number) => `rgb(var(--${n})${a !== undefined ? ` / ${a}` : ''})`

export type SentinelPose = 'idle' | 'scan' | 'suspect' | 'alert' | 'blocked' | 'safe'

const EYE: Record<SentinelPose, string> = {
  idle: col('a-blue'),
  scan: col('a-violet'),
  suspect: col('a-peach'),
  alert: col('a-peach'),
  blocked: col('danger'),
  safe: col('a-mint'),
}

interface CharProps {
  size?: number
  className?: string
}

export function Sentinel({ pose = 'idle', size = 96, className }: CharProps & { pose?: SentinelPose }) {
  const reduce = useReducedMotion()
  const eye = EYE[pose]
  const alarmed = pose === 'alert' || pose === 'blocked'
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role="img"
      aria-label={`Sentinel the guard robot, ${pose}`}
      className={className}
      style={{ overflow: 'visible' }}
      animate={reduce ? undefined : pose === 'alert' ? { x: [0, -2, 2, -2, 0] } : { y: [0, -2.5, 0] }}
      transition={{ duration: pose === 'alert' ? 0.4 : 3.2, repeat: Infinity, ease: 'easeInOut' }}
    >
      <ellipse cx="60" cy="113" rx="26" ry="4" fill={col('line')} />
      {/* antenna */}
      <path d="M60 24V12" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
      <motion.circle cx="60" cy="9" r="5.5" fill={alarmed ? col('danger') : col('a-sun')} stroke={INK} strokeWidth="3" animate={reduce ? undefined : { opacity: alarmed ? [1, 0.3, 1] : [1, 0.7, 1] }} transition={{ duration: alarmed ? 0.5 : 2.4, repeat: Infinity }} />
      {/* body */}
      <g className="breathe">
        <rect x="34" y="76" width="52" height="30" rx="14" fill={col('a-blue')} stroke={INK} strokeWidth="3" />
        <circle cx="60" cy="91" r="5" fill={eye} stroke={INK} strokeWidth="2" />
      </g>
      {/* arms */}
      <path d="M34 86c-8 2-10 10-8 16" stroke={INK} strokeWidth="5.5" strokeLinecap="round" fill="none" />
      {pose === 'safe' ? (
        <g>
          <path d="M86 86c10-2 14-12 12-22" stroke={INK} strokeWidth="5.5" strokeLinecap="round" fill="none" />
          <rect x="91" y="50" width="14" height="14" rx="6" fill={col('a-sun')} stroke={INK} strokeWidth="2.5" />
          <path d="M96 50V40c0-3 6-3 6 1v9" fill={col('a-sun')} stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
        </g>
      ) : pose === 'alert' ? (
        <g>
          <path d="M86 84c10-4 14-16 10-28" stroke={INK} strokeWidth="5.5" strokeLinecap="round" fill="none" />
          <path d="M96 56 100 40" stroke={INK} strokeWidth="4.5" strokeLinecap="round" />
        </g>
      ) : pose === 'blocked' ? (
        <g>
          <path d="M86 86c8-2 12-8 12-14" stroke={INK} strokeWidth="5.5" strokeLinecap="round" fill="none" />
          <rect x="88" y="52" width="22" height="20" rx="5" fill={col('danger')} stroke={INK} strokeWidth="2.5" />
          <rect x="95" y="44" width="8" height="10" rx="3" fill={col('a-sun')} stroke={INK} strokeWidth="2.5" />
        </g>
      ) : (
        <path d="M86 86c8 2 10 10 8 16" stroke={INK} strokeWidth="5.5" strokeLinecap="round" fill="none" />
      )}
      {/* head */}
      <rect x="26" y="24" width="68" height="52" rx="22" fill={col('a-blue')} stroke={INK} strokeWidth="3" />
      <rect x="33" y="37" width="54" height="24" rx="12" fill={INK} />
      {pose === 'scan' ? (
        <>
          <ellipse cx="46" cy="49" rx="5.5" ry="5.5" fill={eye} />
          <ellipse cx="74" cy="49" rx="5.5" ry="5.5" fill={eye} />
          <motion.rect
            x="34"
            y="37"
            width="5"
            height="24"
            rx="2.5"
            fill={col('accent')}
            opacity="0.9"
            animate={reduce ? { x: 24 } : { x: [0, 46, 0] }}
            transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
          />
        </>
      ) : pose === 'safe' ? (
        <>
          <path d="M40 51q6-8 12 0M68 51q6-8 12 0" stroke={eye} strokeWidth="4" strokeLinecap="round" fill="none" />
        </>
      ) : (
        <g className="eye-blink">
          <ellipse cx="46" cy="49" rx={alarmed ? 6.5 : 5.5} ry={alarmed ? 7.5 : 6} fill={eye} />
          <ellipse cx="74" cy="49" rx={alarmed ? 6.5 : 5.5} ry={alarmed ? 7.5 : 6} fill={eye} />
        </g>
      )}
      {/* mouth */}
      {alarmed ? <ellipse cx="60" cy="68" rx="4" ry="3.5" fill={INK} /> : pose === 'safe' ? <path d="M52 67q8 7 16 0" stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none" /> : <path d="M54 68h12" stroke={INK} strokeWidth="3" strokeLinecap="round" />}
      <circle cx="30" cy="62" r="3.5" fill={col('a-pink')} opacity="0.7" />
      <circle cx="90" cy="62" r="3.5" fill={col('a-pink')} opacity="0.7" />
      {pose === 'alert' && (
        <motion.g initial={{ scale: 0 }} animate={{ scale: 1 }} style={{ transformOrigin: '104px 28px', transformBox: 'view-box' }}>
          <circle cx="106" cy="26" r="11" fill={col('a-sun')} stroke={INK} strokeWidth="2.5" />
          <path d="M106 20v8M106 31h.01" stroke={INK} strokeWidth="3" strokeLinecap="round" />
        </motion.g>
      )}
    </motion.svg>
  )
}

export type VaultPose = 'idle' | 'swallow' | 'happy'

export function Vault({ pose = 'idle', size = 96, className }: CharProps & { pose?: VaultPose }) {
  const reduce = useReducedMotion()
  const swallowing = pose === 'swallow'
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role="img"
      aria-label={`Vault the safe, ${pose}`}
      className={className}
      style={{ overflow: 'visible' }}
      animate={reduce ? undefined : swallowing ? { scaleY: [1, 0.9, 1.06, 1], scaleX: [1, 1.06, 0.97, 1] } : { y: [0, -2, 0] }}
      transition={{ duration: swallowing ? 0.7 : 3.4, repeat: Infinity, ease: 'easeInOut' }}
    >
      <ellipse cx="60" cy="113" rx="30" ry="4" fill={col('line')} />
      <rect x="34" y="100" width="12" height="8" rx="3" fill={INK} />
      <rect x="74" y="100" width="12" height="8" rx="3" fill={INK} />
      <g className="breathe">
        <rect x="20" y="22" width="80" height="80" rx="20" fill={col('a-violet')} stroke={INK} strokeWidth="3" />
        <rect x="30" y="32" width="60" height="60" rx="14" fill={col('paper', 0.35)} stroke={INK} strokeWidth="2.5" />
      </g>
      {/* slot that swallows */}
      <motion.rect x="42" y="26" width="36" rx="3" fill={INK} animate={{ height: swallowing ? 9 : 5 }} transition={{ duration: 0.2 }} />
      {/* face */}
      <g className="eye-blink">
        <ellipse cx="48" cy="50" rx="4.5" ry="5.5" fill={PAPER} stroke={INK} strokeWidth="1.8" />
        <ellipse cx="72" cy="50" rx="4.5" ry="5.5" fill={PAPER} stroke={INK} strokeWidth="1.8" />
        <circle cx="48" cy="51" r="2.2" fill={INK} />
        <circle cx="72" cy="51" r="2.2" fill={INK} />
      </g>
      {pose === 'happy' ? <path d="M50 62q10 9 20 0" stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none" /> : swallowing ? <ellipse cx="60" cy="63" rx="5" ry="4" fill={INK} /> : <path d="M54 63h12" stroke={INK} strokeWidth="3" strokeLinecap="round" />}
      <circle cx="40" cy="60" r="4" fill={col('a-pink')} opacity="0.7" />
      <circle cx="80" cy="60" r="4" fill={col('a-pink')} opacity="0.7" />
      {/* dial */}
      <motion.g animate={reduce ? undefined : { rotate: swallowing ? 360 : 0 }} transition={{ duration: 0.8 }} style={{ transformOrigin: '60px 80px', transformBox: 'view-box' }}>
        <circle cx="60" cy="80" r="9" fill={col('a-sun')} stroke={INK} strokeWidth="2.5" />
        <path d="M60 72v16M52 80h16" stroke={INK} strokeWidth="2" strokeLinecap="round" />
      </motion.g>
      {pose === 'happy' && (
        <motion.g initial={{ scale: 0 }} animate={{ scale: [0, 1.2, 1] }} style={{ transformOrigin: '100px 20px', transformBox: 'view-box' }}>
          <path d="M100 10l2.4 4.8 4.8 2.4-4.8 2.4L100 24.4l-2.4-4.8-4.8-2.4 4.8-2.4z" fill={col('a-sun')} />
        </motion.g>
      )}
    </motion.svg>
  )
}

export type LensPose = 'idle' | 'explain'

export function Lens({ pose = 'idle', size = 96, className }: CharProps & { pose?: LensPose }) {
  const reduce = useReducedMotion()
  const explaining = pose === 'explain'
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role="img"
      aria-label={`Lens the detective, ${pose}`}
      className={className}
      style={{ overflow: 'visible' }}
      animate={reduce ? undefined : { y: [0, -3, 0], rotate: explaining ? [-3, 3, -3] : 0 }}
      transition={{ duration: explaining ? 1.6 : 3, repeat: Infinity, ease: 'easeInOut' }}
    >
      <ellipse cx="56" cy="113" rx="24" ry="4" fill={col('line')} />
      {/* handle */}
      <path d="M78 78l22 24" stroke={INK} strokeWidth="9" strokeLinecap="round" />
      <path d="M78 78l22 24" stroke={col('a-peach')} strokeWidth="4" strokeLinecap="round" />
      {/* glass */}
      <circle cx="52" cy="56" r="32" fill={col('a-sun', explaining ? 0.55 : 0.3)} stroke={INK} strokeWidth="5" />
      <path d="M32 44q6-12 20-14" stroke={PAPER} strokeWidth="4" strokeLinecap="round" fill="none" opacity="0.8" />
      {/* hat */}
      <ellipse cx="52" cy="26" rx="26" ry="6" fill={col('a-blue')} stroke={INK} strokeWidth="3" />
      <path d="M36 26c0-12 8-18 16-18s16 6 16 18" fill={col('a-blue')} stroke={INK} strokeWidth="3" />
      <rect x="38" y="20" width="28" height="5" fill={col('accent')} opacity="0.6" />
      {/* face */}
      <g className="eye-blink">
        <ellipse cx="42" cy="58" rx="4.5" ry="5.5" fill={PAPER} stroke={INK} strokeWidth="1.8" />
        <ellipse cx="62" cy="58" rx="4.5" ry="5.5" fill={PAPER} stroke={INK} strokeWidth="1.8" />
        <circle cx={explaining ? 43 : 42} cy={explaining ? 57 : 59} r="2.2" fill={INK} />
        <circle cx={explaining ? 63 : 62} cy={explaining ? 57 : 59} r="2.2" fill={INK} />
      </g>
      {explaining && <path d="M36 49q6-5 12-1" stroke={INK} strokeWidth="2.5" strokeLinecap="round" fill="none" />}
      {explaining ? <ellipse cx="52" cy="72" rx="4" ry="3" fill={INK} /> : <path d="M46 72q6 5 12 0" stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none" />}
      <circle cx="34" cy="68" r="3.5" fill={col('a-pink')} opacity="0.7" />
      <circle cx="70" cy="68" r="3.5" fill={col('a-pink')} opacity="0.7" />
    </motion.svg>
  )
}
