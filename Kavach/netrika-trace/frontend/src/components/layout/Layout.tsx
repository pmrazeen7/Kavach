import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import CommandPalette from '../ui/CommandPalette'
import { ToastViewport } from '../ui/Toast'
import { useWebSocket } from '../../hooks/useWebSocket'

function readCollapsed() {
  try {
    return localStorage.getItem('netrika_sidebar') === '1'
  } catch {
    return false
  }
}

export default function Layout() {
  const location = useLocation()
  const authenticated = Boolean(localStorage.getItem('netrika_token'))
  useWebSocket(authenticated)

  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [drawer, setDrawer] = useState(false)
  const [palette, setPalette] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette((p) => !p)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => setDrawer(false), [location.pathname])

  const toggleCollapsed = () =>
    setCollapsed((c) => {
      try { localStorage.setItem('netrika_sidebar', c ? '0' : '1') } catch { /* ignore */ }
      return !c
    })

  if (!authenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return (
    <div className="flex h-[100dvh] gap-3 bg-bg p-3 font-sans text-fg">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-white">
        Skip to content
      </a>

      <div className="hidden lg:block">
        <Sidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      </div>

      <AnimatePresence>
        {drawer && (
          <motion.div className="fixed inset-0 z-[80] lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={() => setDrawer(false)} aria-hidden="true" />
            <motion.div className="absolute inset-y-3 left-3" initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }} transition={{ type: 'spring', stiffness: 360, damping: 36 }}>
              <Sidebar collapsed={false} isDrawer onToggleCollapsed={() => setDrawer(false)} onNavigate={() => setDrawer(false)} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <TopBar onOpenPalette={() => setPalette(true)} onOpenDrawer={() => setDrawer(true)} />
        <main id="main" className="min-h-0 flex-1 overflow-y-auto rounded-2xl">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="pb-4"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <CommandPalette open={palette} onClose={() => setPalette(false)} />
      <ToastViewport />
    </div>
  )
}
