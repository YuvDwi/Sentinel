import { useState, useEffect } from 'react'
import { Routes, Route, useLocation, Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Layout } from './Layout'
import { Login } from './pages/Login'
import { Signup } from './pages/Signup'
import { Overview } from './pages/Overview'
import { Tracing } from './pages/Tracing'
import { MetricsExplorer } from './pages/MetricsExplorer'
import { Assistant } from './pages/Assistant'
import { Button } from '../components/ui/button'

type SummaryResponse = {
  region: string
  tenant: string
  window: string
  generated_at: string
  databases: { p95_ms: number; p99_ms: number; active_connections: number; max_connections: number; replication_lag_sec: number; health: string }
  redis: { hit_ratio: number; mem_used_mb: number; evictions: number; health: string }
  queues: { queue_depth: number; consumer_lag: number; oldest_age_sec: number; health: string }
  search: { cluster_status: string; red_indices: number; yellow_indices: number; query_p95_ms: number; health: string }
}

type TopQuery = {
  fingerprint: string
  sample_query: string
  calls: number
  mean_ms: number
  p95_ms: number
  p99_ms: number
  total_time_ms: number
  rows: number
}

type TopQueriesResponse = {
  region: string
  tenant: string
  window: string
  queries: TopQuery[]
}

async function fetchJSON<T>(path: string, token: string): Promise<T> {
  const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// Protected route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth()
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

export function App() {
  const location = useLocation()
  const { isAuthenticated, token: authToken, login } = useAuth()
  const [region, setRegion] = useState('us-east-1')
  const [tenant, setTenant] = useState('enterprise_123')
  const [windowSel, setWindowSel] = useState<'5m'|'1h'|'24h'>('1h')
  
  // Shared data fetching
  const [data, setData] = useState<SummaryResponse | null>(null)
  const [topQueries, setTopQueries] = useState<TopQuery[]>([])
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())
  
  // Use auth token from context, fallback to env for development
  const token = authToken || import.meta.env.VITE_ADMIN_TOKEN || 'dev-admin-token'

  // Determine current page title based on route
  const getPageTitle = () => {
    switch (location.pathname) {
      case '/':
        return 'Overview'
      case '/tracing':
        return 'Tracing'
      case '/metrics':
        return 'Query Builder'
      default:
        return 'Overview'
    }
  }

  const pageTitle = getPageTitle()

  const fetchData = () => {
    setError(null)
    
    fetchJSON<SummaryResponse>(`/api/v1/summary?region=${region}&tenant=${tenant}&window=${windowSel}`, token)
      .then(d => {
        setData(d)
        setLastUpdate(new Date())
      })
      .catch(e => setError(String(e)))
    
    fetchJSON<TopQueriesResponse>(`/api/v1/db/pg/top-queries?region=${region}&tenant=${tenant}&limit=5`, token)
      .then(d => setTopQueries(d.queries))
      .catch(() => setTopQueries([]))
  }

  useEffect(() => {
    if (isAuthenticated) {
      fetchData()
      const interval = setInterval(fetchData, 5000)
      return () => clearInterval(interval)
    }
  }, [region, tenant, windowSel, isAuthenticated])

  // If not authenticated and not on login/signup page, show login
  if (!isAuthenticated && location.pathname !== '/login' && location.pathname !== '/signup') {
    return <Login onLogin={login} />
  }

  // If authenticated and on login/signup page, redirect to dashboard
  if (isAuthenticated && (location.pathname === '/login' || location.pathname === '/signup')) {
    return <Navigate to="/" replace />
  }

  return (
    <Routes>
      <Route path="/login" element={<Login onLogin={login} />} />
      <Route path="/signup" element={<Signup onSignup={login} />} />
      <Route path="/*" element={
        <ProtectedRoute>
          <Layout>
      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
          {/* Breadcrumb and title */}
          <div className={`${location.pathname === '/assistant' ? 'px-0 pt-0 pb-0' : 'px-6 pt-6 pb-4'} ${location.pathname === '/assistant' ? 'border-b border-border' : ''}`}>
            {location.pathname === '/assistant' ? (
              <div className="px-6 py-6">
                <h1 className="text-2xl font-semibold">Copilot</h1>
                <p className="text-sm text-foreground/60 mt-1">Ask questions about your application's health and performance</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
                  <span>Observability Dashboard</span>
                  <span>›</span>
                  <span className="text-foreground">{pageTitle}</span>
                </div>
                <h1 className="text-2xl font-semibold">{pageTitle}</h1>
              </>
            )}
          </div>

          {/* Separator line */}
          {location.pathname !== '/assistant' && (
            <div className="border-b border-border" />
          )}

              {/* Scrollable content */}
              <div className={`flex-1 overflow-y-auto bg-[#050505] ${location.pathname === '/assistant' ? '' : 'px-6 py-4'}`}>
                <Routes>
                  <Route path="/" element={<Overview region={region} tenant={tenant} windowSel={windowSel} data={data} topQueries={topQueries} error={error} lastUpdate={lastUpdate} />} />
                  <Route path="/tracing" element={<Tracing region={region} tenant={tenant} windowSel={windowSel} />} />
                  <Route path="/metrics" element={<MetricsExplorer region={region} tenant={tenant} windowSel={windowSel} />} />
                  <Route path="/assistant" element={<Assistant />} />
                </Routes>
              </div>
            </div>
          </Layout>
        </ProtectedRoute>
      } />
    </Routes>
  )
}
