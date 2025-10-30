import { useState, useEffect, useMemo, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { Cloud } from 'lucide-react'
import ReactECharts from 'echarts-for-react'
import * as echarts from 'echarts'
import WorldMapImage from '../../components/WorldMapImage'
import { API_URL } from '../../config'

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

type OverviewProps = {
  region: string
  tenant: string
  windowSel: '5m'|'1h'|'24h'
  data: SummaryResponse | null
  topQueries: TopQuery[]
  error: string | null
  lastUpdate: Date
}

// Helper to generate time series data
const generateTimeSeries = (points: number, baseValue: number, variance: number) => {
  const now = Date.now()
  return Array.from({ length: points }, (_, i) => {
    const time = now - (points - i) * 60000
    const value = baseValue + (Math.random() - 0.5) * variance
    return [time, Math.max(0, value)]
  })
}

// Robust single-load world map registration using a shared promise
let worldMapLoadPromise: Promise<void> | null = null

function useWorldMapRegistration() {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    try {
      const existing = (echarts as any).getMap?.('world')
      if (existing) {
        if (mounted) setLoaded(true)
        return
      }
    } catch {}

    if (!worldMapLoadPromise) {
      worldMapLoadPromise = fetch('https://cdn.jsdelivr.net/npm/echarts@5/map/json/world.json', { cache: 'force-cache' })
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return res.json()
        })
        .then(geoJson => {
          echarts.registerMap('world', geoJson)
        })
    }

    worldMapLoadPromise
      .then(() => { if (mounted) setLoaded(true) })
      .catch(err => { if (mounted) setError(err?.message || 'load failed') })

    return () => { mounted = false }
  }, [])

  return { loaded, error }
}

const WorldMapViz = () => {
  const { loaded, error } = useWorldMapRegistration()

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center text-foreground/40">Map unavailable</div>
    )
  }
  if (!loaded) {
    return (
      <div className="w-full h-full flex items-center justify-center text-foreground/40">Loading map…</div>
    )
  }

  const mapOption = useMemo(() => ({
    backgroundColor: 'transparent',
    geo: {
      map: 'world',
      roam: false,
      silent: true,
      itemStyle: {
        areaColor: '#0f0f0f',
        borderColor: '#2a2a2a',
        borderWidth: 0.6,
      },
      emphasis: { disabled: true },
    },
    series: [
      {
        type: 'scatter',
        coordinateSystem: 'geo',
        symbolSize: 12,
        itemStyle: { shadowBlur: 10, shadowColor: 'rgba(16,185,129,0.5)' },
        data: [
          { name: 'US-East', value: [-77, 39, 99.97], itemStyle: { color: '#14b8a6' } },
          { name: 'US-West', value: [-122, 37, 99.97], itemStyle: { color: '#14b8a6' } },
          { name: 'EU-West', value: [-6, 53, 99.20], itemStyle: { color: '#f59e0b' } },
          { name: 'EU-Central', value: [13, 52, 99.97], itemStyle: { color: '#14b8a6' } },
          { name: 'AP-Southeast', value: [103, 1, 99.97], itemStyle: { color: '#14b8a6' } },
          { name: 'AP-Northeast', value: [139, 35, 99.20], itemStyle: { color: '#f59e0b' } },
          { name: 'SA-East', value: [-46, -23, 97.11], itemStyle: { color: '#ef4444' } },
        ],
      },
    ],
  }), [])

  return (
    <ReactECharts 
      option={mapOption}
      style={{ height: '100%', width: '100%' }}
      // SVG renderer avoids GPU/canvas black-screen issues on some devices
      opts={{ renderer: 'svg' }}
      notMerge={true}
      lazyUpdate={true}
    />
  )
}

