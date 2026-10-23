import type { ReactNode } from 'react'
import Illustration from './Illustrations'
import Mascot, { type MascotPose } from './Mascot'

interface Props {
  title: string
  description?: string
  kind?: 'empty' | 'search' | 'error'
  mascot?: MascotPose
  action?: ReactNode
}

export default function EmptyState({ title, description, kind = 'empty', mascot, action }: Props) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center" role={kind === 'error' ? 'alert' : undefined}>
      {mascot ? <Mascot pose={mascot} size={120} /> : <Illustration kind={kind} />}
      <h3 className="mt-3 text-base font-semibold text-fg">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
