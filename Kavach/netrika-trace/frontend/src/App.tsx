import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import PageLoader from './components/PageLoader'
import Landing from './pages/Landing'
import { ToastViewport } from './components/ui/Toast'

const Layout = lazy(() => import('./components/layout/Layout'))
const Login = lazy(() => import('./pages/Login'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Incidents = lazy(() => import('./pages/Incidents'))
const IncidentDetail = lazy(() => import('./pages/IncidentDetail'))
const Devices = lazy(() => import('./pages/Devices'))
const Detection = lazy(() => import('./pages/Detection'))
const Reports = lazy(() => import('./pages/Reports'))
const Chat = lazy(() => import('./pages/Chat'))
const StyleGuide = lazy(() => import('./pages/StyleGuide'))
const NotFound = lazy(() => import('./pages/NotFound'))

function LazyPage({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>
}

/** Old URLs (and bookmarks) keep working. */
function Redirect({ to }: { to: string }) {
  const { search } = useLocation()
  return <Navigate to={`${to}${search}`} replace />
}

function IncidentRedirect() {
  const { id } = useParams()
  return <Navigate to={`/incidents/${id}`} replace />
}

/** Fades between the three top-level areas (landing, login, app). */
function AnimatedRoutes() {
  const location = useLocation()
  const area = location.pathname === '/' ? 'landing' : location.pathname === '/login' ? 'login' : location.pathname === '/style-guide' ? 'guide' : 'app'
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={area} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
        <Routes location={location}>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<LazyPage><Login /></LazyPage>} />
          <Route path="/style-guide" element={<LazyPage><StyleGuide /></LazyPage>} />
          <Route element={<LazyPage><Layout /></LazyPage>}>
            <Route path="/dashboard" element={<LazyPage><Dashboard /></LazyPage>} />
            <Route path="/incidents" element={<LazyPage><Incidents /></LazyPage>} />
            <Route path="/incidents/latest" element={<Redirect to="/incidents" />} />
            <Route path="/incidents/:id" element={<LazyPage><IncidentDetail /></LazyPage>} />
            <Route path="/devices" element={<LazyPage><Devices /></LazyPage>} />
            <Route path="/detection" element={<LazyPage><Detection /></LazyPage>} />
            <Route path="/reports" element={<LazyPage><Reports /></LazyPage>} />
            <Route path="/chat" element={<LazyPage><Chat /></LazyPage>} />
            <Route path="/search" element={<Redirect to="/incidents" />} />
            <Route path="/compliance" element={<Redirect to="/reports" />} />
            <Route path="/policy" element={<Redirect to="/detection" />} />
            <Route path="/evaluation" element={<Navigate to="/detection?tab=quality" replace />} />
            <Route path="/incident/:id" element={<IncidentRedirect />} />
          </Route>
          <Route path="*" element={<LazyPage><NotFound /></LazyPage>} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AnimatedRoutes />
      <ToastViewport />
    </BrowserRouter>
  )
}
