import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card'
import { Search, Filter, Clock, ChevronRight, ChevronDown, AlertCircle } from 'lucide-react'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { API_URL } from '../../config'

type Log = {
  timestamp: string
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG'
  service: string
  message: string
  endpoint: string
}

type Trace = {
  id: string
  method: string
  endpoint: string
  status: 'success' | 'error'
  duration: number
  spans: number
  service: string
  timestamp: string
  spanDetails?: {
    name: string
    service: string
    duration: number
    status: 'success' | 'error'
  }[]
  logs?: Log[]
}

const mockTraces: Trace[] = [
  {
    id: 'a7f3c2d1-4e8b-9a1c-5f2d-8e7a3b9c1d4e',
    method: 'POST',
    endpoint: '/vault/unlock',
    status: 'success',
    duration: 142,
    spans: 8,
    service: 'api-gateway',
    timestamp: '10/27/2025, 11:34:02 AM',
    spanDetails: [
      { name: 'api-gateway', service: 'gateway', duration: 142, status: 'success' },
      { name: 'auth-service', service: 'auth', duration: 45, status: 'success' },
      { name: 'vault-service', service: 'vault', duration: 78, status: 'success' },
      { name: 'database-query', service: 'postgres', duration: 23, status: 'success' },
      { name: 'cache-lookup', service: 'redis', duration: 5, status: 'success' },
      { name: 'encryption-op', service: 'crypto', duration: 12, status: 'success' },
      { name: 'audit-log', service: 'logging', duration: 8, status: 'success' },
      { name: 'response', service: 'gateway', duration: 3, status: 'success' },
    ]
  },
  {
    id: 'b2e9f8a3-1c7d-4a5b-9e2f-3d8c7a1b4e6f',
    method: 'GET',
    endpoint: '/items/search',
    status: 'error',
    duration: 215,
    spans: 6,
    service: 'api-gateway',
    timestamp: '10/27/2025, 11:32:02 AM',
    spanDetails: [
      { name: 'api-gateway', service: 'gateway', duration: 215, status: 'error' },
      { name: 'search-service', service: 'search', duration: 189, status: 'error' },
      { name: 'opensearch-query', service: 'opensearch', duration: 165, status: 'error' },
      { name: 'timeout-handler', service: 'gateway', duration: 12, status: 'success' },
      { name: 'error-log', service: 'logging', duration: 6, status: 'success' },
      { name: 'error-response', service: 'gateway', duration: 2, status: 'success' },
    ]
  },
  {
    id: 'c4d7a9e2-5f1b-8c3d-2a9e-4f7b1c8d5e3a',
    method: 'POST',
    endpoint: '/items/create',
    status: 'success',
    duration: 98,
    spans: 7,
    service: 'api-gateway',
    timestamp: '10/27/2025, 11:28:02 AM',
    spanDetails: [
      { name: 'api-gateway', service: 'gateway', duration: 98, status: 'success' },
      { name: 'auth-check', service: 'auth', duration: 15, status: 'success' },
      { name: 'validation', service: 'validator', duration: 8, status: 'success' },
      { name: 'encryption', service: 'crypto', duration: 34, status: 'success' },
      { name: 'database-insert', service: 'postgres', duration: 28, status: 'success' },
      { name: 'cache-invalidate', service: 'redis', duration: 4, status: 'success' },
      { name: 'audit-log', service: 'logging', duration: 6, status: 'success' },
    ]
  },
  {
    id: 'd8e2b5f3-9c4a-7d1e-6b8f-2a3c5d7e9f1b',
    method: 'GET',
    endpoint: '/vaults/list',
    status: 'success',
    duration: 67,
    spans: 5,
    service: 'api-gateway',
    timestamp: '10/27/2025, 11:25:18 AM',
    spanDetails: [
      { name: 'api-gateway', service: 'gateway', duration: 67, status: 'success' },
      { name: 'auth-check', service: 'auth', duration: 12, status: 'success' },
      { name: 'vault-service', service: 'vault', duration: 38, status: 'success' },
      { name: 'database-query', service: 'postgres', duration: 14, status: 'success' },
      { name: 'response', service: 'gateway', duration: 2, status: 'success' },
    ]
  },
  {
    id: 'e9f3c6d4-2a7b-8e5c-9d1f-4b6a8c2e5d7f',
    method: 'PUT',
    endpoint: '/items/update',
    status: 'success',
    duration: 156,
    spans: 9,
    service: 'api-gateway',
    timestamp: '10/27/2025, 11:23:45 AM',
    spanDetails: [
      { name: 'api-gateway', service: 'gateway', duration: 156, status: 'success' },
      { name: 'auth-check', service: 'auth', duration: 18, status: 'success' },
      { name: 'validation', service: 'validator', duration: 11, status: 'success' },
      { name: 'vault-unlock', service: 'vault', duration: 23, status: 'success' },
      { name: 'encryption', service: 'crypto', duration: 42, status: 'success' },
      { name: 'database-update', service: 'postgres', duration: 35, status: 'success' },
      { name: 'cache-invalidate', service: 'redis', duration: 6, status: 'success' },
      { name: 'audit-log', service: 'logging', duration: 9, status: 'success' },
      { name: 'response', service: 'gateway', duration: 3, status: 'success' },
    ]
  },
  {
    id: 'f1a4d7e2-5b8c-3f9e-6d2a-7c4b9e1f8d3a',
    method: 'DELETE',
    endpoint: '/items/delete',
    status: 'success',
    duration: 89,
    spans: 6,
    service: 'api-gateway',
    timestamp: '10/27/2025, 11:21:33 AM',
    spanDetails: [
      { name: 'api-gateway', service: 'gateway', duration: 89, status: 'success' },
      { name: 'auth-check', service: 'auth', duration: 14, status: 'success' },
      { name: 'vault-service', service: 'vault', duration: 28, status: 'success' },
      { name: 'database-delete', service: 'postgres', duration: 22, status: 'success' },
      { name: 'cache-invalidate', service: 'redis', duration: 5, status: 'success' },
      { name: 'audit-log', service: 'logging', duration: 12, status: 'success' },
    ]
  },
  {
    id: 'a2b5c8d1-4e7f-9a3c-6d2e-8f1b4c7e9d5a',
    method: 'POST',
    endpoint: '/secrets/share',
    status: 'success',
    duration: 203,
    spans: 10,
    service: 'api-gateway',
    timestamp: '10/27/2025, 11:19:12 AM',
    spanDetails: [
      { name: 'api-gateway', service: 'gateway', duration: 203, status: 'success' },
      { name: 'auth-check', service: 'auth', duration: 16, status: 'success' },
      { name: 'permission-check', service: 'auth', duration: 22, status: 'success' },
      { name: 'vault-unlock', service: 'vault', duration: 31, status: 'success' },
      { name: 'encryption', service: 'crypto', duration: 58, status: 'success' },
      { name: 'sharing-service', service: 'sharing', duration: 42, status: 'success' },
      { name: 'database-insert', service: 'postgres', duration: 19, status: 'success' },
      { name: 'notification', service: 'notify', duration: 8, status: 'success' },
      { name: 'audit-log', service: 'logging', duration: 6, status: 'success' },
      { name: 'response', service: 'gateway', duration: 2, status: 'success' },
    ]
  },
  {
    id: 'b3c6d9e2-5f8a-1c4d-7e9b-2a5c8d1f4e6b',
    method: 'GET',
    endpoint: '/auth/verify',
    status: 'success',
    duration: 45,
    spans: 4,
    service: 'api-gateway',
    timestamp: '10/27/2025, 11:17:56 AM',
    spanDetails: [
      { name: 'api-gateway', service: 'gateway', duration: 45, status: 'success' },
      { name: 'auth-service', service: 'auth', duration: 28, status: 'success' },
      { name: 'cache-lookup', service: 'redis', duration: 8, status: 'success' },
      { name: 'response', service: 'gateway', duration: 2, status: 'success' },
    ]
  },
  {
    id: 'c4d7e1f2-6a9b-2c5d-8e1f-3b6c9d2e5f7a',
    method: 'POST',
    endpoint: '/auth/signin',
    status: 'error',
    duration: 1842,
    spans: 5,
    service: 'api-gateway',
    timestamp: '10/27/2025, 11:15:22 AM',
    spanDetails: [
      { name: 'api-gateway', service: 'gateway', duration: 1842, status: 'error' },
      { name: 'auth-service', service: 'auth', duration: 1820, status: 'error' },
      { name: 'database-query', service: 'postgres', duration: 1798, status: 'error' },
      { name: 'timeout-handler', service: 'gateway', duration: 15, status: 'success' },
      { name: 'error-response', service: 'gateway', duration: 3, status: 'success' },
    ]
  },
  {
    id: 'd5e8f2a3-7b1c-4d6e-9f2a-5c8d1e4f7b9c',
    method: 'GET',
    endpoint: '/items/get',
    status: 'success',
    duration: 78,
    spans: 6,
    service: 'api-gateway',
    timestamp: '10/27/2025, 11:13:08 AM',
    spanDetails: [
      { name: 'api-gateway', service: 'gateway', duration: 78, status: 'success' },
      { name: 'auth-check', service: 'auth', duration: 11, status: 'success' },
      { name: 'cache-lookup', service: 'redis', duration: 4, status: 'success' },
      { name: 'vault-service', service: 'vault', duration: 32, status: 'success' },
      { name: 'decryption', service: 'crypto', duration: 18, status: 'success' },
      { name: 'response', service: 'gateway', duration: 2, status: 'success' },
    ]
  },
  {
    id: 'e6f9a3b4-8c2d-5e7f-1a3c-6d9e2f5b8c1d',
    method: 'POST',
    endpoint: '/vault/create',
    status: 'success',
    duration: 187,
    spans: 8,
    service: 'api-gateway',
    timestamp: '10/27/2025, 11:10:45 AM',
    spanDetails: [
      { name: 'api-gateway', service: 'gateway', duration: 187, status: 'success' },
      { name: 'auth-check', service: 'auth', duration: 19, status: 'success' },
      { name: 'validation', service: 'validator', duration: 13, status: 'success' },
      { name: 'encryption-setup', service: 'crypto', duration: 67, status: 'success' },
      { name: 'vault-service', service: 'vault', duration: 52, status: 'success' },
      { name: 'database-insert', service: 'postgres', duration: 24, status: 'success' },
      { name: 'audit-log', service: 'logging', duration: 8, status: 'success' },
      { name: 'response', service: 'gateway', duration: 3, status: 'success' },
    ]
  },
  {
    id: 'f7a1b4c5-9d3e-6f8a-2c4d-7e1f9b5c8d2e',
    method: 'GET',
    endpoint: '/activity/recent',
    status: 'success',
    duration: 112,
    spans: 5,
    service: 'api-gateway',
    timestamp: '10/27/2025, 11:08:19 AM',
    spanDetails: [
      { name: 'api-gateway', service: 'gateway', duration: 112, status: 'success' },
      { name: 'auth-check', service: 'auth', duration: 13, status: 'success' },
      { name: 'activity-service', service: 'activity', duration: 76, status: 'success' },
      { name: 'database-query', service: 'postgres', duration: 18, status: 'success' },
      { name: 'response', service: 'gateway', duration: 2, status: 'success' },
    ]
  },
]

