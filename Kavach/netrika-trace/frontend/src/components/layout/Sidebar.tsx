import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, ChevronsUpDown, PanelLeftClose, PanelLeftOpen, ShieldCheck, Puzzle } from 'lucide-react'
import { useStats } from '../../hooks/useIncidents'
import { LogoMark } from '../ui/Logo'
import Button from '../ui/Button'
import Modal from '../ui/Modal'
import Tooltip from '../ui/Tooltip'
import { cn } from '../ui/cn'
import { MAIN_NAV, WORKFLOW_NAV, getUser, type NavItem } from './nav'

interface Props {
  collapsed: boolean
  onToggleCollapsed: () => void
  /** Called after navigation, so the mobile drawer can close. */
  onNavigate?: () => void
  isDrawer?: boolean
}

function NavRow({ item, collapsed, badge, onNavigate }: { item: NavItem; collapsed: boolean; badge?: string | null; onNavigate?: () => void }) {
  const { pathname } = useLocation()
  const inGroup = item.children ? pathname.startsWith(item.to) : false
  const [open, setOpen] = useState(inGroup)
  const Icon = item.icon

  const rowClass = (active: boolean) =>
    cn(
      'group relative flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium outline-none transition-colors',
      active ? 'text-accent-fg' : 'text-muted hover:bg-subtle hover:text-fg',
      collapsed && 'justify-center px-0',
    )

  const inner = (active: boolean) => (
    <>
      {active && (
        <motion.span layoutId="nav-active" className="absolute inset-0 rounded-xl bg-accent-soft" transition={{ type: 'spring', stiffness: 400, damping: 34 }} />
      )}
      <Icon className="relative h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />
      {!collapsed && <span className="relative flex-1 truncate">{item.label}</span>}
      {!collapsed && badge && <span className="relative rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-white tabular-nums">{badge}</span>}
    </>
  )

  if (item.children && !collapsed) {
    return (
      <div>
        <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={cn(rowClass(inGroup), 'w-full')}>
          {inner(inGroup && !open)}
          <ChevronDown className={cn('relative h-4 w-4 transition-transform', open && 'rotate-180')} />
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="ml-[26px] mt-1 flex flex-col gap-0.5 border-l border-line pl-3">
                {item.children.map((c) => (
                  <NavLink
                    key={c.to}
                    to={c.to}
                    end
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn('rounded-lg px-3 py-1.5 text-[13px] transition-colors', isActive ? 'font-medium text-accent-fg' : 'text-muted hover:text-fg')
                    }
                  >
                    {c.label}
                  </NavLink>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  const link = (
    <NavLink to={item.to} end={item.to === '/dashboard' || !!item.children} onClick={onNavigate} className={({ isActive }) => rowClass(isActive)} aria-label={item.label}>
      {({ isActive }) => inner(isActive)}
    </NavLink>
  )
  return collapsed ? <Tooltip label={item.label}>{link}</Tooltip> : link
}

export default function Sidebar({ collapsed, onToggleCollapsed, onNavigate, isDrawer }: Props) {
  const { data } = useStats()
  const [setupOpen, setSetupOpen] = useState(false)
  const total = data?.stats.total ?? 0
  const badge = total > 99 ? '99+' : total > 0 ? String(total) : null
  const user = getUser()
  const compact = collapsed && !isDrawer

  return (
    <aside
      aria-label="Primary"
      className={cn(
        'flex h-full shrink-0 flex-col gap-4 overflow-y-auto rounded-2xl border border-line bg-surface p-3 shadow-card hide-scrollbar transition-[width] duration-300 ease-smooth',
        compact ? 'w-[76px]' : 'w-[260px]',
      )}
    >
      <div className={cn('flex items-center gap-2', compact && 'flex-col')}>
        <button
          type="button"
          aria-label="Workspace"
          className={cn('flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-line bg-subtle/60 p-2 text-left transition-colors hover:bg-subtle', compact && 'flex-none border-0 bg-transparent p-1')}
        >
          <LogoMark size={36} />
          {!compact && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] leading-tight text-muted">{user.role ? user.role : 'Workspace'}</span>
                <span className="block truncate text-sm font-semibold leading-tight text-fg">Netrika Trace</span>
              </span>
              <ChevronsUpDown className="h-4 w-4 shrink-0 text-faint" />
            </>
          )}
        </button>
        {!isDrawer && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-subtle hover:text-fg lg:flex"
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        )}
      </div>

      <nav aria-label="Main" className="flex flex-col gap-1">
        {MAIN_NAV.map((item) => (
          <NavRow key={item.to} item={item} collapsed={compact} badge={item.to === '/incidents' ? badge : null} onNavigate={onNavigate} />
        ))}
      </nav>

      <div className="h-px bg-line" />

      <nav aria-label="Workflows" className="flex flex-col gap-1">
        {!compact && <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-faint">Workflows</div>}
        {WORKFLOW_NAV.map((item) => (
          <NavRow key={item.to} item={item} collapsed={compact} onNavigate={onNavigate} />
        ))}
      </nav>

      <div className="mt-auto">
        {compact ? (
          <Tooltip label="Install extension">
            <button type="button" aria-label="Install browser extension" onClick={() => setSetupOpen(true)} className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent-fg">
              <Puzzle className="h-5 w-5" />
            </button>
          </Tooltip>
        ) : (
          <div className="rounded-2xl border border-line bg-subtle/60 p-4">
            <svg viewBox="0 0 120 60" className="mb-3 h-14 w-full" aria-hidden="true">
              <rect x="14" y="10" width="64" height="40" rx="8" fill="#4F46E5" transform="rotate(-8 46 30)" />
              <rect x="40" y="14" width="64" height="40" rx="8" fill="#818CF8" transform="rotate(6 72 34)" />
              <rect x="48" y="26" width="22" height="5" rx="2.5" fill="#fff" opacity=".85" transform="rotate(6 72 34)" />
              <circle cx="96" cy="42" r="9" fill="#10B981" />
              <path d="m92 42 3 3 5-6" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="text-sm font-semibold leading-snug text-fg">Protect every browser with the Kavach extension</p>
            <Button variant="dark" className="mt-3 w-full" onClick={() => setSetupOpen(true)}>
              Set up now
            </Button>
          </div>
        )}
      </div>

      <Modal open={setupOpen} title="Install the Kavach extension" onClose={() => setSetupOpen(false)}>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted">
          <li>Open <span className="font-medium text-fg">chrome://extensions</span> and enable Developer mode.</li>
          <li>Choose <span className="font-medium text-fg">Load unpacked</span> and select the project&apos;s <code className="rounded bg-subtle px-1">extension</code> folder.</li>
          <li>Pin Netrika Trace and sign in from the popup.</li>
        </ol>
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-success-soft px-3 py-2 text-sm text-success-fg">
          <ShieldCheck className="h-4 w-4" /> Prompts are scanned before they leave the browser.
        </div>
      </Modal>
    </aside>
  )
}
