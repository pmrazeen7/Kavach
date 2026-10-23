import { useId } from 'react'

export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  const id = useId()
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} role="img" aria-label="Netrika Trace">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="rgb(var(--accent))" />
          <stop offset="1" stopColor="rgb(var(--accent-deep))" />
        </linearGradient>
      </defs>
      <path d="M32 4 56 13v18c0 15-10 26-24 29C18 57 8 46 8 31V13z" fill={`url(#${id})`} />
      <path d="M14 32c5-8 12-12 18-12s13 4 18 12c-5 8-12 12-18 12s-13-4-18-12z" fill="none" stroke="rgb(var(--paper))" strokeWidth="3.5" strokeLinejoin="round" />
      <circle cx="32" cy="32" r="5.5" fill="rgb(var(--paper))" />
    </svg>
  )
}

export function Wordmark({ collapsed = false, size = 28 }: { collapsed?: boolean; size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size={size} />
      {!collapsed && <span className="text-[15px] font-semibold tracking-tight text-fg">Netrika Trace</span>}
    </div>
  )
}