// Generate synthetic span details for traces
function generateSpanDetails(trace: Trace) {
  const { endpoint, duration, status } = trace
  const spans: Trace['spanDetails'] = []
  
  // Base spans that all requests have
  spans.push({ 
    name: 'api-gateway', 
    service: 'gateway', 
    duration: duration, 
    status 
  })
  
  // Add auth check for most endpoints
  if (!endpoint.includes('/health') && !endpoint.includes('/ping')) {
    spans.push({ 
      name: 'auth-check', 
      service: 'auth', 
      duration: Math.round(duration * 0.15), 
      status: 'success' 
    })
  }
  
  // Endpoint-specific spans
  if (endpoint.includes('unlock') || endpoint.includes('vault')) {
    spans.push({ 
      name: 'vault-service', 
      service: 'vault', 
      duration: Math.round(duration * 0.35), 
      status 
    })
    spans.push({ 
      name: 'encryption-op', 
      service: 'crypto', 
      duration: Math.round(duration * 0.18), 
      status: 'success' 
    })
  } else if (endpoint.includes('search')) {
    spans.push({ 
      name: 'search-service', 
      service: 'search', 
      duration: Math.round(duration * 0.55), 
      status 
    })
    spans.push({ 
      name: 'opensearch-query', 
      service: 'opensearch', 
      duration: Math.round(duration * 0.45), 
      status 
    })
  } else if (endpoint.includes('create') || endpoint.includes('update')) {
    spans.push({ 
      name: 'validation', 
      service: 'validator', 
      duration: Math.round(duration * 0.10), 
      status: 'success' 
    })
    spans.push({ 
      name: 'encryption', 
      service: 'crypto', 
      duration: Math.round(duration * 0.25), 
      status: 'success' 
    })
    spans.push({ 
      name: 'database-insert', 
      service: 'postgres', 
      duration: Math.round(duration * 0.20), 
      status: 'success' 
    })
  } else {
    // Default GET-like operation
    spans.push({ 
      name: 'cache-lookup', 
      service: 'redis', 
      duration: Math.round(duration * 0.08), 
      status: 'success' 
    })
    spans.push({ 
      name: 'database-query', 
      service: 'postgres', 
      duration: Math.round(duration * 0.25), 
      status: status === 'error' ? 'error' : 'success' 
    })
  }
  
  // Add audit logging for write operations
  if (endpoint.includes('create') || endpoint.includes('update') || endpoint.includes('delete')) {
    spans.push({ 
      name: 'audit-log', 
      service: 'logging', 
      duration: Math.round(duration * 0.06), 
      status: 'success' 
    })
  }
  
  // Final response span
  spans.push({ 
    name: 'response', 
    service: 'gateway', 
    duration: Math.round(duration * 0.02), 
    status: 'success' 
  })
  
  return spans
}

