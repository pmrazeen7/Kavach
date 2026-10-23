import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import PageLoader from './components/PageLoader'
import Landing from './pages/Landing'

const Layout = lazy(() => import('./components/layout/Layout'))
const Login = lazy(() => import('./pages/Login'))
const WarRoom = lazy(() => import('./pages/WarRoom'))
const IncidentDetail = lazy(() => import('./pages/IncidentDetail'))
const Incidents = lazy(() => import('./pages/Incidents'))
const Compliance = lazy(() => import('./pages/Compliance'))
const Policy = lazy(() => import('./pages/Policy'))
const ChatLLM = lazy(() => import('./pages/ChatLLM'))
const Devices = lazy(() => import('./pages/Devices'))
const Evaluation = lazy(() => import('./pages/Evaluation'))
const Search = lazy(() => import('./pages/Search'))
const NotFound = lazy(() => import('./pages/NotFound'))

function LazyPage({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<LazyPage><Login /></LazyPage>} />
        <Route element={<LazyPage><Layout /></LazyPage>}>
          <Route path="/dashboard" element={<LazyPage><WarRoom /></LazyPage>} />
          <Route path="/incidents" element={<LazyPage><Incidents /></LazyPage>} />
          <Route path="/incidents/latest" element={<LazyPage><Incidents /></LazyPage>} />
          <Route path="/incidents/:id" element={<LazyPage><IncidentDetail /></LazyPage>} />
          <Route path="/compliance" element={<LazyPage><Compliance /></LazyPage>} />
          <Route path="/policy" element={<LazyPage><Policy /></LazyPage>} />
          <Route path="/chat" element={<LazyPage><ChatLLM /></LazyPage>} />
          <Route path="/devices" element={<LazyPage><Devices /></LazyPage>} />
          <Route path="/evaluation" element={<LazyPage><Evaluation /></LazyPage>} />
          <Route path="/search" element={<LazyPage><Search /></LazyPage>} />
        </Route>
        <Route path="*" element={<LazyPage><NotFound /></LazyPage>} />
      </Routes>
    </BrowserRouter>
  )
}
