import { LogoMark } from './ui/Logo'
import Skeleton from './ui/Skeleton'

export default function PageLoader() {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-4" role="status" aria-label="Loading">
      <LogoMark size={56} animated decorative />
      <Skeleton className="h-2 w-28" />
    </div>
  )
}