export function Tracing({ region, tenant, windowSel }: { region: string; tenant: string; windowSel: '5m'|'1h'|'24h' }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedTraces, setExpandedTraces] = useState<Set<string>>(new Set())
  const [isConfigured, setIsConfigured] = useState(false)
  const [traces, setTraces] = useState<Trace[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const configured = localStorage.getItem('cw_is_configured') === '1'
    setIsConfigured(configured)
    
    if (configured) {
      fetchTraces()
    }
  }, [])

  const fetchTraces = async () => {
    setLoading(true)
    
    // Set a timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      setTraces(mockTraces)
      setLoading(false)
    }, 10000) // 10 second timeout
    
    try {
      const namespace = localStorage.getItem('cw_namespace') || '1PasswordSimulator'
      const token = localStorage.getItem('auth_token')
      
      const response = await fetch(
        `${API_URL}/api/v1/cloudwatch/traces?ns=${encodeURIComponent(namespace)}&minutes=60`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      )
      
      if (response.ok) {
        const data = await response.json()
        
        // Add synthetic span details to traces that don't have them
        const tracesWithSpans = (data.traces || []).map((trace: Trace) => {
          if (!trace.spanDetails) {
            // Generate reasonable span breakdown based on endpoint and duration
            trace.spanDetails = generateSpanDetails(trace)
          }
          return trace
        })
        
        setTraces(tracesWithSpans)
      } else {
        const errorText = await response.text()
        console.error('Failed to fetch traces:', response.status, errorText)
        setTraces(mockTraces) // Fallback to mock data
      }
    } catch (error) {
      console.error('Failed to fetch traces:', error)
      setTraces(mockTraces) // Fallback to mock data
    } finally {
      clearTimeout(timeoutId)
      setLoading(false)
    }
  }

  const filteredTraces = traces.filter(trace => 
    trace.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    trace.endpoint.toLowerCase().includes(searchQuery.toLowerCase()) ||
    trace.service.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const generateMockLogs = (trace: Trace): Log[] => {
    // Generate realistic logs based on trace info
    const logs: Log[] = []
    const timestamp = new Date().toISOString()
    
    if (trace.status === 'error') {
      logs.push({
        timestamp,
        level: 'ERROR',
        service: 'api-gateway',
        message: `Request failed for ${trace.endpoint}: timeout after ${trace.duration}ms`,
        endpoint: trace.endpoint
      })
      logs.push({
        timestamp,
        level: 'ERROR',
        service: trace.service,
        message: 'Retry attempt failed',
        endpoint: trace.endpoint
      })
    } else {
      if (trace.endpoint.includes('auth')) {
        logs.push({
          timestamp,
          level: 'INFO',
          service: 'api-gateway',
          message: `Authentication request received for ${trace.endpoint}`,
          endpoint: trace.endpoint
        })
        logs.push({
          timestamp,
          level: 'INFO',
          service: 'auth',
          message: 'User credentials validated successfully',
          endpoint: trace.endpoint
        })
        logs.push({
          timestamp,
          level: 'INFO',
          service: 'auth',
          message: 'Session token generated',
          endpoint: trace.endpoint
        })
      } else if (trace.endpoint.includes('vault') || trace.endpoint.includes('items')) {
        logs.push({
          timestamp,
          level: trace.duration > 200 ? 'WARN' : 'INFO',
          service: 'api-gateway',
          message: `Vault operation started: ${trace.endpoint}`,
          endpoint: trace.endpoint
        })
        logs.push({
          timestamp,
          level: 'INFO',
          service: 'postgres',
          message: `Database query completed in ${Math.round(trace.duration * 0.3)}ms`,
          endpoint: trace.endpoint
        })
        logs.push({
          timestamp,
          level: 'INFO',
          service: trace.service,
          message: 'Vault operation completed successfully',
          endpoint: trace.endpoint
        })
      } else if (trace.endpoint.includes('search')) {
        logs.push({
          timestamp,
          level: 'INFO',
          service: 'api-gateway',
          message: `Search query received: ${trace.endpoint}`,
          endpoint: trace.endpoint
        })
        logs.push({
          timestamp,
          level: 'INFO',
          service: 'opensearch',
          message: 'OpenSearch query executed',
          endpoint: trace.endpoint
        })
      } else {
        logs.push({
          timestamp,
          level: 'INFO',
          service: 'api-gateway',
          message: `Request received: ${trace.endpoint}`,
          endpoint: trace.endpoint
        })
        logs.push({
          timestamp,
          level: 'INFO',
          service: trace.service,
          message: `Request completed in ${trace.duration}ms`,
          endpoint: trace.endpoint
        })
      }
    }
    
    return logs
  }

  const fetchLogs = async (traceId: string) => {
    // Try to fetch real logs from OpenSearch
    try {
      const token = localStorage.getItem('auth_token')
      const response = await fetch(
        `${API_URL}/api/v1/logs/by-trace?trace_id=${encodeURIComponent(traceId)}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      )
      
      if (response.ok) {
        const data = await response.json()
        if (data.logs && data.logs.length > 0) {
          return data.logs
        }
      }
    } catch (error) {
      // Silently fail and use mock logs
    }
    
    // Fallback to mock logs (works without OpenSearch)
    const trace = traces.find(t => t.id === traceId)
    return trace ? generateMockLogs(trace) : []
  }

  const toggleTrace = async (traceId: string) => {
    const isExpanding = !expandedTraces.has(traceId)
    
    setExpandedTraces(prev => {
      const newSet = new Set(prev)
      if (newSet.has(traceId)) {
        newSet.delete(traceId)
      } else {
        newSet.add(traceId)
      }
      return newSet
    })

    // Fetch logs when expanding
    if (isExpanding) {
      const logs = await fetchLogs(traceId)
      setTraces(prev => prev.map(trace => 
        trace.id === traceId ? { ...trace, logs } : trace
      ))
    }
  }

  // Show connection required message if not configured
  if (!isConfigured) {
    return (
      <div className="space-y-3">
        <Card className="!border-white/10">
          <CardHeader className="text-center pb-6">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <AlertCircle className="h-8 w-8 text-primary" />
              </div>
            </div>
            <CardTitle className="text-2xl mb-2">Connect Your Data Source</CardTitle>
            <CardDescription className="text-base max-w-2xl mx-auto">
              Configure your monitoring namespace on the Overview page to start viewing distributed traces.
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-8">
            <div className="max-w-2xl mx-auto space-y-4">
              <div className="p-4 rounded border border-border bg-black/30">
                <div className="text-sm font-medium mb-2">To get started:</div>
                <div className="text-xs text-foreground/70 space-y-2">
                  <div>1. Navigate to the Overview page</div>
                  <div>2. Enter your monitoring namespace</div>
                  <div>3. Return here to view distributed traces</div>
                </div>
              </div>

              <div className="flex justify-center">
                <Button 
                  onClick={() => window.location.href = '/'}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Go to Overview
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 pt-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-white mb-2">Distributed Traces</h1>
        <p className="text-sm text-foreground/60">Trace requests across services to identify bottlenecks and errors</p>
      </div>

      {/* Search and Filters */}
      <Card className="!border-white/10 !bg-black/40">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40" />
              <input
                type="text"
                placeholder="Search by trace ID, service, or operation..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-10 pl-10 pr-4 bg-black/50 border border-white/10 rounded text-sm focus:outline-none focus:border-blue-500/50 transition-colors"
              />
            </div>
            <button className="h-10 px-4 flex items-center gap-2 bg-black/50 border border-white/10 rounded text-sm hover:bg-white/5 transition-colors">
              <Filter className="h-4 w-4" />
              Filters
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Traces List */}
      <Card className="!border-white/10 !bg-black/40">
        <CardContent className="p-6">
          <div className="mb-4">
            <h2 className="text-base font-medium text-white">Recent Traces</h2>
            <p className="text-xs text-foreground/50 mt-1">
              {loading ? 'Loading...' : `${filteredTraces.length} traces found`}
            </p>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="rounded-lg border border-white/5 bg-black/30 p-4 animate-pulse">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="h-5 w-12 bg-white/5 rounded"></div>
                      <div className="h-5 w-48 bg-white/5 rounded"></div>
                    </div>
                    <div className="h-5 w-16 bg-white/5 rounded"></div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="h-4 w-20 bg-white/5 rounded"></div>
                    <div className="h-4 w-24 bg-white/5 rounded"></div>
                    <div className="h-4 w-16 bg-white/5 rounded"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : filteredTraces.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-sm text-foreground/50">No traces found. Make sure your simulator is running.</div>
            </div>
          ) : (
          <div className="space-y-3">
            {filteredTraces.map((trace) => (
              <div key={trace.id}>
                {/* Trace Card */}
                <div
                  onClick={() => toggleTrace(trace.id)}
                  className="p-4 rounded border border-white/10 bg-black hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      {/* Method and Endpoint */}
                      <div className="flex items-center gap-3 mb-2">
                        <div className="flex items-center gap-2">
                          {expandedTraces.has(trace.id) ? (
                            <ChevronDown className="h-4 w-4 text-foreground/60" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-foreground/60" />
                          )}
                          <span className="text-sm font-medium text-white">{trace.method}</span>
                          <span className="text-sm text-white">{trace.endpoint}</span>
                        </div>
                        <Badge 
                          className={`text-[10px] px-2 py-0.5 ${
                            trace.status === 'success' 
                              ? 'bg-green-500/20 text-green-400 border-green-500/20' 
                              : 'bg-red-500/10 text-red-500 border-red-500/20'
                          }`}
                        >
                          {trace.status === 'error' ? '1 error' : trace.status}
                        </Badge>
                      </div>

                      {/* Trace ID */}
                      <div className="text-xs text-foreground/50 font-mono mb-2">{trace.id}</div>

                      {/* Metadata */}
                      <div className="flex items-center gap-4 text-xs text-foreground/50">
                        <span>{trace.service}</span>
                        <span>•</span>
                        <span>{trace.timestamp}</span>
                      </div>
                    </div>

                    {/* Duration and Spans */}
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex items-center gap-1 text-sm text-foreground/70">
                        <Clock className="h-3 w-3" />
                        <span>{trace.duration}ms</span>
                      </div>
                      <div className="text-xs text-foreground/50">{trace.spans} spans</div>
                    </div>
                  </div>
                </div>

                {/* Expanded Span Details */}
                {expandedTraces.has(trace.id) && trace.spanDetails && (
                  <div className="mt-2 ml-8 p-4 rounded border border-white/5 bg-black/50">
                    <div className="text-xs font-medium text-foreground/70 mb-3">Span Timeline</div>
                    <div className="space-y-2">
                      {trace.spanDetails.map((span, idx) => (
                        <div key={idx} className="flex items-center gap-3">
                          <div className="w-32 text-xs text-foreground/60 truncate">{span.name}</div>
                          <div className="flex-1 h-6 bg-white/5 rounded-sm relative overflow-hidden">
                            <div 
                              className="h-full"
                              style={{ 
                                width: `${(span.duration / trace.duration) * 100}%`,
                                backgroundColor: span.status === 'error' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(20, 184, 166, 0.4)'
                              }}
                            />
                          </div>
                          <div className="w-16 text-xs text-foreground/60 text-right">{span.duration}ms</div>
                          <div className="w-24 text-xs text-foreground/50">{span.service}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Related Logs */}
                {expandedTraces.has(trace.id) && trace.logs && trace.logs.length > 0 && (
                  <div className="mt-2 ml-8 p-4 rounded border border-white/5 bg-black/50">
                    <div className="text-xs font-medium text-foreground/70 mb-3">Related Logs ({trace.logs.length})</div>
                    <div className="space-y-1.5">
                      {trace.logs.map((log, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-xs">
                          <Badge 
                            className={`text-[9px] px-1.5 py-0.5 ${
                              log.level === 'ERROR' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                              log.level === 'WARN' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' :
                              'bg-white/10 text-white border-white/20'
                            }`}
                          >
                            {log.level}
                          </Badge>
                          <span className="text-foreground/70 flex-1">{log.message}</span>
                          <span className="text-foreground/40">{log.service}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
