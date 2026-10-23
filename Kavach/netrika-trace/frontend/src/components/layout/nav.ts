import {
  LayoutDashboard,
  ShieldAlert,
  Search,
  MonitorSmartphone,
  ClipboardCheck,
  SlidersHorizontal,
  FlaskConical,
  MessageSquare,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
  children?: { to: string; label: string }[]
}

export const MAIN_NAV: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  {
    to: '/incidents',
    label: 'Incidents',
    icon: ShieldAlert,
    children: [
      { to: '/incidents', label: 'All incidents' },
      { to: '/incidents/latest', label: 'Latest' },
    ],
  },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/devices', label: 'Devices', icon: MonitorSmartphone },
  { to: '/compliance', label: 'Compliance', icon: ClipboardCheck },
]

export const WORKFLOW_NAV: NavItem[] = [
  { to: '/policy', label: 'Policy', icon: SlidersHorizontal },
  { to: '/evaluation', label: 'Model Evaluation', icon: FlaskConical },
  { to: '/chat', label: 'LLM Chat', icon: MessageSquare },
]

export function getUser(): { email?: string; role?: string; name?: string } {
  try {
    return JSON.parse(localStorage.getItem('netrika_user') || '{}')
  } catch {
    return {}
  }
}
