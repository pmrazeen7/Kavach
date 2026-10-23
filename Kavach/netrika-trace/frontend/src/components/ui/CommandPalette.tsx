import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { CornerDownLeft, LogOut, Moon, Search as SearchIcon, Sun } from 'lucide-react'
import { MAIN_NAV, WORKFLOW_NAV } from '../layout/nav'
import { useTheme } from '../../lib/theme'
import { cn } from './cn'

interface Command {
  id: string
  label: string
  hint: string
  icon: React.ReactNode
  run: () => void
}

export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const { theme, toggle } = useTheme()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const commands = useMemo<Command[]>(() => {
    const go = (to: string) => () => navigate(to)
    const pages = [...MAIN_NAV, ...WORKFLOW_NAV].map<Command>((n) => ({
      id: n.to,
      label: n.label,
      hint: 'Go to page',
      icon: <n.icon className="h-4 w-4" />,
      run: go(n.to),
    }))
    return [
      ...pages,
      { id: 'theme', label: theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode', hint: 'Appearance', icon: theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />, run: toggle },
      {
        id: 'logout',
        label: 'Log out',
        hint: 'Account',
        icon: <LogOut className="h-4 w-4" />,
        run: () => {
          localStorage.removeItem('netrika_token')
          localStorage.removeItem('netrika_user')
          navigate('/login')
        },
      },
    ]
  }, [navigate, theme, toggle])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? commands.filter((c) => c.label.toLowerCase().includes(q)) : commands
    // Free text falls through to the global search page.
    return q
      ? [...list, { id: 'search', label: `Search incidents for "${query.trim()}"`, hint: 'Search', icon: <SearchIcon className="h-4 w-4" />, run: () => navigate(`/search?q=${encodeURIComponent(query.trim())}`) }]
      : list
  }, [commands, query, navigate])

  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      setTimeout(() => inputRef.current?.focus(), 20)
    }
  }, [open])

  useEffect(() => setActive(0), [query])

  const choose = (c?: Command) => {
    if (!c) return
    onClose()
    c.run()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') choose(results[active])
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[95] flex items-start justify-center bg-gray-900/40 px-4 pt-[14vh] backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            onKeyDown={onKeyDown}
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-surface shadow-pop"
            initial={{ y: -12, scale: 0.97 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: -8, opacity: 0 }}
          >
            <div className="flex items-center gap-3 border-b border-line px-4">
              <SearchIcon className="h-4 w-4 text-faint" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type a command or search…"
                aria-label="Command search"
                className="h-12 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-faint"
              />
              <kbd className="rounded-md border border-line px-1.5 py-0.5 text-[11px] text-faint">Esc</kbd>
            </div>
            <ul role="listbox" className="max-h-72 overflow-y-auto p-2">
              {results.map((c, i) => (
                <li key={c.id} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(c)}
                    className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm', i === active ? 'bg-accent-soft text-accent-fg' : 'text-fg')}
                  >
                    <span className="text-muted">{c.icon}</span>
                    <span className="flex-1 truncate">{c.label}</span>
                    <span className="text-xs text-faint">{c.hint}</span>
                    {i === active && <CornerDownLeft className="h-3.5 w-3.5" />}
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
