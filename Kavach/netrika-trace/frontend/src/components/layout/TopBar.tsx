import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Bell, LogOut, Menu, Moon, Search, Sun } from 'lucide-react'
import { useIncidentStore } from '../../stores/incidentStore'
import { useTheme } from '../../lib/theme'
import IconButton from '../ui/IconButton'
import { DecisionBadge } from '../ui/Badge'
import { cn } from '../ui/cn'
import { getUser } from './nav'

interface Props {
  onOpenPalette: () => void
  onOpenDrawer: () => void
}

function useOutside(ref: React.RefObject<HTMLElement>, onOut: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onOut()
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [ref, onOut, active])
}

export default function TopBar({ onOpenPalette, onOpenDrawer }: Props) {
  const navigate = useNavigate()
  const { theme, toggle } = useTheme()
  const wsConnected = useIncidentStore((s) => s.wsConnected)
  const incidents = useIncidentStore((s) => s.incidents)
  const [bellOpen, setBellOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const bellRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  useOutside(bellRef, () => setBellOpen(false), bellOpen)
  useOutside(menuRef, () => setMenuOpen(false), menuOpen)

  const user = getUser()
  const initial = (user.name || user.email || 'U').charAt(0).toUpperCase()
  const alerts = incidents.filter((i) => i.decision !== 'ALLOW').slice(0, 6)
  const mac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)

  const logout = () => {
    localStorage.removeItem('netrika_token')
    localStorage.removeItem('netrika_user')
    navigate('/login')
  }

  return (
    <header className="flex shrink-0 items-center gap-3">
      <IconButton label="Open menu" className="lg:hidden" onClick={onOpenDrawer}>
        <Menu className="h-5 w-5" />
      </IconButton>

      <button
        type="button"
        onClick={onOpenPalette}
        aria-label="Search or run a command"
        className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-left text-sm text-faint transition-colors hover:border-faint md:max-w-md"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate">Search incidents, pages…</span>
        <kbd className="hidden rounded-md border border-line px-1.5 py-0.5 text-[11px] font-medium text-muted sm:block">{mac ? '⌘' : 'Ctrl'} K</kbd>
      </button>

      <div className="ml-auto flex items-center gap-2">
        <span
          className="hidden items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-muted sm:flex"
          title={wsConnected ? 'Live feed connected' : 'Live feed offline, polling'}
        >
          <span className={cn('h-2 w-2 rounded-full', wsConnected ? 'bg-success dot-blink' : 'bg-warn')} />
          {wsConnected ? 'Live' : 'Polling'}
        </span>

        <div ref={bellRef} className="relative">
          <IconButton label="Notifications" aria-expanded={bellOpen} onClick={() => setBellOpen((o) => !o)}>
            <Bell className="h-[18px] w-[18px]" />
            {alerts.length > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-danger ring-2 ring-surface" />}
          </IconButton>
          <AnimatePresence>
            {bellOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="absolute right-0 top-12 z-50 w-80 rounded-2xl border border-line bg-surface p-2 shadow-pop"
              >
                <div className="px-3 py-2 text-sm font-semibold text-fg">Live alerts</div>
                {alerts.length === 0 ? (
                  <p className="px-3 pb-3 text-sm text-muted">No blocked or warned requests since you opened the dashboard.</p>
                ) : (
                  alerts.map((a) => (
                    <Link key={a.id} to={`/incidents/${a.id}`} onClick={() => setBellOpen(false)} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm hover:bg-subtle">
                      <span className="min-w-0 truncate text-fg">{a.target_host || 'Unknown host'}</span>
                      <DecisionBadge decision={a.decision} />
                    </Link>
                  ))
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <IconButton label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onClick={toggle}>
          {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
        </IconButton>

        <div ref={menuRef} className="relative">
          <button
            type="button"
            aria-label="Account menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 text-sm font-semibold text-white"
          >
            {initial}
          </button>
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="absolute right-0 top-12 z-50 w-56 rounded-2xl border border-line bg-surface p-2 shadow-pop"
              >
                <div className="px-3 py-2">
                  <div className="truncate text-sm font-medium text-fg">{user.email || 'Signed in'}</div>
                  {user.role && <div className="text-xs text-muted">{user.role}</div>}
                </div>
                <button type="button" onClick={logout} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-danger-fg hover:bg-danger-soft">
                  <LogOut className="h-4 w-4" /> Log out
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  )
}
