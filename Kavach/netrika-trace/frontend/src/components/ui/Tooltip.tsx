import type { ReactNode } from 'react'

/** CSS-only tooltip; also shown on keyboard focus. */
export default function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="group/tt relative inline-flex">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-gray-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-pop transition-opacity group-focus-within/tt:opacity-100 group-hover/tt:opacity-100"
      >
        {label}
      </span>
    </span>
  )
}
