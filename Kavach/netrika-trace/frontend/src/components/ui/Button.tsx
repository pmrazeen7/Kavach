import { forwardRef } from 'react'
import { motion, type HTMLMotionProps } from 'framer-motion'
import { cn } from './cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dark'

const styles: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:opacity-90',
  secondary: 'bg-surface text-fg border border-line hover:bg-subtle',
  ghost: 'text-muted hover:bg-subtle hover:text-fg',
  danger: 'bg-danger text-white hover:opacity-90',
  dark: 'bg-gradient-to-b from-gray-700 to-gray-900 text-white hover:opacity-90',
}

interface Props extends HTMLMotionProps<'button'> {
  variant?: Variant
  size?: 'sm' | 'md'
}

const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'secondary', size = 'md', className, type = 'button', ...rest },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      type={type}
      whileTap={{ scale: 0.97 }}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
        size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-10 px-4 text-sm',
        styles[variant],
        className,
      )}
      {...rest}
    />
  )
})
export default Button
