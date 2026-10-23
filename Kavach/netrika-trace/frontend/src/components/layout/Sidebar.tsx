import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  LayoutDashboard,
  ClipboardList,
  Search,
  MessageSquare,
  Cog,
  Store,
  User,
} from 'lucide-react'
import { useStats } from '../../hooks/useIncidents'

const NAV_ITEMS: {
  to: string
  label: string
  icon: typeof LayoutDashboard
  badge?: (stats: { total: number; blocked: number }) => string | null
}[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/search', label: 'Global Search', icon: Search },
  {
    to: '/compliance',
    label: 'Compliance',
    icon: ClipboardList,
  },
  {
    to: '/incidents',
    label: 'Incidents',
    icon: Search,
    badge: (s) => (s.total > 99 ? '99+' : s.total > 0 ? String(s.total) : null),
  },
  { to: '/devices', label: 'Devices', icon: Store },
  { to: '/evaluation', label: 'Model Evaluation', icon: User },
  {
    to: '/chat',
    label: 'LLM Chat',
    icon: MessageSquare,
    badge: () => null,
  },
  { to: '/policy', label: 'Policy', icon: Cog },
]

export default function Sidebar() {
  const { data: statsData } = useStats()
  const s = statsData?.stats || { total: 0, blocked: 0, warned: 0, allowed: 0 }

  return (
    <div
      className="w-[238px] flex flex-col py-8 px-4 border-r border-white/[0.06] shrink-0 bg-grapho-surface-2/50"
      id="sidebar"
    >
      <div className="flex items-center gap-3 mb-10 px-2">
        <motion.div
          className="w-10 h-10 rounded-2xl bg-gradient-to-br from-grapho-orange to-orange-700 flex items-center justify-center shadow-lg shadow-orange-900/40"
          whileHover={{ scale: 1.04 }}
          transition={{ type: 'spring', stiffness: 400, damping: 24 }}
        >
          <span className="w-4 h-4 rounded-full bg-white/90 ring-2 ring-white/30" />
        </motion.div>
        <div className="flex flex-col">
          <span className="font-bold text-lg leading-tight tracking-tight text-text">Netrika</span>
          <span className="text-[9px] font-semibold text-grapho-orange uppercase tracking-[0.2em] leading-none">
            trace
          </span>
        </div>
      </div>

      <nav className="flex-1 flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/dashboard'}
            className={({ isActive }) =>
              `relative flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-colors duration-300 ease-smooth group outline-none ${
                isActive ? 'text-text' : 'text-text-dim hover:text-text'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.div
                    layoutId="sidebar-active-pill"
                    className="absolute inset-0 rounded-2xl bg-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  />
                )}
                <item.icon
                  className={`relative z-10 w-[18px] h-[18px] transition-transform duration-300 ease-smooth ${
                    isActive ? 'text-grapho-orange' : 'group-hover:scale-105'
                  }`}
                  strokeWidth={isActive ? 2.2 : 1.75}
                />
                <span className="relative z-10 text-[13px] font-medium flex-1">{item.label}</span>
                {item.badge?.(s) && (
                  <span className="relative z-10 text-[10px] font-bold px-2 py-0.5 rounded-full bg-grapho-orange/20 text-grapho-orange tabular-nums">
                    {item.badge(s)}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

    </div>
  )
}
