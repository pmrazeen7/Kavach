import { motion } from 'framer-motion'

export type MascotPose = 'wave' | 'think' | 'celebrate'

/** "Kavi", a small shield-shaped guardian. Original artwork. */
export default function Mascot({ pose = 'wave', size = 120 }: { pose?: MascotPose; size?: number }) {
  const celebrating = pose === 'celebrate'
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role="img"
      aria-label={`Kavi the guardian, ${pose}`}
      animate={{ y: celebrating ? [0, -6, 0] : [0, -2, 0] }}
      transition={{ duration: celebrating ? 0.7 : 3, repeat: Infinity, ease: 'easeInOut' }}
    >
      <ellipse cx="60" cy="112" rx="26" ry="4" fill="rgb(var(--line))" />
      <path d="M60 10 98 24v32c0 26-17 42-38 48C39 98 22 82 22 56V24z" fill="#4F46E5" />
      <path d="M60 18 90 29v27c0 20-13 33-30 38-17-5-30-18-30-38V29z" fill="#6366F1" />
      <ellipse cx="48" cy="52" rx="5" ry={celebrating ? 2.5 : 6} fill="#fff" />
      <ellipse cx="72" cy="52" rx="5" ry={celebrating ? 2.5 : 6} fill="#fff" />
      {!celebrating && (
        <>
          <circle cx={pose === 'think' ? 50 : 48} cy={pose === 'think' ? 49 : 53} r="2.4" fill="#312E81" />
          <circle cx={pose === 'think' ? 74 : 72} cy={pose === 'think' ? 49 : 53} r="2.4" fill="#312E81" />
        </>
      )}
      <circle cx="40" cy="64" r="4" fill="#F9A8D4" opacity="0.7" />
      <circle cx="80" cy="64" r="4" fill="#F9A8D4" opacity="0.7" />
      {pose === 'think' ? (
        <path d="M54 70h12" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      ) : (
        <path d="M50 68c4 7 16 7 20 0" stroke="#fff" strokeWidth="3" strokeLinecap="round" fill="none" />
      )}
      {pose === 'wave' && (
        <motion.g
          animate={{ rotate: [0, 18, -4, 18, 0] }}
          transition={{ duration: 1.6, repeat: Infinity }}
          style={{ transformOrigin: '96px 70px', transformBox: 'view-box' }}
        >
          <path d="M96 70c8-4 12-14 8-22" stroke="#4F46E5" strokeWidth="6" strokeLinecap="round" fill="none" />
          <circle cx="104" cy="46" r="5" fill="#FDE68A" />
        </motion.g>
      )}
      {pose === 'think' && (
        <>
          <path d="M96 78c-6 0-12-4-14-12" stroke="#4F46E5" strokeWidth="6" strokeLinecap="round" fill="none" />
          <circle cx="102" cy="26" r="3" fill="rgb(var(--faint))" />
          <circle cx="110" cy="16" r="4.5" fill="rgb(var(--faint))" />
        </>
      )}
      {celebrating && (
        <>
          <path d="M24 66c-8-6-10-18-6-26M96 66c8-6 10-18 6-26" stroke="#4F46E5" strokeWidth="6" strokeLinecap="round" fill="none" />
          <circle cx="18" cy="38" r="5" fill="#FDE68A" />
          <circle cx="102" cy="38" r="5" fill="#FDE68A" />
          <path d="M14 14l3 6 6 3-6 3-3 6-3-6-6-3 6-3zM104 8l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" fill="#F59E0B" />
        </>
      )}
    </motion.svg>
  )
}
