import { Link } from 'react-router-dom'
import Mascot from '../components/ui/Mascot'
import Button from '../components/ui/Button'

export default function NotFound() {
  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center bg-bg px-6 text-center">
      <Mascot pose="think" size={150} />
      <p className="mt-4 text-sm font-semibold text-accent">404</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-fg">Page not found</h1>
      <p className="mt-2 max-w-sm text-sm text-muted">Kavi looked everywhere but this page doesn&apos;t exist.</p>
      <Link to="/dashboard" className="mt-6">
        <Button variant="primary">Back to dashboard</Button>
      </Link>
    </div>
  )
}
