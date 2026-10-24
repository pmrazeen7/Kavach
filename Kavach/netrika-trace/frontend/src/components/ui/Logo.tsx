import { useEffect, useId, useMemo, useState, useSyncExternalStore } from 'react'
import { LOCKUP_VIEWBOX, MARK_BODY, MARK_BODY_STATIC, MARK_VIEWBOX, TAGLINE_PATH, WORDMARK_PATH } from '../brand/logoData'
import { cn } from './cn'

/** Below this rendered size the logo is always the static artwork. */
const MIN_ANIMATED_PX = 32
/** At most this many animated logos run at once so the page stays at 60fps. */
const MAX_ANIMATED = 2
const LOCKUP_RATIO = 980 / 260

const SHIELD = 'M128 16 C160 36 196 44 224 44 V120 C224 176 184 216 128 240 C72 216 32 176 32 120 V44 C60 44 96 36 128 16 Z'
const FIXED = { light: ['#111827', '#6B7280'], dark: ['#F9FAFB', '#9CA3AF'] } as const

// Animation slots: logos that want to animate register in order; only the first two get to.
const queue: string[] = []
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

function useAnimationSlot(wanted: boolean): boolean {
  const id = useId()
  useEffect(() => {
    if (!wanted) return
    queue.push(id)
    emit()
    return () => {
      const i = queue.indexOf(id)
      if (i >= 0) queue.splice(i, 1)
      emit()
    }
  }, [id, wanted])
  return useSyncExternalStore(subscribe, () => wanted && queue.indexOf(id) >= 0 && queue.indexOf(id) < MAX_ANIMATED, () => false)
}

function usePageHidden(): boolean {
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden)
  useEffect(() => {
    const on = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [])
  return hidden
}

export interface LogoProps {
  /** "full" is the lockup (mark, wordmark, tagline); "mark" is the shield alone. */
  variant?: 'full' | 'mark'
  /** Rendered height in px (the mark is square, so also its width). */
  size?: number
  animated?: boolean
  /** "auto" follows the app theme tokens; the others pin the lockup text colors. */
  theme?: 'light' | 'dark' | 'auto'
  /** Brief status tint on the shield: pink-red when something is blocked, mint pulse when safe. Re-triggers on change of `tintKey`. */
  tint?: 'blocked' | 'safe' | null
  tintKey?: number | string
  /** Add clear space equal to the K's stem width (17 of 256 units) on every side. */
  clearSpace?: boolean
  /** Decorative copies sit next to visible text; they are hidden from assistive tech. */
  decorative?: boolean
  label?: string
  className?: string
}

export function Logo({
  variant = 'full',
  size = variant === 'full' ? 40 : 32,
  animated = false,
  theme = 'auto',
  tint = null,
  tintKey,
  clearSpace = false,
  decorative = false,
  label = 'Kavach',
  className,
}: LogoProps) {
  const raw = useId().replace(/[^a-zA-Z0-9]/g, '')
  const prefix = `kv${raw}`
  const hidden = usePageHidden()
  const motionOk = useAnimationSlot(animated && size >= MIN_ANIMATED_PX)
  const body = useMemo(() => (motionOk ? MARK_BODY : MARK_BODY_STATIC).split('@@').join(prefix), [motionOk, prefix])
  const isFull = variant === 'full'
  const [wordFill, tagFill] = theme === 'auto' ? ['rgb(var(--fg))', 'rgb(var(--muted))'] : FIXED[theme]
  const pad = clearSpace ? (size * 17) / 256 : 0
  const height = size
  const width = isFull ? size * LOCKUP_RATIO : size

  const art = (
    <>
      <g dangerouslySetInnerHTML={{ __html: body }} />
      {tint && (
        <path
          key={String(tintKey ?? tint)}
          d={SHIELD}
          className={cn('kv-tint', tint === 'blocked' ? 'kv-tint-blocked' : 'kv-tint-safe')}
          fill={tint === 'blocked' ? 'rgb(var(--danger))' : 'rgb(var(--success))'}
        />
      )}
    </>
  )

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox={isFull ? LOCKUP_VIEWBOX : MARK_VIEWBOX}
      className={cn('kv-logo shrink-0', className)}
      style={pad ? { margin: pad } : undefined}
      data-animated={motionOk ? 'true' : 'false'}
      data-paused={hidden ? 'true' : 'false'}
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label })}
      focusable="false"
    >
      {isFull ? (
        <>
          <g transform="translate(0 4) scale(.94)">{art}</g>
          <path d={WORDMARK_PATH} fill={wordFill} />
          <path d={TAGLINE_PATH} fill={tagFill} />
        </>
      ) : (
        art
      )}
    </svg>
  )
}

export function LogoMark(props: Omit<LogoProps, 'variant'>) {
  return <Logo {...props} variant="mark" />
}

/** Mark + app name, for compact headers and the sidebar. */
export function Wordmark({ collapsed = false, size = 28, animated = false }: { collapsed?: boolean; size?: number; animated?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size={size} animated={animated} decorative={!collapsed} />
      {!collapsed && <span className="text-[15px] font-semibold tracking-tight text-fg">Kavach</span>}
    </div>
  )
}
