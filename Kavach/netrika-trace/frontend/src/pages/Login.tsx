import { useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Lock, Mail, ArrowRight } from 'lucide-react'
import { apiUrl } from '../lib/api'
import { LogoMark } from '../components/ui/Logo'
import Aurora from '../components/ui/Aurora'
import Character from '../components/ui/Character'
import Button from '../components/ui/Button'

const inputCls =
  'h-11 w-full rounded-xl border border-line bg-surface pl-10 pr-3 text-sm text-fg placeholder:text-faint transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const resp = await fetch(apiUrl('/api/v1/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await resp.json()
      if (resp.ok) {
        localStorage.setItem('netrika_token', data.access_token)
        localStorage.setItem('netrika_user', JSON.stringify(data.user))
        navigate('/dashboard')
      } else {
        setError(data.error || 'Login failed')
      }
    } catch {
      setError('Network error connecting to server')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-bg p-4">
      <Aurora tone="mix" strong />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-md rounded-4xl border border-line bg-surface p-8 shadow-pop"
      >
        <div className="mb-6 flex flex-col items-center text-center">
          <LogoMark size={56} />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-fg">Welcome back</h1>
          <p className="mt-1 text-sm text-muted">Sign in to the Netrika Trace SOC dashboard</p>
        </div>

        {error && (
          <div role="alert" className="mb-5 rounded-xl bg-danger-soft p-3 text-center text-sm font-medium text-danger-fg">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-fg">Email address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
              <input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} required />
            </div>
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-fg">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
              <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} required />
            </div>
          </div>
          <Button type="submit" variant="primary" disabled={loading} className="h-11 w-full">
            {loading ? 'Authenticating…' : 'Sign in'}
            {!loading && <ArrowRight className="h-4 w-4" />}
          </Button>
        </form>

        <div className="mt-6 flex justify-center opacity-90">
          <Character who="kavi" pose="wave" size={84} interactive />
        </div>
      </motion.div>
    </div>
  )
}
