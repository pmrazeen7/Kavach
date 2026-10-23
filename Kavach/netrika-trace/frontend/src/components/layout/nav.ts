import {
  LayoutDashboard,
  ShieldAlert,
  MonitorSmartphone,
  FileBarChart2,
  SlidersHorizontal,
  MessageSquare,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
}

export interface NavSection {
  label: string
  items: NavItem[]
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Overview',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/incidents', label: 'Incidents', icon: ShieldAlert },
      { to: '/devices', label: 'Devices', icon: MonitorSmartphone },
    ],
  },
  {
    label: 'Govern',
    items: [
      { to: '/detection', label: 'Detection', icon: SlidersHorizontal },
      { to: '/reports', label: 'Reports', icon: FileBarChart2 },
      { to: '/chat', label: 'AI Chat sandbox', icon: MessageSquare },
    ],
  },
]

export const ALL_NAV: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items)

export function getUser(): { email?: string; role?: string; name?: string } {
  try {
    return JSON.parse(localStorage.getItem('netrika_user') || '{}')
  } catch {
    return {}
  }
}

/** Display name from whatever the login payload gave us. */
export function displayName(user: { email?: string; name?: string }): string {
  const raw = user.name || (user.email ? user.email.split('@')[0] : '')
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : ''
}

export function greeting(date = new Date()): string {
  const h = date.getHours()
  return h < 5 ? 'Working late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}
