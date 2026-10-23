import { Outlet } from 'react-router-dom'
import { Navigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import Sidebar from './Sidebar'
import { useWebSocket } from '../../hooks/useWebSocket'

export default function Layout() {
  const location = useLocation()
  const authenticated = Boolean(localStorage.getItem('netrika_token'))
  useWebSocket(authenticated)

  if (!authenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return (
    <div className="min-h-screen bg-bg font-sans text-text flex justify-center items-center relative overflow-hidden p-3 md:p-5">
      {/* Soft vignette */}
      <div
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(249,115,22,0.12) 0%, transparent 45%), radial-gradient(ellipse 60% 50% at 100% 100%, rgba(107,155,122,0.08) 0%, transparent 40%)',
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="w-[96vw] max-w-[1440px] h-[92vh] min-h-[640px] bg-grapho-surface/90 border border-white/[0.07] rounded-[28px] shadow-glass flex overflow-hidden relative z-10"
      >
        <Sidebar />

        <main className="flex-1 overflow-hidden relative flex min-w-0">
          <div className="flex-1 overflow-y-auto hide-scrollbar min-h-0 px-6 py-7 lg:px-8">
            <Outlet />
          </div>
        </main>
      </motion.div>
    </div>
  )
}
