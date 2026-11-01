import type { HTMLAttributes } from 'react'
import { cn } from './cn'

export default function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-2xl border border-line bg-surface shadow-card', className)} {...rest} />
}
