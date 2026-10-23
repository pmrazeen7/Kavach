import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import Tooltip from './Tooltip'
import { cn } from './cn'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  children: ReactNode
}

const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton(
  { label, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <Tooltip label={label}>
      <button
        ref={ref}
        type={type}
        aria-label={label}
        className={cn(
          'relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-surface text-muted transition-colors hover:bg-subtle hover:text-fg active:scale-95',
          className,
        )}
        {...rest}
      >
        {children}
      </button>
    </Tooltip>
  )
})
export default IconButton
