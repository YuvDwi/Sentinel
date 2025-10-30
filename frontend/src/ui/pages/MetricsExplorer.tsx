import { useState, useEffect } from 'react'
import ReactECharts from 'echarts-for-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { Play, Plus, X, AlertCircle } from 'lucide-react'
import { API_URL } from '../../config'

type MetricQuery = {
  id: string
  metric: string
  aggregation: string
  groupBy: string
  filter: string
}

// Available metrics
const availableMetrics = [
  { value: 'vault_unlock_duration_ms', label: 'Vault Unlock Duration (ms)', category: 'user_ops' },
  { value: 'item_retrieval_duration_ms', label: 'Item Retrieval Duration (ms)', category: 'user_ops' },
  { value: 'sync_duration_ms', label: 'Sync Duration (ms)', category: 'user_ops' },
  { value: 'auth_duration_ms', label: 'Auth Duration (ms)', category: 'user_ops' },
  { value: 'api_latency_ms', label: 'API Latency (ms)', category: 'infrastructure' },
  { value: 'database_query_duration_ms', label: 'Database Query Duration (ms)', category: 'infrastructure' },
  { value: 'cache_hit_rate', label: 'Cache Hit Rate (%)', category: 'infrastructure' },
  { value: 'error_rate', label: 'Error Rate (%)', category: 'reliability' },
  { value: 'request_rate', label: 'Request Rate (req/s)', category: 'throughput' },
  { value: 'active_connections', label: 'Active Connections', category: 'infrastructure' },
]

const aggregations = ['avg', 'p50', 'p95', 'p99', 'sum', 'count', 'max', 'min']
const groupByOptions = ['none', 'region', 'service', 'device_type', 'tenant']
const filterOptions = ['none', 'region', 'service', 'status_code', 'device_type', 'tenant']

// Generate mock time-series data
function generateMockData(metricName: string, points: number = 60) {
  const data = []
  const now = Date.now()
  
  // Different baselines for different metrics
  let baseValue = 50
  let variance = 20
  
  if (metricName.includes('rate')) {
    baseValue = 450
    variance = 50
  } else if (metricName.includes('connections')) {
    baseValue = 25
    variance = 5
  } else if (metricName.includes('cache')) {
    baseValue = 95
    variance = 3
  }
  
  for (let i = points - 1; i >= 0; i--) {
    const time = new Date(now - i * 60000)
    const value = baseValue + (Math.random() - 0.5) * variance
    data.push({
      time: time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      value: Math.max(0, value)
    })
  }
  return data
}

