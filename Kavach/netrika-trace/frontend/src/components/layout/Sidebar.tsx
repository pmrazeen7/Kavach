import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import { PanelLeftClose, PanelLeftOpen, Puzzle, ShieldCheck } from 'lucide-react'
import { useStats } from '../../hooks/useIncidents'
import { useDevices, useMe } from '../../hooks/useWorkspace'
import { LogoMark } from '../ui/Logo'
import Button from '../ui/Button'
import Drawer from '../ui/Drawer'
import Tooltip from '../ui/Tooltip'
import Character from '../ui/Character'
import { cn } from '../ui/cn'
import { NAV_SECTIONS, getUser, type NavItem } from './nav'

interface Props {
  collapsed: boolean
  onToggleCollapsed: () => void
  /** Called after navigation, so the mobile drawer can close. */
  onNavigate?: () => void
  isDrawer?: boolean
}

function NavRow({ item, collapsed, badge, onNavigate }: { item: NavItem; collapsed: boolean; badge?: string | null; onNavigate?: () => void }) {
  const Icon = item.icon
  const link = (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      aria-label={item.label}
      className={({ isActive }) =>
        cn(
          'group relative flex h-10 items-center gap-3 rounded-xl px-3 text-left text-sm font-medium outline-none transition-colors',
          isActive ? 'text-accent-fg' : 'text-muted hover:bg-subtle hover:text-fg',
          collapsed && 'justify-center px-0',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span layoutId="nav-active" className="absolute inset-0 rounded-xl bg-accent-soft" transition={{ type: 'spring', stiffness: 400, damping: 34 }} />
          )}
          <Icon className="relative h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />
          {!collapsed && <span className="relative flex-1 truncate">{item.label}</span>}
          {!collapsed && badge && <span className="relative rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-on tabular-nums">{badge}</span>}
        </>
      )}
    </NavLink>
  )
  return collapsed ? <Tooltip label={item.label}>{link}</Tooltip> : link
}

export default function Sidebar({ collapsed, onToggleCollapsed, onNavigate, isDrawer }: Props) {
  const { data } = useStats()
  const { data: me } = useMe()
  const { data: devices, isSuccess: devicesLoaded } = useDevices()
  const [setupOpen, setSetupOpen] = useState(false)
  const total = data?.stats.total ?? 0
  const badge = total > 99 ? '99+' : total > 0 ? String(total) : null
  const user = getUser()
  const compact = collapsed && !isDrawer
  const needsExtension = devicesLoaded && devices.length === 0

  return (
    <aside
      aria-label="Primary"
      className={cn(
        'flex h-full shrink-0 flex-col gap-4 overflow-y-auto rounded-3xl border border-line bg-surface p-3 shadow-card hide-scrollbar transition-[width] duration-300 ease-smooth',
        compact ? 'w-[76px]' : 'w-[260px]',
      )}
    >
      <div className={cn('flex items-center gap-2', compact && 'flex-col')}>
        <div className={cn('flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-line bg-subtle/60 p-2', compact && 'flex-none border-0 bg-transparent p-1')}>
          <LogoMark size={36} />
          {!compact && (
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] leading-tight text-muted">{me?.user.role || user.role || 'Workspace'}</span>
              <span className="block truncate text-sm font-semibold leading-tight text-fg">{me?.organization.name || 'Netrika Trace'}</span>
            </span>
          )}
        </div>
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

      {NAV_SECTIONS.map((section, i) => (
        <div key={section.label}>
          {i > 0 && <div className="mb-4 h-px bg-line" />}
          <nav aria-label={section.label} className="flex flex-col gap-1">
            {!compact && <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-faint">{section.label}</div>}
            {section.items.map((item) => (
              <NavRow key={item.to} item={item} collapsed={compact} badge={item.to === '/incidents' ? badge : null} onNavigate={onNavigate} />
            ))}
          </nav>
        </div>
      ))}

      {needsExtension && (
        <div className="mt-auto">
          {compact ? (
            <Tooltip label="Install the extension">
              <button type="button" aria-label="Install browser extension" onClick={() => setSetupOpen(true)} className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent-fg">
                <Puzzle className="h-5 w-5" />
              </button>
            </Tooltip>
          ) : (
            <div className="rounded-3xl border border-line bg-subtle/60 p-4">
              <div className="-mb-2 flex justify-center"><Character who="scout" pose="wave" size={72} /></div>
              <p className="text-sm font-semibold leading-snug text-fg">No devices yet. Install the Kavach extension to start protecting browsers.</p>
              <Button variant="dark" className="mt-3 w-full" onClick={() => setSetupOpen(true)}>
                Set up now
              </Button>
            </div>
          )}
        </div>
      )}

      <Drawer open={setupOpen} title="Install the Kavach extension" subtitle="Takes about a minute" onClose={() => setSetupOpen(false)}>
        <ol className="list-decimal space-y-3 pl-5 text-sm text-muted">
          <li>Open <span className="font-medium text-fg">chrome://extensions</span> and enable Developer mode.</li>
          <li>Choose <span className="font-medium text-fg">Load unpacked</span> and select the project&apos;s <code className="rounded bg-subtle px-1">extension</code> folder.</li>
          <li>Pin Netrika Trace and sign in from the popup.</li>
        </ol>
        <div className="mt-5 flex items-center gap-2 rounded-xl bg-success-soft px-3 py-2 text-sm text-success-fg">
          <ShieldCheck className="h-4 w-4" /> Prompts are scanned before they leave the browser.
        </div>
      </Drawer>
    </aside>
  )
}
