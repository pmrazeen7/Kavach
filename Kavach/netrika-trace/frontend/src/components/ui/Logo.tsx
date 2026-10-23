import { useId } from 'react'

export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  const id = useId()
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} role="img" aria-label="Netrika Trace">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366F1" />
          <stop offset="1" stopColor="#4338CA" />
        </linearGradient>
      </defs>
      <path d="M32 4 56 13v18c0 15-10 26-24 29C18 57 8 46 8 31V13z" fill={`url(#${id})`} />
      <path d="M14 32c5-8 12-12 18-12s13 4 18 12c-5 8-12 12-18 12s-13-4-18-12z" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinejoin="round" />
      <circle cx="32" cy="32" r="5.5" fill="#fff" />
    </svg>
  )
}

export function Wordmark({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size={28} />
      {!collapsed && <span className="text-[15px] font-semibold tracking-tight text-fg">Netrika Trace</span>}
    </div>
  )
}
