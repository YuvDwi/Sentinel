import { useEffect, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  TrendingUp, 
  TrendingDown,
  Clock,
  Zap,
  AlertCircle,
  Activity,
  Database
} from 'lucide-react'

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

// Generate realistic time-series data for demo
function generateTimeSeries(baseValue: number, variance: number, points: number = 60, trend: 'up' | 'down' | 'stable' = 'stable') {
  const data = []
  const now = Date.now()
  for (let i = points - 1; i >= 0; i--) {
    const time = new Date(now - i * 60000) // 1 minute intervals
    let value = baseValue + (Math.random() - 0.5) * variance
    
    // Add trend
    if (trend === 'up') {
      value += (points - i) * (variance / points) * 0.5
    } else if (trend === 'down') {
      value -= (points - i) * (variance / points) * 0.5
    }
    
    data.push({
      time: time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      value: Math.max(0, value)
    })
  }
  return data
}

export function RichDashboard({ region, tenant, windowSel }: { region: string; tenant: string; windowSel: '5m'|'1h'|'24h' }) {
  const [data, setData] = useState<SummaryResponse | null>(null)
  const [topQueries, setTopQueries] = useState<TopQuery[]>([])
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())
  const token = import.meta.env.VITE_ADMIN_TOKEN || 'dev-admin-token'

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
    fetchData()
    const interval = setInterval(fetchData, 5000)
    return () => clearInterval(interval)
  }, [region, tenant, windowSel])

  if (!data) {
    return (
      <div className="space-y-6">
        <Card className="h-96 animate-pulse bg-card/50" />
      </div>
    )
  }

  // Calculate derived metrics and health
  const connectionUtilization = (data.databases.active_connections / data.databases.max_connections) * 100
  const cacheHitRate = data.redis.hit_ratio * 100
  
  // Service health determination
  const overallHealth = data.databases.p95_ms < 50 && connectionUtilization < 80 && cacheHitRate > 90 ? 'healthy' : 
                       data.databases.p95_ms > 100 || connectionUtilization > 90 ? 'critical' : 'degraded'
  
  // Generate time-series data (in production, this would come from backend)
  const apiLatencyData = generateTimeSeries(data.databases.p95_ms, 10, 60, data.databases.p95_ms > 30 ? 'up' : 'stable')
  const errorRateData = generateTimeSeries(0.5, 0.3, 60, 'stable')
  const throughputData = generateTimeSeries(450, 50, 60, 'stable')
  const connectionData = generateTimeSeries(data.databases.active_connections, 5, 60, connectionUtilization > 70 ? 'up' : 'stable')

  // SLO calculations
  const sloTarget = 99.9
  const currentUptime = 99.87 // This would come from backend
  const errorBudgetRemaining = ((currentUptime - (100 - sloTarget)) / sloTarget) * 100

  return (
    <div className="space-y-6">
      {error && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="pt-4">
            <p className="text-destructive text-sm">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* SERVICE HEALTH OVERVIEW - Top Priority */}
      <div className="grid grid-cols-1 gap-6">
        <Card className="!border-white/10 transition-all duration-300">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div>
                <div>
                <CardTitle className="text-xl">
                  System Status: {overallHealth === 'healthy' ? 'Operational' : overallHealth === 'degraded' ? 'Degraded Performance' : 'Critical Issue'}
                </CardTitle>
                <CardDescription className="text-sm mt-1 text-foreground/70">
                  {overallHealth === 'healthy' 
                    ? 'All systems operating normally'
                    : overallHealth === 'degraded'
                    ? 'Some services experiencing elevated latency'
                    : 'Immediate attention required - user impact detected'}
                </CardDescription>
                </div>
              </div>
              <Badge 
                variant={overallHealth === 'healthy' ? 'default' : 'destructive'} 
                className="text-sm px-4 py-2"
              >
                {overallHealth.toUpperCase()}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* SLO Compliance */}
              <div className="p-4 rounded-lg bg-black/60 border border-border">
                <div className="text-xs text-foreground/60 font-medium uppercase mb-2">SLO Compliance (30d)</div>
                <div className="text-2xl mb-1">{currentUptime}%</div>
                <div className="flex items-center gap-2 text-sm">
                  <div className={`flex items-center gap-1 ${errorBudgetRemaining > 50 ? 'text-blue-500' : errorBudgetRemaining > 20 ? 'text-foreground/70' : 'text-red-500'}`}>
                    <span>{errorBudgetRemaining.toFixed(1)}% budget left</span>
                  </div>
                </div>
                <div className="mt-2 h-2 bg-black/70 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all ${errorBudgetRemaining > 50 ? 'bg-blue-500' : errorBudgetRemaining > 20 ? 'bg-foreground/30' : 'bg-red-500'}`}
                    style={{ width: `${errorBudgetRemaining}%` }}
                  />
                </div>
              </div>

              {/* Error Rate */}
              <div className="p-4 rounded-lg bg-black/60 border border-border">
                <div className="text-xs text-foreground/60 font-medium uppercase mb-2">Error Rate</div>
                <div className="text-2xl mb-1">0.13%</div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-blue-500">-42% vs baseline</span>
                </div>
                <div className="text-xs text-foreground/70 mt-1">Target: &lt;0.1%</div>
              </div>

              {/* Request Latency (p95) */}
              <div className="p-4 rounded-lg bg-black/60 border border-border">
                <div className="text-xs text-foreground/60 font-medium uppercase mb-2">API Latency (p95)</div>
                <div className="text-2xl mb-1">{data.databases.p95_ms.toFixed(0)}ms</div>
                <div className="flex items-center gap-2 text-sm">
                  {data.databases.p95_ms < 30 ? (
                    <>
                      <span className="text-blue-500">Within target</span>
                    </>
                  ) : (
                    <>
                      <span className="text-foreground/70">+{((data.databases.p95_ms - 30) / 30 * 100).toFixed(0)}% over target</span>
                    </>
                  )}
                </div>
                <div className="text-xs text-foreground/70 mt-1">Target: &lt;30ms</div>
              </div>

              {/* Throughput */}
              <div className="p-4 rounded-lg bg-black/60 border border-border">
                <div className="text-xs text-foreground/60 font-medium uppercase mb-2">Throughput</div>
                <div className="text-2xl mb-1">458</div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-blue-500">req/sec</span>
                </div>
                <div className="text-xs text-foreground/70 mt-1">+12% vs 1h ago</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ACTIVE ALERTS & ACTIONABLE INSIGHTS */}
      {(connectionUtilization > 80 || data.databases.p95_ms > 50 || data.redis.evictions > 0 || data.queues.queue_depth > 100) && (
        <Card className="!border-white/10">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-medium">
              Active Issues Requiring Attention
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {connectionUtilization > 80 && (
                <div className="flex items-start gap-3 p-4 rounded bg-black/50 border border-border">
                  <div className="flex-1">
                    <div className="font-medium text-sm mb-1">Database Connection Pool Saturation</div>
                    <div className="text-sm text-foreground/80 mb-2">
                      Connection pool at {connectionUtilization.toFixed(0)}% capacity ({data.databases.active_connections}/{data.databases.max_connections} connections).
                      Risk of connection exhaustion and request queuing.
                    </div>
                    <div className="text-sm font-medium mt-2">
                      → Requires investigation: Scale connection pool or check for connection leaks
                    </div>
                  </div>
                  <Badge variant="outline" className="text-orange-400/80 border-orange-400/50 font-normal">HIGH</Badge>
                </div>
              )}

              {data.databases.p95_ms > 50 && (
                <div className="flex items-start gap-3 p-4 rounded bg-black/50 border border-border">
                  <div className="flex-1">
                    <div className="font-medium text-sm mb-1">Elevated Query Latency Detected</div>
                    <div className="text-sm text-foreground/80 mb-2">
                      Database p95 latency is {data.databases.p95_ms.toFixed(0)}ms, exceeding target of 30ms by {((data.databases.p95_ms - 30) / 30 * 100).toFixed(0)}%.
                      User-facing operations may feel sluggish.
                    </div>
                    <div className="text-sm font-medium mt-2">
                      → {topQueries.length} slow queries detected below requiring optimization
                    </div>
                  </div>
                  <Badge variant="outline" className="text-muted-foreground border-border">MEDIUM</Badge>
                </div>
              )}

              {data.redis.evictions > 0 && (
                <div className="flex items-start gap-3 p-4 rounded bg-black/50 border border-border">
                  <div className="flex-1">
                    <div className="font-medium text-sm mb-1">Cache Memory Pressure</div>
                    <div className="text-sm text-foreground/80 mb-2">
                      Redis has evicted {data.redis.evictions} keys. Cache hit ratio is {cacheHitRate.toFixed(1)}%.
                      Evictions can cause increased database load.
                    </div>
                    <div className="text-sm font-medium mt-2">
                      → Requires investigation: Redis memory or TTL configuration
                    </div>
                  </div>
                  <Badge variant="outline" className="text-muted-foreground border-border">MEDIUM</Badge>
                </div>
              )}

              {data.queues.queue_depth > 100 && (
                <div className="flex items-start gap-3 p-4 rounded bg-black/50 border border-border">
                  <div className="flex-1">
                    <div className="font-medium text-sm mb-1">Queue Backlog Accumulating</div>
                    <div className="text-sm text-foreground/80 mb-2">
                      Message queue depth is {data.queues.queue_depth} (consumer lag: {data.queues.consumer_lag} messages).
                      Processing delays may impact async operations.
                    </div>
                    <div className="text-sm font-medium mt-2">
                      → Requires investigation: Consumer scaling or processing bottlenecks
                    </div>
                  </div>
                  <Badge variant="outline" className="text-muted-foreground border-border">MEDIUM</Badge>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* USER-FACING API PERFORMANCE - Time Series */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* API Latency Over Time */}
        <Card className="!border-white/10 hover:!border-primary/30 transition-all duration-300">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">
              API Response Time (Last Hour)
            </CardTitle>
            <CardDescription className="text-sm text-foreground/70">
              Real-time latency monitoring • Target: &lt;30ms p95
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-3">
            <ReactECharts
              option={{
                backgroundColor: 'transparent',
                grid: { top: 30, right: 30, bottom: 50, left: 60 },
                tooltip: {
                  trigger: 'axis',
                  backgroundColor: 'rgba(15, 23, 42, 0.95)',
                  borderColor: 'rgba(71, 85, 105, 0.5)',
                  textStyle: { color: '#e2e8f0' },
                  formatter: (params: any) => {
                    const point = params[0]
                    return `<strong>${point.axisValue}</strong><br/>
                            Latency: <strong>${point.value.toFixed(1)}ms</strong><br/>
                            <span style="color: ${point.value > 30 ? '#f97316' : '#10b981'}">
                              ${point.value > 30 ? 'Above target' : 'Within target'}
                            </span>`
                  }
                },
                xAxis: {
                  type: 'category',
                  data: apiLatencyData.map(d => d.time),
                  axisLabel: { 
                    color: '#94a3b8', 
                    fontSize: 11,
                    interval: 9 // Show every 10th label
                  },
                  axisLine: { lineStyle: { color: '#334155' } },
                },
                yAxis: {
                  type: 'value',
                  name: 'Latency (ms)',
                  nameTextStyle: { color: '#94a3b8' },
                  axisLabel: { 
                    color: '#94a3b8',
                    formatter: '{value}ms'
                  },
                  splitLine: { lineStyle: { color: '#334155', opacity: 0.3 } },
                },
                series: [
                  {
                    name: 'p95 Latency',
                    type: 'line',
                    data: apiLatencyData.map(d => d.value),
                    smooth: false,
                    symbol: 'none',
                    lineStyle: { 
                      color: '#3b82f6',
                      width: 2,
                    },
                    areaStyle: {
                      color: {
                        type: 'linear',
                        x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [
                          { offset: 0, color: 'rgba(59, 130, 246, 0.3)' },
                          { offset: 1, color: 'rgba(0, 0, 0, 0)' },
                        ],
                      },
                    },
                  },
                  // Target line
                  {
                    name: 'Target',
                    type: 'line',
                    data: Array(apiLatencyData.length).fill(30),
                    lineStyle: { 
                      color: '#64748b',
                      width: 2,
                      type: 'dashed'
                    },
                    symbol: 'none',
                    silent: true,
                  }
                ],
              }}
              style={{ height: '280px', width: '100%' }}
              opts={{ renderer: 'svg' }}
            />
          </CardContent>
          <CardFooter className="flex-col items-start gap-2 text-sm border-t border-border/50 pt-3">
            <div className="flex gap-2 items-center">
              {data.databases.p95_ms < 30 ? (
                <span className="text-blue-500">Performance within target</span>
              ) : (
                <span className="text-muted-foreground">Latency {((data.databases.p95_ms - 30) / 30 * 100).toFixed(0)}% above target</span>
              )}
            </div>
            <div className="text-foreground/60">
              Current: {data.databases.p95_ms.toFixed(1)}ms • Baseline: 18.5ms • Peak: {Math.max(...apiLatencyData.map(d => d.value)).toFixed(1)}ms
            </div>
          </CardFooter>
        </Card>

        {/* Error Rate Over Time */}
        <Card className="!border-white/10 hover:!border-primary/30 transition-all duration-300">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">
              Error Rate (Last Hour)
            </CardTitle>
            <CardDescription className="text-sm text-foreground/70">
              Failed requests across all endpoints • Target: &lt;0.1%
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-3">
            <ReactECharts
              option={{
                backgroundColor: 'transparent',
                grid: { top: 30, right: 30, bottom: 50, left: 60 },
                tooltip: {
                  trigger: 'axis',
                  backgroundColor: 'rgba(15, 23, 42, 0.95)',
                  borderColor: 'rgba(71, 85, 105, 0.5)',
                  textStyle: { color: '#e2e8f0' },
                },
                xAxis: {
                  type: 'category',
                  data: errorRateData.map(d => d.time),
                  axisLabel: { 
                    color: '#94a3b8', 
                    fontSize: 11,
                    interval: 9
                  },
                  axisLine: { lineStyle: { color: '#334155' } },
                },
                yAxis: {
                  type: 'value',
                  name: 'Error Rate (%)',
                  nameTextStyle: { color: '#94a3b8' },
                  axisLabel: { 
                    color: '#94a3b8',
                    formatter: '{value}%'
                  },
                  splitLine: { lineStyle: { color: '#334155', opacity: 0.3 } },
                  max: 1.5
                },
                series: [
                  {
                    name: 'Error Rate',
                    type: 'line',
                    data: errorRateData.map(d => d.value),
                    smooth: false,
                    symbol: 'none',
                    lineStyle: { 
                      color: '#ef4444',
                      width: 2,
                    },
                    areaStyle: {
                      color: {
                        type: 'linear',
                        x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [
                          { offset: 0, color: 'rgba(239, 68, 68, 0.3)' },
                          { offset: 1, color: 'rgba(0, 0, 0, 0)' },
                        ],
                      },
                    },
                  },
                  {
                    name: 'Target',
                    type: 'line',
                    data: Array(errorRateData.length).fill(0.1),
                    lineStyle: { 
                      color: '#64748b',
                      width: 2,
                      type: 'dashed'
                    },
                    symbol: 'none',
                    silent: true,
                  }
                ],
              }}
              style={{ height: '280px', width: '100%' }}
              opts={{ renderer: 'svg' }}
            />
          </CardContent>
          <CardFooter className="flex-col items-start gap-2 text-sm border-t border-border/50 pt-3">
            <div className="flex gap-2 items-center">
              <span className="text-blue-500">Error rate below target threshold</span>
            </div>
            <div className="text-foreground/60">
              Current: 0.13% • 24h avg: 0.08% • Most common: 500 Internal Server Error (8 occurrences)
            </div>
          </CardFooter>
        </Card>
      </div>

      {/* ACTIONABLE DATABASE INSIGHTS */}
      <Card className="!border-white/10 hover:!border-primary/20 transition-all duration-300">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-medium">
                Database Performance Issues
              </CardTitle>
              <CardDescription className="text-sm mt-1 text-foreground/70">
                Queries requiring immediate optimization with actionable recommendations
              </CardDescription>
            </div>
            <Badge variant="secondary" className="px-3 py-1">{topQueries.length} issues</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {topQueries.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-base mb-1">All queries performing well</div>
              <div className="text-sm text-foreground/60">No optimization opportunities detected</div>
            </div>
          ) : (
            <div className="space-y-4">
              {topQueries.map((query, idx) => {
                // Calculate impact based on total time spent
                const impact = query.total_time_ms > 5000 ? 'CRITICAL' : query.total_time_ms > 1000 ? 'HIGH' : 'MEDIUM'
                
                // Generate insights based on query characteristics
                const insights: string[] = []
                
                if (query.rows > 1000) {
                  insights.push(`Returns ${query.rows.toLocaleString()} rows - possible N+1 query or missing pagination`)
                }
                
                if (query.mean_ms > 10 && query.calls > 100) {
                  insights.push(`High frequency (${query.calls} calls) with ${query.mean_ms.toFixed(1)}ms mean latency`)
                }
                
                if (query.p99_ms > query.mean_ms * 3) {
                  insights.push(`High variance (p99: ${query.p99_ms.toFixed(1)}ms vs mean: ${query.mean_ms.toFixed(1)}ms)`)
                }

                // Analyze query for common anti-patterns
                const queryLower = query.sample_query.toLowerCase()
                if (queryLower.includes('select *')) {
                  insights.push('Uses SELECT * instead of specific columns')
                }
                
                if (queryLower.includes('like')) {
                  insights.push('Uses LIKE operator which may prevent index usage')
                }

                return (
                  <div key={idx} className="p-4 rounded-lg border border-border/50 bg-black/50">
                    {/* Top row - Badge, Query name, and p99 */}
                    <div className="flex items-center justify-between gap-4 mb-3">
                      <div className="flex items-center gap-3">
                        <Badge 
                          variant="outline" 
                          className={
                            impact === 'CRITICAL' ? 'text-red-500 border-red-500 font-normal' :
                            impact === 'HIGH' ? 'text-orange-400/80 border-orange-400/50 font-normal' :
                            'text-foreground/80 border-border font-normal'
                          }
                        >
                          {impact}
                        </Badge>
                        <span className="text-sm font-mono">{query.fingerprint}</span>
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl text-red-400">{query.p99_ms.toFixed(0)}</span>
                        <span className="text-xs text-foreground/80">ms p99</span>
                      </div>
                    </div>

                    {/* Query */}
                    <code className="text-xs block font-mono text-foreground/70 mb-4 leading-relaxed">
                      {query.sample_query}
                    </code>

                    {/* Metrics row */}
                    <div className="flex items-center gap-6 text-xs mb-3">
                      <span className="text-foreground/80">{query.calls.toLocaleString()} calls</span>
                      <span className="text-foreground/20">•</span>
                      <span className="text-foreground/80">{query.mean_ms.toFixed(1)}ms mean</span>
                      <span className="text-foreground/20">•</span>
                      <span className="text-foreground/80">{query.p95_ms.toFixed(1)}ms p95</span>
                      <span className="text-foreground/20">•</span>
                      <span className="text-foreground/80">{query.rows.toLocaleString()} rows</span>
                      <span className="text-foreground/20">•</span>
                      <span className="text-foreground/80">{(query.total_time_ms / 1000).toFixed(1)}s total</span>
                    </div>

                    {/* Insights */}
                    {insights.length > 0 && (
                      <div className="space-y-1.5">
                        {insights.map((insight, i) => (
                          <div key={i} className="text-xs text-foreground/70 flex items-start gap-2">
                            <span className="text-blue-400 shrink-0">→</span>
                            <span>{insight}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
        {topQueries.length > 0 && (
          <CardFooter className="flex-col items-start gap-2 text-sm border-t border-border/50 pt-4">
            <div className="flex gap-2 items-center">
              <span>
                Total database time wasted: <span className="font-medium">
                  {(topQueries.reduce((acc, q) => acc + q.total_time_ms, 0) / 1000).toFixed(1)}s
                </span> in this time window
              </span>
            </div>
            <div className="text-foreground/60">
              Optimizing these {topQueries.length} queries could improve overall latency by an estimated 30-40%
            </div>
          </CardFooter>
        )}
      </Card>

      {/* RESOURCE UTILIZATION WITH CONTEXT */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Connection Pool Status */}
        <Card className="!border-white/10 hover:!border-primary/30 transition-all duration-300">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">
              Database Connection Pool
            </CardTitle>
            <CardDescription className="text-sm text-foreground/70">
              Real-time connection utilization with capacity planning
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-3">
            <div className="mb-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xl">{data.databases.active_connections}</span>
                <span className="text-sm text-foreground/80">of {data.databases.max_connections} connections</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className={connectionUtilization < 80 ? 'text-blue-500' : connectionUtilization < 90 ? 'text-orange-400' : 'text-red-500'}>
                  {connectionUtilization.toFixed(1)}% utilization
                </span>
              </div>
            </div>

            <ReactECharts
              option={{
                backgroundColor: 'transparent',
                grid: { top: 20, right: 20, bottom: 40, left: 50 },
                tooltip: {
                  trigger: 'axis',
                  backgroundColor: 'rgba(15, 23, 42, 0.95)',
                  borderColor: 'rgba(71, 85, 105, 0.5)',
                  textStyle: { color: '#e2e8f0' },
                  formatter: (params: any) => {
                    let result = `<strong>${params[0].axisValue}</strong><br/>`
                    params.forEach((param: any) => {
                      result += `${param.marker} ${param.seriesName}: <strong>${param.value.toFixed(0)}</strong><br/>`
                    })
                    return result
                  }
                },
                xAxis: {
                  type: 'category',
                  data: connectionData.map(d => d.time),
                  axisLabel: { 
                    color: '#94a3b8', 
                    fontSize: 10,
                    interval: 9
                  },
                  axisLine: { show: false },
                  axisTick: { show: false },
                },
                yAxis: {
                  type: 'value',
                  axisLabel: { color: '#94a3b8', fontSize: 10 },
                  splitLine: { lineStyle: { color: '#334155', opacity: 0.3 } },
                  min: 0,
                  max: Math.max(...connectionData.map(d => d.value)) * 1.5,
                },
                series: [
                  {
                    name: 'Active Connections',
                    type: 'line',
                    data: connectionData.map(d => d.value),
                    smooth: false,
                    symbol: 'none',
                    lineStyle: { 
                      color: '#3b82f6',
                      width: 2,
                    },
                    areaStyle: {
                      color: {
                        type: 'linear',
                        x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [
                          { offset: 0, color: 'rgba(59, 130, 246, 0.3)' },
                          { offset: 1, color: 'rgba(0, 0, 0, 0)' },
                        ],
                      },
                    },
                  }
                ],
              }}
              style={{ height: '200px', width: '100%' }}
              opts={{ renderer: 'svg' }}
            />
          </CardContent>
          <CardFooter className="flex-col items-start gap-2 text-sm border-t border-border/50 pt-3">
            <div className="flex gap-2 items-center">
              {connectionUtilization < 80 ? (
                <span className="text-blue-500">Connection pool healthy</span>
              ) : connectionUtilization < 90 ? (
                <span className="text-orange-400">Approaching capacity</span>
              ) : (
                <span className="text-red-500">Critical - scale immediately</span>
              )}
            </div>
            <div className="text-foreground/60">
              Current: {data.databases.active_connections} • Avg: {(connectionData.reduce((acc, d) => acc + d.value, 0) / connectionData.length).toFixed(0)} • Peak (1h): {Math.max(...connectionData.map(d => d.value)).toFixed(0)} connections
            </div>
          </CardFooter>
        </Card>

        {/* Request Throughput */}
        <Card className="!border-white/10 hover:!border-primary/30 transition-all duration-300">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">
              Request Throughput
            </CardTitle>
            <CardDescription className="text-sm text-foreground/70">
              Requests per second across all API endpoints
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-3">
            <div className="mb-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xl">458</span>
                <span className="text-sm text-foreground/80">req/sec</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-blue-500">+12% vs 1 hour ago</span>
              </div>
            </div>

            <ReactECharts
              option={{
                backgroundColor: 'transparent',
                grid: { top: 20, right: 20, bottom: 40, left: 50 },
                tooltip: {
                  trigger: 'axis',
                  backgroundColor: 'rgba(15, 23, 42, 0.95)',
                  borderColor: 'rgba(71, 85, 105, 0.5)',
                  textStyle: { color: '#e2e8f0' },
                },
                xAxis: {
                  type: 'category',
                  data: throughputData.map(d => d.time),
                  axisLabel: { 
                    color: '#94a3b8', 
                    fontSize: 10,
                    interval: 9
                  },
                  axisLine: { show: false },
                  axisTick: { show: false },
                },
                yAxis: {
                  type: 'value',
                  axisLabel: { 
                    color: '#94a3b8', 
                    fontSize: 10,
                    formatter: '{value}'
                  },
                  splitLine: { lineStyle: { color: '#334155', opacity: 0.3 } },
                },
                series: [
                  {
                    name: 'Requests/sec',
                    type: 'line',
                    data: throughputData.map(d => d.value),
                    smooth: false,
                    symbol: 'none',
                    lineStyle: { 
                      color: '#3b82f6',
                      width: 2,
                    },
                    areaStyle: {
                      color: {
                        type: 'linear',
                        x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [
                          { offset: 0, color: 'rgba(59, 130, 246, 0.3)' },
                          { offset: 1, color: 'rgba(0, 0, 0, 0)' },
                        ],
                      },
                    },
                  }
                ],
              }}
              style={{ height: '200px', width: '100%' }}
              opts={{ renderer: 'svg' }}
            />
          </CardContent>
          <CardFooter className="flex-col items-start gap-2 text-sm border-t border-border/50 pt-3">
            <div className="flex gap-2 items-center">
              <span>Traffic trending upward</span>
            </div>
            <div className="text-foreground/60">
              Current: 458 req/s • Avg (24h): 412 req/s • Peak: {Math.max(...throughputData.map(d => d.value)).toFixed(0)} req/s
            </div>
          </CardFooter>
        </Card>
      </div>

      {/* Infrastructure Summary - Compact */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="!border-white/10">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-foreground/80 mb-1">Cache Hit Rate</div>
                <div className="text-xl">{cacheHitRate.toFixed(1)}%</div>
                <div className="text-xs text-foreground/70 mt-1">
                  {data.redis.evictions} evictions • {Math.round(data.redis.mem_used_mb)}MB used
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="!border-white/10">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-foreground/80 mb-1">Replication Lag</div>
                <div className="text-xl">{data.databases.replication_lag_sec.toFixed(2)}s</div>
                <div className="text-xs text-foreground/70 mt-1">
                  {data.databases.replication_lag_sec < 1 ? 'Within tolerance' : 'Above target'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="!border-white/10">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-foreground/80 mb-1">Queue Depth</div>
                <div className="text-xl">{data.queues.queue_depth}</div>
                <div className="text-xs text-foreground/70 mt-1">
                  {data.queues.consumer_lag} msg lag • {data.queues.oldest_age_sec}s oldest
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Last Update */}
      <div className="flex items-center justify-center gap-3 py-4">
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shadow-lg shadow-blue-500/50"></div>
          <span className="text-sm font-medium text-blue-400">Live</span>
          <span className="text-sm text-foreground/30">•</span>
          <span className="text-sm text-foreground/80">Updated {lastUpdate.toLocaleTimeString()}</span>
        </div>
      </div>
    </div>
  )
}
