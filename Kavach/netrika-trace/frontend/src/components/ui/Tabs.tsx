import { useId } from 'react'
import { motion } from 'framer-motion'
import { cn } from './cn'

export interface TabItem<T extends string> {
  id: T
  label: string
}

/** Segmented control / tab strip with a sliding indicator. */
export default function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  size = 'md',
  label,
}: {
  tabs: TabItem<T>[]
  value: T
  onChange: (id: T) => void
  size?: 'sm' | 'md'
  label: string
}) {
  const group = useId()
  return (
    <div role="tablist" aria-label={label} className="inline-flex gap-1 rounded-xl border border-line bg-subtle p-1">
      {tabs.map((t) => {
        const active = t.id === value
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={cn(
              'relative rounded-lg font-medium transition-colors',
              size === 'sm' ? 'px-3 py-1 text-xs' : 'px-4 py-1.5 text-sm',
              active ? 'text-fg' : 'text-muted hover:text-fg',
            )}
          >
            {active && (
              <motion.span layoutId={`tab-${group}`} className="absolute inset-0 rounded-lg border border-line bg-surface shadow-card" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />
            )}
            <span className="relative">{t.label}</span>
          </button>
        )
      })}
    </div>
  )
}