// Novel, dependency-free DOM map using an external world SVG image and absolute-positioned markers
const WorldMapDOM = () => {
  const container = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const imageUrl = 'https://upload.wikimedia.org/wikipedia/commons/5/5b/BlankMap-World.svg'

  useEffect(() => {
    if (!container.current) return
    const el = container.current
    if ((window as any).ResizeObserver) {
      const ro = new (window as any).ResizeObserver((entries: any[]) => {
        for (const entry of entries) {
          const cr = entry.contentRect
          setSize({ width: cr.width, height: cr.height })
        }
      })
      ro.observe(el)
      setSize({ width: el.clientWidth, height: el.clientHeight })
      return () => ro.disconnect()
    } else {
      const handle = () => setSize({ width: el.clientWidth, height: el.clientHeight })
      window.addEventListener('resize', handle)
      handle()
      return () => window.removeEventListener('resize', handle)
    }
  }, [container])

  const project = (lon: number, lat: number) => {
    const x = ((lon + 180) / 360) * size.width
    const y = ((90 - lat) / 180) * size.height
    return { left: x, top: y }
  }

  const regions = [
    { name: 'US-East (99.97%)', lon: -77, lat: 39, color: '#14b8a6' },
    { name: 'US-West (99.97%)', lon: -122, lat: 37, color: '#14b8a6' },
    { name: 'EU-West (99.20%)', lon: -6, lat: 53, color: '#f59e0b' },
    { name: 'EU-Central (99.97%)', lon: 13, lat: 52, color: '#14b8a6' },
    { name: 'AP-Southeast (99.97%)', lon: 103, lat: 1, color: '#14b8a6' },
    { name: 'AP-Northeast (99.20%)', lon: 139, lat: 35, color: '#f59e0b' },
    { name: 'SA-East (97.11%)', lon: -46, lat: -23, color: '#ef4444' },
  ]

  return (
    <div ref={container} className="relative w-full h-full overflow-hidden">
      <img src={imageUrl} alt="World Map" className="absolute inset-0 w-full h-full object-cover" style={{ filter: 'invert(1) brightness(0.35) contrast(1.25) saturate(0.7)' }} onLoad={() => {
        const el = container.current
        if (el) setSize({ width: el.clientWidth, height: el.clientHeight })
      }} />
      {regions.map(r => {
        const pos = project(r.lon, r.lat)
        return (
          <div key={r.name} className="absolute" style={{ left: pos.left - 6, top: pos.top - 6 }}>
            <div className="relative">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: r.color, boxShadow: `0 0 10px ${r.color}80` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ECharts map via official world.js script (registers 'world' automatically)
function useEChartsWorldScript() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    try {
      const existing = (echarts as any).getMap?.('world')
      if (existing) {
        setReady(true)
        return
      }
    } catch {}

    const scriptId = 'echarts-world-js'
    const existingScript = document.getElementById(scriptId) as HTMLScriptElement | null
    if (existingScript) {
      const onLoad = () => setReady(true)
      if ((echarts as any).getMap?.('world')) setReady(true)
      else existingScript.addEventListener('load', onLoad, { once: true })
      return () => existingScript.removeEventListener('load', onLoad)
    }

    const script = document.createElement('script')
    script.id = scriptId
    script.src = 'https://cdn.jsdelivr.net/npm/echarts@5/map/js/world.js'
    script.async = true
    script.onload = () => {
      if ((echarts as any).getMap?.('world')) setReady(true)
      else setError('world map not registered')
    }
    script.onerror = () => setError('failed to load world.js')
    document.head.appendChild(script)

    return () => {
      script.onload = null
      script.onerror = null
    }
  }, [])

  return { ready, error }
}

const WorldMapECharts = () => {
  const { ready, error } = useEChartsWorldScript()
  if (error) {
    return <WorldMapDOM />
  }
  if (!ready) {
    return <div className="w-full h-full flex items-center justify-center text-foreground/40">Loading map…</div>
  }

  const option = useMemo(() => ({
    backgroundColor: 'transparent',
    geo: {
      map: 'world',
      roam: false,
      silent: true,
      itemStyle: { areaColor: '#0f0f0f', borderColor: '#2a2a2a', borderWidth: 0.6 },
      emphasis: { disabled: true },
    },
    series: [{
      type: 'scatter',
      coordinateSystem: 'geo',
      symbolSize: 12,
      itemStyle: { shadowBlur: 10, shadowColor: 'rgba(20,184,166,0.5)' },
      data: [
        { name: 'US-East', value: [-77, 39, 99.97], itemStyle: { color: '#14b8a6' } },
        { name: 'US-West', value: [-122, 37, 99.97], itemStyle: { color: '#14b8a6' } },
        { name: 'EU-West', value: [-6, 53, 99.20], itemStyle: { color: '#f59e0b' } },
        { name: 'EU-Central', value: [13, 52, 99.97], itemStyle: { color: '#14b8a6' } },
        { name: 'AP-Southeast', value: [103, 1, 99.97], itemStyle: { color: '#14b8a6' } },
        { name: 'AP-Northeast', value: [139, 35, 99.20], itemStyle: { color: '#f59e0b' } },
        { name: 'SA-East', value: [-46, -23, 97.11], itemStyle: { color: '#ef4444' } },
      ],
    }],
  }), [])

  return (
    <ReactECharts 
      option={option}
      style={{ height: '100%', width: '100%' }}
      opts={{ renderer: 'svg' }}
      notMerge={true}
      lazyUpdate={true}
    />
  )
}

export function Overview({ region, tenant, windowSel, data, topQueries, error, lastUpdate }: OverviewProps) {
  // CloudWatch configuration state (persisted)
  const [isConfigured, setIsConfigured] = useState<boolean>(() => {
    try {
      return localStorage.getItem('cw_is_configured') === '1'
    } catch { return false }
  })
  const [cwNamespace, setCwNamespace] = useState<string>(() => {
    try { return localStorage.getItem('cw_namespace') || '' } catch { return '' }
  })
  const [cwEndpoint, setCwEndpoint] = useState<string>(() => {
    try { return localStorage.getItem('cw_endpoint') || '' } catch { return '' }
  })
  const [cwData, setCwData] = useState<any>(null)
  const [cwLoading, setCwLoading] = useState(false)
  const [cwError, setCwError] = useState<string | null>(null)
  const [cwTimeSeries, setCwTimeSeries] = useState<{
    throughput: [number, number][],
    latency: [number, number][],
    errors: [number, number][],
    cache: [number, number][],
    p50: [number, number][],
    p75: [number, number][],
    p90: [number, number][],
    p95: [number, number][],
    p99: [number, number][]
  }>({ throughput: [], latency: [], errors: [], cache: [], p50: [], p75: [], p90: [], p95: [], p99: [] })

  // Fetch CloudWatch metrics
  const fetchCloudWatchMetrics = async () => {
    setCwLoading(true)
    setCwError(null)
    try {
      const token = localStorage.getItem('auth_token') || 'dev-admin-token'
      
      // Fetch summary stats
      const summaryResponse = await fetch(
        `/api/v1/cloudwatch/summary?ns=${encodeURIComponent(cwNamespace)}&endpoint=${encodeURIComponent(cwEndpoint)}&minutes=60`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (summaryResponse.ok) {
        const json = await summaryResponse.json()
        setCwData(json)
      } else {
        const text = await summaryResponse.text()
        setCwError(`Failed to fetch CloudWatch data: ${text}`)
      }

      // Fetch time-series data for charts
      const [throughputRes, latencyRes, errorRes, cacheRes, p50Res, p75Res, p90Res, p95Res, p99Res] = await Promise.all([
        fetch(`${API_URL}/api/v1/cloudwatch/metrics/timeseries?ns=${encodeURIComponent(cwNamespace)}&metric=RequestCount&endpoint=${encodeURIComponent(cwEndpoint)}&stat=Sum&minutes=30`, 
          { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/v1/cloudwatch/metrics/timeseries?ns=${encodeURIComponent(cwNamespace)}&metric=LatencyMs&endpoint=${encodeURIComponent(cwEndpoint)}&stat=Average&minutes=30`, 
          { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/v1/cloudwatch/metrics/timeseries?ns=${encodeURIComponent(cwNamespace)}&metric=Error&endpoint=${encodeURIComponent(cwEndpoint)}&stat=Sum&minutes=30`, 
          { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/v1/cloudwatch/metrics/timeseries?ns=${encodeURIComponent(cwNamespace)}&metric=CacheHitRate&endpoint=redis&stat=Average&minutes=30`, 
          { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/v1/cloudwatch/metrics/timeseries?ns=${encodeURIComponent(cwNamespace)}&metric=LatencyMs&endpoint=${encodeURIComponent(cwEndpoint)}&stat=p50&minutes=60`, 
          { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/v1/cloudwatch/metrics/timeseries?ns=${encodeURIComponent(cwNamespace)}&metric=LatencyMs&endpoint=${encodeURIComponent(cwEndpoint)}&stat=p75&minutes=60`, 
          { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/v1/cloudwatch/metrics/timeseries?ns=${encodeURIComponent(cwNamespace)}&metric=LatencyMs&endpoint=${encodeURIComponent(cwEndpoint)}&stat=p90&minutes=60`, 
          { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/v1/cloudwatch/metrics/timeseries?ns=${encodeURIComponent(cwNamespace)}&metric=LatencyMs&endpoint=${encodeURIComponent(cwEndpoint)}&stat=p95&minutes=60`, 
          { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/v1/cloudwatch/metrics/timeseries?ns=${encodeURIComponent(cwNamespace)}&metric=LatencyMs&endpoint=${encodeURIComponent(cwEndpoint)}&stat=p99&minutes=60`, 
          { headers: { Authorization: `Bearer ${token}` } })
      ])

      const [throughputData, latencyData, errorData, cacheData, p50Data, p75Data, p90Data, p95Data, p99Data] = await Promise.all([
        throughputRes.ok ? throughputRes.json() : { data: [] },
        latencyRes.ok ? latencyRes.json() : { data: [] },
        errorRes.ok ? errorRes.json() : { data: [] },
        cacheRes.ok ? cacheRes.json() : { data: [] },
        p50Res.ok ? p50Res.json() : { data: [] },
        p75Res.ok ? p75Res.json() : { data: [] },
        p90Res.ok ? p90Res.json() : { data: [] },
        p95Res.ok ? p95Res.json() : { data: [] },
        p99Res.ok ? p99Res.json() : { data: [] }
      ])

      // Update cache hit rate if we have real data
      if (cacheData.data && cacheData.data.length > 0) {
        const latestCache = cacheData.data[cacheData.data.length - 1][1]
        setCwData((prev: any) => ({ ...prev, cache_hit_rate: latestCache }))
      }

      setCwTimeSeries({
        throughput: throughputData.data || [],
        latency: latencyData.data || [],
        errors: errorData.data || [],
        cache: cacheData.data || [],
        p50: p50Data.data || [],
        p75: p75Data.data || [],
        p90: p90Data.data || [],
        p95: p95Data.data || [],
        p99: p99Data.data || []
      })

    } catch (err) {
      console.error('Failed to fetch CloudWatch metrics:', err)
      setCwError(String(err))
    } finally {
      setCwLoading(false)
    }
  }

  // Auto-refresh CloudWatch metrics only when configured
  useEffect(() => {
    if (isConfigured && cwNamespace && cwEndpoint) {
      fetchCloudWatchMetrics()
      const interval = setInterval(fetchCloudWatchMetrics, 30000) // Every 30s
      return () => clearInterval(interval)
    }
  }, [isConfigured, cwNamespace, cwEndpoint])
  
  const handleConfigure = () => {
    if (cwNamespace) {
      // Set default endpoint for metrics fetching
      const defaultEndpoint = '/api/v1/items/get'
      setCwEndpoint(defaultEndpoint)
      setIsConfigured(true)
      try {
        localStorage.setItem('cw_is_configured', '1')
        localStorage.setItem('cw_namespace', cwNamespace)
        localStorage.setItem('cw_endpoint', defaultEndpoint)
      } catch {}
    }
  }

  // Generate chart data based on CloudWatch data or defaults
  const throughputData = useMemo(() => {
    if (cwTimeSeries.throughput.length > 0) {
      return cwTimeSeries.throughput
    }
    return generateTimeSeries(30, cwData?.requests || 35, 8)
  }, [cwTimeSeries.throughput, cwData])

  const errorRateData = useMemo(() => {
    if (cwTimeSeries.errors.length > 0 && cwTimeSeries.throughput.length > 0) {
      // Calculate error rate percentage from errors and requests
      return cwTimeSeries.errors.map(([time, errors], idx) => {
        const requests = cwTimeSeries.throughput[idx]?.[1] || 1
        const errorRate = requests > 0 ? (errors / requests) * 100 : 0
        return [time, errorRate]
      })
    }
    return generateTimeSeries(30, (cwData?.error_rate || 0.0015) * 100, 0.05)
  }, [cwTimeSeries.errors, cwTimeSeries.throughput, cwData])

  const responseTimeData = useMemo(() => {
    if (cwTimeSeries.latency.length > 0) {
      return cwTimeSeries.latency
    }
    return generateTimeSeries(30, cwData?.p95_ms || 25, 5)
  }, [cwTimeSeries.latency, cwData])

  const totalRequestsData = useMemo(() => {
    if (cwTimeSeries.throughput.length > 0) {
      return cwTimeSeries.throughput
    }
    return generateTimeSeries(30, cwData?.requests || 458, 50)
  }, [cwTimeSeries.throughput, cwData])

  const cacheHitData = useMemo(() => {
    if (cwTimeSeries.cache.length > 0) {
      return cwTimeSeries.cache
    }
    return generateTimeSeries(30, (cwData?.cache_hit_rate || (data?.redis?.hit_ratio || 0.945) * 100), 2)
  }, [cwTimeSeries.cache, cwData, data])

  // Percentile series (must be before any early returns so hook order is stable)
  const p50Data = useMemo(() => {
    if (cwTimeSeries.p50.length > 0) return cwTimeSeries.p50
    return generateTimeSeries(60, (cwData?.p95_ms || 25) * 0.5, 3)
  }, [cwTimeSeries.p50, cwData])

  const p75Data = useMemo(() => {
    if (cwTimeSeries.p75.length > 0) return cwTimeSeries.p75
    return generateTimeSeries(60, (cwData?.p95_ms || 25) * 0.75, 4)
  }, [cwTimeSeries.p75, cwData])

  const p90Data = useMemo(() => {
    if (cwTimeSeries.p90.length > 0) return cwTimeSeries.p90
    return generateTimeSeries(60, (cwData?.p95_ms || 25) * 0.9, 4)
  }, [cwTimeSeries.p90, cwData])

  const p95Data = useMemo(() => {
    if (cwTimeSeries.p95.length > 0) return cwTimeSeries.p95
    return generateTimeSeries(60, cwData?.p95_ms || 25, 5)
  }, [cwTimeSeries.p95, cwData])

  const p99Data = useMemo(() => {
    if (cwTimeSeries.p99.length > 0) return cwTimeSeries.p99
    return generateTimeSeries(60, (cwData?.p95_ms || 25) * 1.2, 6)
  }, [cwTimeSeries.p99, cwData])

  // Consistent time label formatter with normal weight
  const formatTimeLabel = (value: number) => {
    const d = new Date(value)
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return `${hh}:${mm}`
  }

  // Format numbers to max 2 decimals without unnecessary trailing zeros
  const formatNumber2dp = (value: number) => {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return ''
    const s = Number(value).toFixed(2)
    return s.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
  }

  // Delta between last two points in a time series (y-values)
  const getDelta = (series: any[]) => {
    if (!series || series.length < 2) return 0
    const last = series[series.length - 1]?.[1] ?? 0
    const prev = series[series.length - 2]?.[1] ?? 0
    return last - prev
  }

  // Health color selection
  const getHealthColor = (kind: 'error'|'latency'|'throughput'|'requests', value: number, delta: number = 0) => {
    switch (kind) {
      case 'error': { // value in %
        if (value < 0.1) return '#10b981' // green
        if (value < 1) return '#f59e0b'   // yellow
        return '#ef4444'                  // red
      }
      case 'latency': { // value in ms
        if (value <= 100) return '#10b981'
        if (value <= 200) return '#f59e0b'
        return '#ef4444'
      }
      case 'throughput':
      case 'requests': {
        if (delta > 0) return '#10b981'
        if (delta < 0) return '#ef4444'
        return '#f59e0b'
      }
    }
  }

  // Top card deltas and colors
  const throughputDelta = getDelta(throughputData)
  const errorRateDelta = getDelta(errorRateData)
  const responseTimeDelta = getDelta(responseTimeData)
  const totalRequestsDelta = getDelta(totalRequestsData)

  const errorRatePct = (cwData?.error_rate || 0.0015) * 100
  const throughputColor = getHealthColor('throughput', cwData?.requests || 0, throughputDelta)
  const errorRateColor = getHealthColor('error', errorRatePct, errorRateDelta)
  const responseTimeColor = getHealthColor('latency', cwData?.p95_ms || 25, responseTimeDelta)
  const totalRequestsColor = getHealthColor('requests', cwData?.requests || 458, totalRequestsDelta)

  // Mini sparkline chart for metric cards with axes
  const miniSparkline = (data: any[], color: string, label: string = '', unit: string = '') => ({
    backgroundColor: 'transparent',
    grid: { left: 25, right: 5, top: 5, bottom: 22 },
    xAxis: { 
      type: 'time', 
      show: true,
      axisLine: { lineStyle: { color: '#333' } },
      axisLabel: { 
        show: true, color: '#666', fontSize: 8, fontWeight: 'normal',
        formatter: (val: number) => `{t|${formatTimeLabel(val)}}`,
        rich: { t: { color: '#666', fontSize: 8, fontWeight: '400' } },
      },
      axisTick: { show: false },
      splitLine: { show: false },
      splitNumber: 3,
    },
    yAxis: { 
      type: 'value', 
      scale: true,
      min: (value: any) => Math.max(0, value.min - (value.max - value.min) * 0.3),
      max: (value: any) => value.max + (value.max - value.min) * 0.3,
      show: true,
      axisLine: { lineStyle: { color: '#333' } },
      axisLabel: { color: '#666', fontSize: 8, formatter: (val: number) => formatNumber2dp(val) },
      splitLine: { show: false }
    },
    series: [{
      data,
      type: 'line',
      smooth: false,
      symbol: 'none',
      lineStyle: { color, width: 1.5 },
      areaStyle: { 
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: color + '60' },
            { offset: 1, color: color + '00' }
          ]
        }
      },
    }],
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#0a0a0a',
      borderColor: '#333',
      textStyle: { color: '#fff', fontSize: 11 },
      formatter: (params: any) => {
        const param = params[0]
        const time = new Date(param.value[0]).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        const value = formatNumber2dp(param.value[1])
        return `<div style="padding: 4px 8px;">
          <div style="color: #999; font-size: 10px; margin-bottom: 2px;">${label}</div>
          <div style="font-weight: 600;">${value}${unit}</div>
          <div style="color: #666; font-size: 9px; margin-top: 2px;">${time}</div>
        </div>`
      }
    },
  })

  // Large area chart
  const areaChartOption = (data: any[], color: string, title: string, unit: string = '') => ({
    backgroundColor: 'transparent',
    grid: { left: 50, right: 20, top: 40, bottom: 30 },
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: '#333' } },
      axisLabel: { 
        color: '#666', fontSize: 9, fontWeight: 'normal',
        formatter: (val: number) => `{t|${formatTimeLabel(val)}}`,
        rich: { t: { color: '#666', fontSize: 9, fontWeight: '400' } },
      },
      axisTick: { show: false },
      splitNumber: 4,
    },
    yAxis: {
      type: 'value',
      scale: true,
      min: (value: any) => Math.max(0, value.min - (value.max - value.min) * 0.3),
      max: (value: any) => value.max + (value.max - value.min) * 0.3,
      axisLine: { lineStyle: { color: '#333' } },
      axisLabel: { color: '#666', fontSize: 9, formatter: (val: number) => `${formatNumber2dp(val)}${unit}` },
      splitLine: { lineStyle: { color: '#1a1a1a', type: 'solid' } },
    },
    series: [{
      data,
      type: 'line',
      smooth: false,
      symbol: 'none',
      lineStyle: { color, width: 2 },
      areaStyle: { 
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: color + '40' },
            { offset: 1, color: color + '00' }
          ]
        }
      },
    }],
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#0a0a0a',
      borderColor: '#333',
      textStyle: { color: '#fff', fontSize: 11 },
      formatter: (params: any) => {
        const param = params[0]
        const time = new Date(param.value[0]).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        const value = formatNumber2dp(param.value[1])
        return `<div style="padding: 4px 8px;">
          <div style="color: #999; font-size: 10px; margin-bottom: 2px;">${title}</div>
          <div style="font-weight: 600;">${value}${unit}</div>
          <div style="color: #666; font-size: 9px; margin-top: 2px;">${time}</div>
        </div>`
      }
    },
  })

  // Multi-line chart
  const multiLineChartOption = (series: { name: string; data: any[]; color: string }[]) => ({
    backgroundColor: 'transparent',
    grid: { left: 50, right: 20, top: 40, bottom: 30 },
    legend: {
      data: series.map(s => s.name),
      textStyle: { color: '#666', fontSize: 9 },
      top: 5,
      itemWidth: 20,
      itemHeight: 10,
    },
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: '#333' } },
      axisLabel: { 
        color: '#666', fontSize: 9, fontWeight: 'normal',
        formatter: (val: number) => `{t|${formatTimeLabel(val)}}`,
        rich: { t: { color: '#666', fontSize: 9, fontWeight: '400' } },
      },
      axisTick: { show: false },
      splitNumber: 4,
    },
    yAxis: {
      type: 'value',
      scale: true,
      min: (value: any) => Math.max(0, value.min - (value.max - value.min) * 0.3),
      max: (value: any) => value.max + (value.max - value.min) * 0.3,
      axisLine: { lineStyle: { color: '#333' } },
      axisLabel: { color: '#666', fontSize: 9, formatter: (val: number) => `${formatNumber2dp(val)}ms` },
      splitLine: { lineStyle: { color: '#1a1a1a', type: 'solid' } },
    },
    series: series.map(s => ({
      name: s.name,
      data: s.data,
      type: 'line',
      smooth: false,
      symbol: 'none',
      lineStyle: { color: s.color, width: 1.5 },
    })),
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#0a0a0a',
      borderColor: '#333',
      textStyle: { color: '#fff', fontSize: 11 },
      formatter: (params: any) => {
        const time = new Date(params[0].value[0]).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        let content = `<div style="padding: 4px 8px;">
          <div style="color: #999; font-size: 10px; margin-bottom: 4px;">Response Time</div>
          <div style="color: #666; font-size: 9px; margin-bottom: 4px;">${time}</div>`
        params.forEach((param: any) => {
          const value = formatNumber2dp(param.value[1])
          content += `<div style="margin-top: 2px;">
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${param.color}; margin-right: 4px;"></span>
            <span style="color: #999; font-size: 10px;">${param.seriesName}:</span>
            <span style="font-weight: 600; margin-left: 4px;">${value}ms</span>
          </div>`
        })
        content += `</div>`
        return content
      }
    },
  })

  // Show configuration form if not configured
  if (!isConfigured) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="!border-white/10 w-full max-w-2xl">
          <CardHeader className="text-center pb-6">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Cloud className="h-8 w-8 text-primary" />
              </div>
            </div>
            <CardTitle className="text-2xl mb-2">What space would you like to monitor?</CardTitle>
            <CardDescription className="text-base">
              Connect your application to start tracking performance and health metrics
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Namespace</label>
              <input
                type="text"
                value={cwNamespace}
                onChange={(e) => setCwNamespace(e.target.value)}
                placeholder="e.g. 1PasswordSimulator"
                className="w-full h-10 px-4 bg-black/50 border border-border rounded focus:outline-none focus:border-primary/50"
              />
              <div className="text-xs text-foreground/50 mt-1">
                The namespace represents the area of your application to track
              </div>
            </div>

            <Button
              onClick={handleConfigure}
              disabled={!cwNamespace}
              className="w-full h-10"
            >
              Start Monitoring
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Calculate overall system health
  const calculateSystemHealth = () => {
    let healthyCount = 0
    let degradedCount = 0
    let errorCount = 0
    
    // Check error rate
    if (errorRatePct < 0.1) healthyCount++
    else if (errorRatePct < 1) degradedCount++
    else errorCount++
    
    // Check response time
    const p95 = cwData?.p95_ms || 25
    if (p95 <= 100) healthyCount++
    else if (p95 <= 200) degradedCount++
    else errorCount++
    
    // Check throughput (if it's very low, it might indicate issues)
    const throughput = cwData?.requests || 35
    if (throughput > 20) healthyCount++
    else if (throughput > 10) degradedCount++
    else errorCount++
    
    // Determine overall status
    if (errorCount > 0) return { status: 'Critical', color: '#ef4444', badge: 'bg-red-500/10 text-red-500 border-red-500/20' }
    if (degradedCount > 1) return { status: 'Degraded Performance', color: '#f59e0b', badge: 'bg-orange-500/10 text-orange-500 border-orange-500/20' }
    if (degradedCount === 1) return { status: 'Minor Issues', color: '#f59e0b', badge: 'bg-orange-500/10 text-orange-500 border-orange-500/20' }
    return { status: 'All Systems Operational', color: '#10b981', badge: 'bg-green-500/10 text-green-500 border-green-500/20' }
  }
  
  const systemHealth = calculateSystemHealth()

  // Show full dashboard once configured
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-medium text-white">System Status:</h1>
            <span className="text-lg font-normal text-gray-500">{systemHealth.status}</span>
            <div 
              className="w-1.5 h-1.5 rounded-full"
              style={{ 
                backgroundColor: systemHealth.color,
                boxShadow: `0 0 6px ${systemHealth.color}60`
              }}
            />
          </div>
          <p className="text-xs text-foreground/60 mt-1">Region: {region} • Tenant: {tenant} • Last updated: {lastUpdate.toLocaleTimeString()}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => {
          setIsConfigured(false)
          try {
            localStorage.removeItem('cw_is_configured')
            localStorage.removeItem('cw_namespace')
            localStorage.removeItem('cw_endpoint')
          } catch {}
        }}>
          Reconfigure
        </Button>
      </div>

        {/* Top Metrics - Clean Design */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Throughput */}
        <div className="group relative overflow-hidden rounded-xl border border-white/5 bg-gradient-to-br from-black/60 to-black/40 p-5 transition-all hover:border-white/10">
          <div className="space-y-3">
            <div className="text-[10px] font-medium text-foreground/50 uppercase tracking-wider">Throughput</div>
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-normal" style={{ color: throughputColor }}>{cwData?.requests?.toFixed(0) || '35'}</div>
              <div className="text-sm text-foreground/50">req/s</div>
            </div>
            <div className="h-16 -mx-2">
              <ReactECharts option={miniSparkline(throughputData, throughputColor, 'Throughput', ' req/s')} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'canvas' }} />
            </div>
          </div>
        </div>

        {/* Error Rate */}
        <div className="group relative overflow-hidden rounded-xl border border-white/5 bg-gradient-to-br from-black/60 to-black/40 p-5 transition-all hover:border-white/10">
          <div className="space-y-3">
            <div className="text-[10px] font-medium text-foreground/50 uppercase tracking-wider">Error Rate</div>
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-normal" style={{ color: errorRateColor }}>{errorRatePct.toFixed(2)}%</div>
              <div className="text-xs" style={{ color: errorRateColor }}>{errorRateDelta >= 0 ? '↑' : '↓'} {Math.abs(errorRateDelta).toFixed(2)}%</div>
            </div>
            <div className="h-16 -mx-2">
              <ReactECharts option={miniSparkline(errorRateData, errorRateColor, 'Error Rate', '%')} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'canvas' }} />
            </div>
          </div>
        </div>

        {/* P95 Latency */}
        <div className="group relative overflow-hidden rounded-xl border border-white/5 bg-gradient-to-br from-black/60 to-black/40 p-5 transition-all hover:border-white/10">
          <div className="space-y-3">
            <div className="text-[10px] font-medium text-foreground/50 uppercase tracking-wider">P95 Latency</div>
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-normal" style={{ color: responseTimeColor }}>{cwData?.p95_ms?.toFixed(0) || '25'}</div>
              <div className="text-sm text-foreground/50">ms</div>
            </div>
            <div className="h-16 -mx-2">
              <ReactECharts option={miniSparkline(responseTimeData, responseTimeColor, 'Response Time (P95)', 'ms')} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'canvas' }} />
            </div>
          </div>
        </div>

        {/* Cache Hit */}
        <div className="group relative overflow-hidden rounded-xl border border-white/5 bg-gradient-to-br from-black/60 to-black/40 p-5 transition-all hover:border-white/10">
          <div className="space-y-3">
            <div className="text-[10px] font-medium text-foreground/50 uppercase tracking-wider">Cache Hit</div>
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-normal text-green-400">{(cwData?.cache_hit_rate || (data?.redis?.hit_ratio || 0.945) * 100).toFixed(1)}%</div>
              <div className="text-xs text-green-400">↑ 2.1%</div>
            </div>
            <div className="h-16 -mx-2">
              <ReactECharts option={miniSparkline(cacheHitData, '#4ade80', 'Cache Hit', '%')} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'canvas' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Replication Lag + Global Infrastructure Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card className="!border-white/10 !bg-black/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Replication Lag</CardTitle>
            <CardDescription className="text-xs text-foreground/50">Database sync latency</CardDescription>
          </CardHeader>
          <CardContent className="h-[220px]">
            <div className="flex items-baseline gap-2 mb-2">
              <div className="text-lg font-medium text-green-400">{data?.databases?.replication_lag_sec?.toFixed(2) || '0.12'}s</div>
              <div className="text-[10px] text-green-400">↓ 0.01s</div>
              <div className="text-[10px] text-foreground/40">avg replication lag</div>
            </div>
            <div className="h-[160px]">
              <ReactECharts option={areaChartOption(generateTimeSeries(60, data?.databases?.replication_lag_sec || 0.12, 0.05), '#14b8a6', 'Replication Lag', 's')} style={{ height: '100%' }} opts={{ renderer: 'canvas' }} />
            </div>
          </CardContent>
        </Card>

        <Card className="!border-white/10 !bg-black/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Global Infrastructure Status</CardTitle>
            <CardDescription className="text-xs text-foreground/50">Regional server health</CardDescription>
          </CardHeader>
          <CardContent className="h-[220px] p-2">
            <WorldMapImage />
          </CardContent>
        </Card>
      </div>

      {/* Secret Operations + Authentication Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card className="!border-white/10 !bg-black/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Secret Access Operations</CardTitle>
            <CardDescription className="text-xs text-foreground/50">Read/write operations on secrets</CardDescription>
          </CardHeader>
          <CardContent className="h-[200px]">
            <ReactECharts option={areaChartOption(generateTimeSeries(60, (cwData?.requests || 458) * 0.7, 35), '#14b8a6', 'Secret Reads', ' ops/s')} style={{ height: '100%' }} opts={{ renderer: 'canvas' }} />
          </CardContent>
        </Card>

        <Card className="!border-white/10 !bg-black/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Authentication Events</CardTitle>
            <CardDescription className="text-xs text-foreground/50">Login attempts and session creation</CardDescription>
          </CardHeader>
          <CardContent className="h-[200px]">
            <ReactECharts option={areaChartOption(generateTimeSeries(60, (cwData?.requests || 458) * 0.15, 10), '#3b82f6', 'Auth Events', ' /min')} style={{ height: '100%' }} opts={{ renderer: 'canvas' }} />
          </CardContent>
        </Card>
      </div>

      {/* 1Password-Specific Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card className="!border-white/10 !bg-black/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-foreground/60">Vault Operations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{((cwData?.requests || 458) * 0.4).toFixed(0)}/s</div>
            <div className="text-[10px] text-foreground/40 mt-0.5">Read: {((cwData?.requests || 458) * 0.35).toFixed(0)} • Write: {((cwData?.requests || 458) * 0.05).toFixed(0)}</div>
            <Badge className="mt-2 bg-green-500/20 text-green-400 text-[10px] px-1.5 py-0.5">Normal</Badge>
          </CardContent>
        </Card>

        <Card className="!border-white/10 !bg-black/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-foreground/60">API Key Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{((cwData?.requests || 458) * 0.25).toFixed(0)}/s</div>
            <div className="text-[10px] text-foreground/40 mt-0.5">Service accounts active: {Math.floor((cwData?.requests || 458) * 0.1)}</div>
            <Badge className="mt-2 bg-green-500/20 text-green-400 text-[10px] px-1.5 py-0.5">↑ 3.2%</Badge>
          </CardContent>
        </Card>

        <Card className="!border-white/10 !bg-black/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-foreground/60">Encryption Ops</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{((cwData?.requests || 458) * 0.6).toFixed(0)}/s</div>
            <div className="text-[10px] text-foreground/40 mt-0.5">Avg time: {((cwData?.p95_ms || 25) * 0.3).toFixed(1)}ms</div>
            <Badge className="mt-2 bg-green-500/20 text-green-400 text-[10px] px-1.5 py-0.5">Healthy</Badge>
          </CardContent>
        </Card>

        <Card className="!border-white/10 !bg-black/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-foreground/60">Failed Auth</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{((cwData?.errors || 1) * 0.3).toFixed(1)}/min</div>
            <div className="text-[10px] text-foreground/40 mt-0.5">Rate: {(((cwData?.errors || 1) / (cwData?.requests || 458)) * 100 * 0.5).toFixed(2)}%</div>
            <Badge className="mt-2 bg-green-500/20 text-green-400 text-[10px] px-1.5 py-0.5">Low</Badge>
          </CardContent>
        </Card>
      </div>

      {/* API Response Time Percentiles + Error Rate */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card className="!border-white/10 !bg-black/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">API Response Time Percentiles</CardTitle>
            <CardDescription className="text-xs text-foreground/50">Latency distribution • Target: p95 &lt; 100ms</CardDescription>
          </CardHeader>
          <CardContent className="h-[220px]">
            <ReactECharts 
              option={multiLineChartOption([
                { name: 'p50', data: p50Data, color: '#14b8a6' },
                { name: 'p75', data: p75Data, color: '#3b82f6' },
                { name: 'p90', data: p90Data, color: '#f59e0b' },
                { name: 'p95', data: p95Data, color: '#ef4444' },
                { name: 'p99', data: p99Data, color: '#8b5cf6' },
              ])} 
              style={{ height: '100%' }} 
              opts={{ renderer: 'canvas' }}
            />
          </CardContent>
        </Card>

        <Card className="!border-white/10 !bg-black/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Error Rate</CardTitle>
            <CardDescription className="text-xs text-foreground/50">Failed requests • Target: &lt; 0.1%</CardDescription>
          </CardHeader>
          <CardContent className="h-[220px]">
            <ReactECharts 
              option={areaChartOption(generateTimeSeries(60, (cwData?.error_rate || 0.01) * 100, 0.2), '#ef4444', 'Error Rate', '%')} 
              style={{ height: '100%' }} 
              opts={{ renderer: 'canvas' }}
            />
          </CardContent>
        </Card>
      </div>

      {/* API Endpoint Performance */}
      <Card className="!border-white/10 !bg-black/40">
        <CardHeader>
          <CardTitle className="text-sm font-medium">API Endpoint Performance</CardTitle>
          <CardDescription className="text-xs text-foreground/50">Top endpoints by request volume and latency</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            <div className="grid grid-cols-12 gap-3 text-[10px] font-medium text-foreground/50 pb-2 border-b border-border/50">
              <div className="col-span-1">Status</div>
              <div className="col-span-4">Endpoint</div>
              <div className="col-span-1">Req/s</div>
              <div className="col-span-2">P50</div>
              <div className="col-span-2">P95</div>
              <div className="col-span-2">Error %</div>
            </div>
            
            <div className="grid grid-cols-12 gap-3 text-xs items-center py-2 hover:bg-white/5 rounded transition-colors">
              <div className="col-span-1">
                <Badge className="bg-green-500/20 text-green-400 text-[9px] px-1.5 py-0.5">OK</Badge>
              </div>
              <div className="col-span-4 font-mono text-[10px] text-foreground/70">/api/v1/vaults/list</div>
              <div className="col-span-1 text-[10px]">{((cwData?.requests || 458) * 0.3).toFixed(0)}</div>
              <div className="col-span-2 text-[10px]">{((cwData?.p95_ms || 25) * 0.4).toFixed(1)}ms</div>
              <div className="col-span-2 text-[10px]">{((cwData?.p95_ms || 25) * 0.8).toFixed(1)}ms</div>
              <div className="col-span-2 text-[10px]">0.02%</div>
            </div>

            <div className="grid grid-cols-12 gap-3 text-xs items-center py-2 hover:bg-white/5 rounded transition-colors">
              <div className="col-span-1">
                <Badge className="bg-green-500/20 text-green-400 text-[9px] px-1.5 py-0.5">OK</Badge>
              </div>
              <div className="col-span-4 font-mono text-[10px] text-foreground/70">/api/v1/items/get</div>
              <div className="col-span-1 text-[10px]">{((cwData?.requests || 458) * 0.25).toFixed(0)}</div>
              <div className="col-span-2 text-[10px]">{((cwData?.p95_ms || 25) * 0.5).toFixed(1)}ms</div>
              <div className="col-span-2 text-[10px]">{((cwData?.p95_ms || 25) * 0.9).toFixed(1)}ms</div>
              <div className="col-span-2 text-[10px]">0.01%</div>
            </div>

            <div className="grid grid-cols-12 gap-3 text-xs items-center py-2 hover:bg-white/5 rounded transition-colors">
              <div className="col-span-1">
                <Badge className="bg-orange-500/20 text-orange-400 text-[9px] px-1.5 py-0.5">WARN</Badge>
              </div>
              <div className="col-span-4 font-mono text-[10px] text-foreground/70">/api/v1/auth/signin</div>
              <div className="col-span-1 text-[10px]">{((cwData?.requests || 458) * 0.15).toFixed(0)}</div>
              <div className="col-span-2 text-[10px]">{((cwData?.p95_ms || 25) * 1.8).toFixed(1)}ms</div>
              <div className="col-span-2 text-[10px]">{((cwData?.p95_ms || 25) * 3.2).toFixed(1)}ms</div>
              <div className="col-span-2 text-[10px]">{(errorRatePct * 2).toFixed(2)}%</div>
            </div>

            <div className="grid grid-cols-12 gap-3 text-xs items-center py-2 hover:bg-white/5 rounded transition-colors">
              <div className="col-span-1">
                <Badge className="bg-green-500/20 text-green-400 text-[9px] px-1.5 py-0.5">OK</Badge>
              </div>
              <div className="col-span-4 font-mono text-[10px] text-foreground/70">/api/v1/secrets/share</div>
              <div className="col-span-1 text-[10px]">{((cwData?.requests || 458) * 0.08).toFixed(0)}</div>
              <div className="col-span-2 text-[10px]">{((cwData?.p95_ms || 25) * 0.6).toFixed(1)}ms</div>
              <div className="col-span-2 text-[10px]">{((cwData?.p95_ms || 25) * 1.1).toFixed(1)}ms</div>
              <div className="col-span-2 text-[10px]">0.03%</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
