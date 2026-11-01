import { cn } from './cn'

export type AuroraTone = 'blue' | 'red' | 'peach' | 'mint' | 'mix'

const tones: Record<AuroraTone, [string, string, string]> = {
  blue: ['a-blue', 'a-violet', 'a-pink'],
  red: ['a-pink', 'a-peach', 'a-violet'],
  peach: ['a-peach', 'a-sun', 'a-pink'],
  mint: ['a-mint', 'a-blue', 'a-sun'],
  mix: ['a-blue', 'a-pink', 'a-mint'],
}

const blob = (token: string) => `radial-gradient(closest-side, rgb(var(--${token}) / 0.95), rgb(var(--${token}) / 0))`

/**
 * Slowly drifting soft blobs. Radial gradients instead of CSS blur filters, so it
 * stays cheap to paint; only transforms animate. Fills its (relative) parent.
 */
export default function Aurora({ tone = 'mix', className, strong }: { tone?: AuroraTone; className?: string; strong?: boolean }) {
  const [a, b, c] = tones[tone]
  return (
    <div
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
      style={{ opacity: strong ? 'var(--aurora-opacity)' : 'calc(var(--aurora-opacity) * 0.9)' }}
    >
      <div className="absolute -left-[15%] -top-[45%] h-[110%] w-[70%] animate-drift1" style={{ background: blob(a) }} />
      <div className="absolute -right-[15%] top-[-10%] h-[110%] w-[65%] animate-drift2" style={{ background: blob(b) }} />
      <div className="absolute -bottom-[60%] left-[25%] h-[110%] w-[60%] animate-drift1" style={{ background: blob(c) }} />
    </div>
  )
}
