type Kind = 'empty' | 'search' | 'error'

export default function Illustration({ kind, size = 140 }: { kind: Kind; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 140 140" fill="none" aria-hidden="true">
      <circle cx="70" cy="72" r="54" fill="rgb(var(--accent-soft))" opacity="0.6" />
      {kind === 'empty' && (
        <>
          <rect x="30" y="46" width="80" height="58" rx="10" fill="rgb(var(--surface))" stroke="rgb(var(--line))" strokeWidth="2" />
          <path d="M30 70h24l6 10h20l6-10h24" stroke="rgb(var(--line))" strokeWidth="2" strokeLinejoin="round" />
          <rect x="46" y="30" width="48" height="12" rx="6" fill="rgb(var(--accent))" opacity="0.85" />
        </>
      )}
      {kind === 'search' && (
        <>
          <circle cx="62" cy="64" r="24" fill="rgb(var(--surface))" stroke="rgb(var(--accent))" strokeWidth="5" />
          <path d="M80 82l24 24" stroke="rgb(var(--accent))" strokeWidth="8" strokeLinecap="round" />
          <path d="M52 64h20" stroke="rgb(var(--faint))" strokeWidth="4" strokeLinecap="round" />
        </>
      )}
      {kind === 'error' && (
        <>
          <path d="M70 28 112 100H28z" fill="rgb(var(--surface))" stroke="rgb(var(--danger))" strokeWidth="5" strokeLinejoin="round" />
          <path d="M70 55v24" stroke="rgb(var(--danger))" strokeWidth="6" strokeLinecap="round" />
          <circle cx="70" cy="90" r="4" fill="rgb(var(--danger))" />
        </>
      )}
    </svg>
  )
}