export function MetricsExplorer({ region, tenant, windowSel }: { region: string; tenant: string; windowSel: '5m'|'1h'|'24h' }) {
  const [isConfigured, setIsConfigured] = useState(false)
  const [queries, setQueries] = useState<MetricQuery[]>([
    { id: '1', metric: 'vault_unlock_duration_ms', aggregation: 'p95', groupBy: 'none', filter: '' }
  ])
  const [chartData, setChartData] = useState<any>(null)
  const [timeRange, setTimeRange] = useState('1h')

  useEffect(() => {
    const configured = localStorage.getItem('cw_is_configured') === '1'
    setIsConfigured(configured)
  }, [])

  const addQuery = () => {
    setQueries([...queries, {
      id: Date.now().toString(),
      metric: 'api_latency_ms',
      aggregation: 'avg',
      groupBy: 'none',
      filter: ''
    }])
  }

  const removeQuery = (id: string) => {
    setQueries(queries.filter(q => q.id !== id))
  }

  const updateQuery = (id: string, field: keyof MetricQuery, value: string) => {
    setQueries(queries.map(q => q.id === id ? { ...q, [field]: value } : q))
  }

  const runQuery = async () => {
    const namespace = localStorage.getItem('cw_namespace') || '1PasswordSimulator'
    const token = localStorage.getItem('auth_token')
    
    try {
      // For now, use the first available endpoint from CloudWatch
      const endpoint = '/api/v1/items/get'
      
      const series = await Promise.all(queries.map(async (query, index) => {
        const metric = availableMetrics.find(m => m.value === query.metric)
        
        // Map our metric names to CloudWatch metric names and dimensions
        let cwMetric = 'LatencyMs'
        let dimensionValue = endpoint
        
        // User operation metrics
        if (query.metric === 'vault_unlock_duration_ms') {
          cwMetric = 'VaultUnlockDuration'
          dimensionValue = 'vault_unlock'
        } else if (query.metric === 'item_retrieval_duration_ms') {
          cwMetric = 'ItemRetrievalDuration'
          dimensionValue = 'item_retrieval'
        } else if (query.metric === 'sync_duration_ms') {
          cwMetric = 'SyncDuration'
          dimensionValue = 'sync'
        } else if (query.metric === 'auth_duration_ms') {
          cwMetric = 'AuthDuration'
          dimensionValue = 'authentication'
        } else if (query.metric === 'database_query_duration_ms') {
          cwMetric = 'DatabaseQueryDuration'
          dimensionValue = 'db_query'
        } 
        // Infrastructure metrics
        else if (query.metric === 'cache_hit_rate') {
          cwMetric = 'CacheHitRate'
          dimensionValue = 'redis'
        } else if (query.metric === 'active_connections') {
          cwMetric = 'DatabaseConnections'
          dimensionValue = 'primary-db'
        }
        // API metrics
        else if (query.metric === 'request_rate') {
          cwMetric = 'RequestCount'
        } else if (query.metric === 'error_rate') {
          cwMetric = 'Error'
        } else if (query.metric === 'api_latency_ms') {
          cwMetric = 'LatencyMs'
        }
        
        try {
          const response = await fetch(
            `${API_URL}/api/v1/cloudwatch/metrics/timeseries?ns=${encodeURIComponent(namespace)}&metric=${cwMetric}&endpoint=${encodeURIComponent(dimensionValue)}&stat=${query.aggregation}&minutes=60`,
            {
              headers: {
                'Authorization': `Bearer ${token}`
              }
            }
          )
          
          if (response.ok) {
            const result = await response.json()
            const data = result.data || []
            
            if (data.length > 0) {
              return {
                name: `${metric?.label} (${query.aggregation})`,
                type: 'line',
                data: data.map((d: [number, number]) => d[1]),
                smooth: false,
                symbol: 'none',
                lineStyle: {
                  color: ['#3b82f6', '#f97316', '#84cc16', '#a855f7', '#ec4899'][index % 5],
                  width: 2,
                },
                timestamps: data.map((d: [number, number]) => d[0])
              }
            }
          }
        } catch (error) {
          console.error('Failed to fetch metric:', error)
        }
        
        // Fallback to mock data
        const mockData = generateMockData(query.metric)
        return {
          name: `${metric?.label} (${query.aggregation})`,
          type: 'line',
          data: mockData.map(d => d.value),
          smooth: false,
          symbol: 'none',
          lineStyle: {
            color: ['#3b82f6', '#f97316', '#84cc16', '#a855f7', '#ec4899'][index % 5],
            width: 2,
          },
        }
      }))

      const timeLabels = series[0]?.timestamps 
        ? series[0].timestamps.map((ts: number) => new Date(ts).toLocaleTimeString())
        : generateMockData(queries[0].metric).map(d => d.time)

      setChartData({
        series,
        timeLabels
      })
    } catch (error) {
      console.error('Failed to run query:', error)
      // Fallback to mock data
      const series = queries.map((query, index) => {
        const data = generateMockData(query.metric)
        const metric = availableMetrics.find(m => m.value === query.metric)
        
        return {
          name: `${metric?.label} (${query.aggregation})`,
          type: 'line',
          data: data.map(d => d.value),
          smooth: false,
          symbol: 'none',
          lineStyle: {
            color: ['#3b82f6', '#f97316', '#84cc16', '#a855f7', '#ec4899'][index % 5],
            width: 2,
          },
        }
      })

      const timeLabels = generateMockData(queries[0].metric).map(d => d.time)

      setChartData({
        series,
        timeLabels
      })
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
              Configure your monitoring namespace on the Overview page to start exploring custom metrics.
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-8">
            <div className="max-w-2xl mx-auto space-y-4">
              <div className="p-4 rounded border border-border bg-black/30">
                <div className="text-sm font-medium mb-2">To get started:</div>
                <div className="text-xs text-foreground/70 space-y-2">
                  <div>1. Navigate to the Overview page</div>
                  <div>2. Enter your monitoring namespace</div>
                  <div>3. Return here to build custom metric queries</div>
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
      {/* Query Builder */}
      <div className="space-y-3">
        {queries.map((query, index) => (
          <div key={query.id} className="p-3 rounded border border-border bg-black/50 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-white">Query {index + 1}</h3>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={runQuery}
                  size="sm"
                  className="gap-1.5 bg-blue-500 hover:bg-blue-600 text-white h-7 text-xs"
                >
                  <Play className="h-3 w-3" />
                  Run Query
                </Button>
                {queries.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeQuery(query.id)}
                    className="h-6 w-6 p-0 hover:bg-red-500/10 hover:text-red-500"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                {/* Metric Selection */}
                <div>
                  <label className="text-[10px] text-foreground/60 font-medium mb-1.5 block">Metric</label>
                  <div className="relative">
                    <select
                      value={query.metric}
                      onChange={(e) => updateQuery(query.id, 'metric', e.target.value)}
                      className="w-full h-8 px-2 pr-7 bg-white/5 border border-white/20 rounded text-xs focus:outline-none focus:border-blue-500/50 focus:bg-white/10 appearance-none transition-colors"
                    >
                      {availableMetrics.map(metric => (
                        <option key={metric.value} value={metric.value}>{metric.label}</option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                      <svg className="h-3 w-3 text-foreground/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Aggregation */}
                <div>
                  <label className="text-[10px] text-foreground/60 font-medium mb-1.5 block">Aggregation</label>
                  <div className="relative">
                    <select
                      value={query.aggregation}
                      onChange={(e) => updateQuery(query.id, 'aggregation', e.target.value)}
                      className="w-full h-8 px-2 pr-7 bg-white/5 border border-white/20 rounded text-xs focus:outline-none focus:border-blue-500/50 focus:bg-white/10 appearance-none transition-colors"
                    >
                      {aggregations.map(agg => (
                        <option key={agg} value={agg}>{agg}</option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                      <svg className="h-3 w-3 text-foreground/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Group By */}
                <div>
                  <label className="text-[10px] text-foreground/60 font-medium mb-1.5 block">Group By</label>
                  <div className="relative">
                    <select
                      value={query.groupBy}
                      onChange={(e) => updateQuery(query.id, 'groupBy', e.target.value)}
                      className="w-full h-8 px-2 pr-7 bg-white/5 border border-white/20 rounded text-xs focus:outline-none focus:border-blue-500/50 focus:bg-white/10 appearance-none transition-colors"
                    >
                      {groupByOptions.map(option => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                      <svg className="h-3 w-3 text-foreground/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Filter */}
                <div>
                  <label className="text-[10px] text-foreground/60 font-medium mb-1.5 block">Filter</label>
                  <div className="relative">
                    <select
                      value={query.filter}
                      onChange={(e) => updateQuery(query.id, 'filter', e.target.value)}
                      className="w-full h-8 px-2 pr-7 bg-white/5 border border-white/20 rounded text-xs focus:outline-none focus:border-blue-500/50 focus:bg-white/10 appearance-none transition-colors"
                    >
                      {filterOptions.map(option => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                      <svg className="h-3 w-3 text-foreground/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>
            </div>
          </div>
        ))}

        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={addQuery}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Query
          </Button>
        </div>
      </div>

      {/* Results Chart */}
      {chartData && (
        <Card className="!border-white/10 !bg-black/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-medium text-foreground/50 uppercase tracking-wide">Metric Visualization</CardTitle>
            <CardDescription className="text-xs text-foreground/60">
              {queries.length} {queries.length === 1 ? 'query' : 'queries'} • Last {timeRange}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2 pb-4">
            <ReactECharts
              option={{
                backgroundColor: 'transparent',
                grid: { top: 40, right: 20, bottom: 30, left: 50 },
                legend: {
                  top: 5,
                  textStyle: { color: '#94a3b8', fontSize: 9 },
                  itemWidth: 16,
                  itemHeight: 8,
                },
                xAxis: {
                  type: 'category',
                  data: chartData.timeLabels,
                  axisLabel: { color: '#94a3b8', fontSize: 9, interval: 9 },
                  axisLine: { show: false },
                  axisTick: { show: false },
                },
                yAxis: {
                  type: 'value',
                  scale: true,
                  min: (value: any) => Math.max(0, value.min - (value.max - value.min) * 0.3),
                  max: (value: any) => value.max + (value.max - value.min) * 0.3,
                  axisLabel: { color: '#94a3b8', fontSize: 9 },
                  splitLine: { lineStyle: { color: '#1a1a1a', opacity: 0.5 } },
                },
                series: chartData.series,
                tooltip: {
                  trigger: 'axis',
                  backgroundColor: '#0a0a0a',
                  borderColor: '#333',
                  textStyle: { color: '#fff', fontSize: 11 },
                  formatter: (params: any) => {
                    let content = `<div style="padding: 4px 8px;">
                      <div style="color: #999; font-size: 10px; margin-bottom: 4px;">${params[0].name}</div>`
                    params.forEach((param: any) => {
                      const query = queries.find((q, i) => i === param.seriesIndex)
                      const metric = availableMetrics.find(m => m.value === query?.metric)
                      content += `<div style="margin-top: 2px;">
                        <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${param.color}; margin-right: 4px;"></span>
                        <span style="color: #999; font-size: 10px;">${metric?.label || param.seriesName}:</span>
                        <span style="font-weight: 600; margin-left: 4px;">${param.value.toFixed(2)}</span>
                      </div>`
                    })
                    content += `</div>`
                    return content
                  }
                },
              }}
              style={{ height: '280px', width: '100%' }}
              opts={{ renderer: 'svg' }}
            />
          </CardContent>
        </Card>
      )}

      {/* Placeholder when no results */}
      {!chartData && (
        <Card className="!border-white/10">
          <CardContent className="py-16 text-center">
            <div className="text-foreground/50 text-base">
              Visualizations will appear here once you run a query
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

