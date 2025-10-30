import { useState, useEffect, useRef, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Send, AlertCircle } from 'lucide-react'
import ReactECharts from 'echarts-for-react'
import { API_URL } from '../../config'

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  insights?: Insight[]
  visualizations?: Visualization[]
}

type Insight = {
  type: 'error' | 'warning' | 'success' | 'info'
  title: string
  description: string
  metric?: string
  value?: number
  threshold?: number
  recommendation?: string
}

type Visualization = {
  type: 'chart' | 'metric' | 'table'
  title: string
  description?: string
  data: any
}

type MetricData = {
  errorRate: number
  p95Latency: number
  throughput: number
  failedAuth: number
  cacheHitRate: number
  dbConnections: number
  queueDepth: number
}

// Helper to generate time series data (from Overview)
const generateTimeSeries = (points: number, baseValue: number, variance: number) => {
  const now = Date.now()
  return Array.from({ length: points }, (_, i) => {
    const time = now - (points - i) * 60000
    const value = baseValue + (Math.random() - 0.5) * variance
    return [time, Math.max(0, value)]
  })
}

// Format time labels (from Overview)
const formatTimeLabel = (value: number) => {
  const d = new Date(value)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

// Format numbers to max 2 decimals
const formatNumber2dp = (value: number) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return ''
  const s = Number(value).toFixed(2)
  return s.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
}

// Advanced rules engine
class RulesEngine {
  private metrics: MetricData
  private fetchTimeSeries: (metric: string, stat: string, minutes?: number) => Promise<[number, number][]>

  constructor(metrics: MetricData, fetchTimeSeries: (metric: string, stat: string, minutes?: number) => Promise<[number, number][]>) {
    this.metrics = metrics
    this.fetchTimeSeries = fetchTimeSeries
  }

  async analyzeQuery(query: string): Promise<{ insights: Insight[], visualizations: Visualization[] }> {
    const lowerQuery = query.toLowerCase()
    const insights: Insight[] = []
    const visualizations: Visualization[] = []

    // Pattern matching with context awareness
    const patterns = {
      performance: /performance|slow|latency|response time|speed/i,
      errors: /error|fail|broken|issue|problem|bug/i,
      auth: /auth|login|signin|authentication|credential/i,
      database: /database|db|query|sql|connection/i,
      cache: /cache|redis|memory/i,
      throughput: /throughput|traffic|requests|load|volume/i,
      health: /health|status|up|down|available/i,
      security: /security|breach|attack|unauthorized/i,
    }

    // Multi-pattern detection
    const matchedPatterns = Object.entries(patterns)
      .filter(([_, regex]) => regex.test(lowerQuery))
      .map(([key]) => key)

    // Advanced rule evaluation with priority
    if (matchedPatterns.includes('errors') || matchedPatterns.includes('performance')) {
      await this.evaluateErrorRules(insights, visualizations)
    }

    if (matchedPatterns.includes('performance') || matchedPatterns.includes('latency')) {
      await this.evaluateLatencyRules(insights, visualizations)
    }

    if (matchedPatterns.includes('auth')) {
      await this.evaluateAuthRules(insights, visualizations)
    }

    if (matchedPatterns.includes('database')) {
      await this.evaluateDatabaseRules(insights, visualizations)
    }

    if (matchedPatterns.includes('cache')) {
      await this.evaluateCacheRules(insights, visualizations)
    }

    if (matchedPatterns.includes('throughput')) {
      await this.evaluateThroughputRules(insights, visualizations)
    }

    if (matchedPatterns.includes('health') || matchedPatterns.length === 0) {
      await this.evaluateOverallHealth(insights, visualizations)
    }

    // If no specific patterns matched, provide general analysis
    if (insights.length === 0) {
      await this.evaluateOverallHealth(insights, visualizations)
    }

    return { insights, visualizations }
  }

  private async evaluateErrorRules(insights: Insight[], visualizations: Visualization[]) {
    const { errorRate } = this.metrics

    if (errorRate > 0.5) {
      insights.push({
        type: 'error',
        title: 'Critical Error Rate',
        description: `Error rate is at ${errorRate.toFixed(3)}%, which is critically high for a production system.`,
        metric: 'Error Rate',
        value: errorRate,
        threshold: 0.5,
        recommendation: 'Investigate error logs immediately. Check for failed authentication attempts, database connection issues, or external service failures.'
      })
    } else if (errorRate > 0.15) {
      insights.push({
        type: 'warning',
        title: 'Elevated Error Rate',
        description: `Error rate is at ${errorRate.toFixed(3)}%, slightly above optimal levels.`,
        metric: 'Error Rate',
        value: errorRate,
        threshold: 0.15,
        recommendation: 'Monitor error patterns. Review recent deployments and check for intermittent issues.'
      })
    } else {
      insights.push({
        type: 'success',
        title: 'Error Rate Excellent',
        description: `Error rate is healthy at ${errorRate.toFixed(3)}%, well within production standards.`,
        metric: 'Error Rate',
        value: errorRate,
        threshold: 0.5
      })
    }

    // Add error rate visualization
    visualizations.push({
      type: 'chart',
      title: 'Error Rate Trend',
      description: 'Failed requests over time',
      data: await this.generateErrorRateChart()
    })
  }

  private async evaluateLatencyRules(insights: Insight[], visualizations: Visualization[]) {
    const { p95Latency } = this.metrics

    if (p95Latency > 350) {
      insights.push({
        type: 'error',
        title: 'Severe Latency Issues',
        description: `P95 latency is ${p95Latency.toFixed(0)}ms, significantly impacting user experience.`,
        metric: 'P95 Latency',
        value: p95Latency,
        threshold: 350,
        recommendation: 'Check database query performance, review slow endpoints, and verify cache hit rates. Consider scaling infrastructure.'
      })
    } else if (p95Latency > 200) {
      insights.push({
        type: 'warning',
        title: 'Elevated Latency',
        description: `P95 latency is ${p95Latency.toFixed(0)}ms, slightly above optimal range.`,
        metric: 'P95 Latency',
        value: p95Latency,
        threshold: 200,
        recommendation: 'Optimize slow queries, increase cache usage, and review API endpoint performance.'
      })
    } else {
      insights.push({
        type: 'success',
        title: 'Latency Excellent',
        description: `P95 latency is ${p95Latency.toFixed(0)}ms, providing excellent user experience.`,
        metric: 'P95 Latency',
        value: p95Latency,
        threshold: 150
      })
    }

    visualizations.push({
      type: 'chart',
      title: 'API Response Time Percentiles',
      description: 'Latency distribution • Target: p95 < 150ms',
      data: await this.generateLatencyChart()
    })
  }

  private async evaluateAuthRules(insights: Insight[], visualizations: Visualization[]) {
    const { failedAuth } = this.metrics

    if (failedAuth > 50) {
      insights.push({
        type: 'error',
        title: 'High Authentication Failures',
        description: `${failedAuth} failed authentication attempts detected.`,
        metric: 'Failed Auth',
        value: failedAuth,
        threshold: 50,
        recommendation: 'Possible brute force attack or credential stuffing. Enable rate limiting, review IP patterns, and notify security team.'
      })
    } else if (failedAuth > 20) {
      insights.push({
        type: 'warning',
        title: 'Elevated Auth Failures',
        description: `${failedAuth} failed authentication attempts in recent period.`,
        metric: 'Failed Auth',
        value: failedAuth,
        threshold: 20,
        recommendation: 'Monitor for patterns. Users may be experiencing password issues or there may be automated attempts.'
      })
    } else {
      insights.push({
        type: 'success',
        title: 'Authentication Healthy',
        description: `${failedAuth} failed attempts is within normal range.`,
        metric: 'Failed Auth',
        value: failedAuth,
        threshold: 20
      })
    }

    visualizations.push({
      type: 'chart',
      title: 'Authentication Events',
      description: 'Login attempts and session creation',
      data: await this.generateAuthChart()
    })
  }

  private async evaluateDatabaseRules(insights: Insight[], visualizations: Visualization[]) {
    const { dbConnections } = this.metrics

    const maxConnections = 100
    const utilizationPercent = (dbConnections / maxConnections) * 100

    if (utilizationPercent > 85) {
      insights.push({
        type: 'error',
        title: 'Database Connection Pool Near Capacity',
        description: `Using ${dbConnections}/${maxConnections} connections (${utilizationPercent.toFixed(0)}%).`,
        metric: 'DB Connections',
        value: dbConnections,
        threshold: 85,
        recommendation: 'Increase connection pool size, optimize long-running queries, and check for connection leaks.'
      })
    } else if (utilizationPercent > 60) {
      insights.push({
        type: 'warning',
        title: 'Elevated Database Connection Usage',
        description: `Using ${dbConnections}/${maxConnections} connections (${utilizationPercent.toFixed(0)}%).`,
        metric: 'DB Connections',
        value: dbConnections,
        threshold: 60,
        recommendation: 'Monitor connection pool usage and prepare to scale if trend continues.'
      })
    } else {
      insights.push({
        type: 'success',
        title: 'Database Connections Healthy',
        description: `Using ${dbConnections}/${maxConnections} connections (${utilizationPercent.toFixed(0)}%).`,
        metric: 'DB Connections',
        value: dbConnections,
        threshold: 70
      })
    }

    visualizations.push({
      type: 'chart',
      title: 'Database Connection Pool',
      description: 'Active database connections',
      data: await this.generateDbConnectionChart()
    })
  }

  private async evaluateCacheRules(insights: Insight[], visualizations: Visualization[]) {
    const { cacheHitRate } = this.metrics

    if (cacheHitRate < 95) {
      insights.push({
        type: 'warning',
        title: 'Cache Performance Below Target',
        description: `Cache hit rate is ${cacheHitRate.toFixed(1)}%, below optimal efficiency for a production system.`,
        metric: 'Cache Hit Rate',
        value: cacheHitRate,
        threshold: 95,
        recommendation: 'Review cache TTL settings, increase cache size, or adjust caching strategy for frequently accessed data.'
      })
    } else if (cacheHitRate < 97) {
      insights.push({
        type: 'info',
        title: 'Cache Performance Good',
        description: `Cache hit rate is ${cacheHitRate.toFixed(1)}%, performing well.`,
        metric: 'Cache Hit Rate',
        value: cacheHitRate,
        threshold: 97,
        recommendation: 'Consider caching additional frequently accessed data to improve performance further.'
      })
    } else {
      insights.push({
        type: 'success',
        title: 'Excellent Cache Performance',
        description: `Cache hit rate is ${cacheHitRate.toFixed(1)}%, reducing database load effectively.`,
        metric: 'Cache Hit Rate',
        value: cacheHitRate,
        threshold: 90
      })
    }

    visualizations.push({
      type: 'chart',
      title: 'Cache Hit Rate',
      description: 'Redis cache performance',
      data: await this.generateCacheChart()
    })
  }

  private async evaluateThroughputRules(insights: Insight[], visualizations: Visualization[]) {
    const { throughput } = this.metrics

    if (throughput > 1000) {
      insights.push({
        type: 'info',
        title: 'High Traffic Volume',
        description: `Processing ${throughput.toFixed(0)} requests/sec.`,
        metric: 'Throughput',
        value: throughput,
        recommendation: 'Monitor resource utilization and be prepared to scale if needed.'
      })
    } else if (throughput < 100) {
      insights.push({
        type: 'warning',
        title: 'Low Traffic Volume',
        description: `Only ${throughput.toFixed(0)} requests/sec, significantly below normal.`,
        metric: 'Throughput',
        value: throughput,
        recommendation: 'Check for service disruptions, DNS issues, or upstream problems preventing traffic.'
      })
    } else {
      insights.push({
        type: 'success',
        title: 'Normal Traffic Volume',
        description: `Processing ${throughput.toFixed(0)} requests/sec.`,
        metric: 'Throughput',
        value: throughput
      })
    }

    visualizations.push({
      type: 'chart',
      title: 'Request Throughput',
      description: 'Requests per second',
      data: await this.generateThroughputChart()
    })
  }

  private async evaluateOverallHealth(insights: Insight[], visualizations: Visualization[]) {
    const issues = []
    
    if (this.metrics.errorRate > 0.15) issues.push('elevated error rate')
    if (this.metrics.p95Latency > 200) issues.push('elevated latency')
    if (this.metrics.failedAuth > 20) issues.push('authentication issues')
    if (this.metrics.cacheHitRate < 97) issues.push('cache performance could be better')
    if ((this.metrics.dbConnections / 100) > 0.6) issues.push('elevated database connection usage')

    if (issues.length === 0) {
      insights.push({
        type: 'success',
        title: 'System Health: Excellent',
        description: 'All metrics are within healthy ranges. No immediate action required.',
        recommendation: 'Continue monitoring for any changes in patterns.'
      })
    } else if (issues.length <= 2) {
      insights.push({
        type: 'warning',
        title: 'System Health: Good with Minor Issues',
        description: `Detected ${issues.length} area(s) needing attention: ${issues.join(', ')}.`,
        recommendation: 'Review the specific issues and plan optimizations.'
      })
    } else {
      insights.push({
        type: 'error',
        title: 'System Health: Degraded',
        description: `Multiple issues detected: ${issues.join(', ')}.`,
        recommendation: 'Prioritize critical issues and consider incident response procedures.'
      })
    }

    visualizations.push({
      type: 'metric',
      title: 'System Overview',
      description: 'Key performance indicators',
      data: {
        errorRate: this.metrics.errorRate,
        p95Latency: this.metrics.p95Latency,
        throughput: this.metrics.throughput,
        cacheHitRate: this.metrics.cacheHitRate
      }
    })
  }

  // Chart generation helpers (using Overview styles)
  private async generateErrorRateChart() {
    let data = await this.fetchTimeSeries('Error', 'Sum', 30)
    
    // Calculate error rate percentage if we have request data
    if (data.length > 0) {
      const requestData = await this.fetchTimeSeries('RequestCount', 'Sum', 30)
      if (requestData.length > 0) {
        data = data.map(([time, errors], idx) => {
          const requests = requestData[idx]?.[1] || 1
          const errorRate = requests > 0 ? (errors / requests) * 100 : 0
          return [time, errorRate]
        })
      }
    }
    
    // Fallback to fake data if no real data available
    if (data.length === 0) {
      data = generateTimeSeries(30, this.metrics.errorRate, 0.2)
    }

    return {
      backgroundColor: 'transparent',
      grid: { left: 60, right: 30, top: 50, bottom: 40 },
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
        scale: false,
        min: (value: any) => Math.max(0, value.min - (value.max - value.min) * 0.5),
        max: (value: any) => value.max + (value.max - value.min) * 1.5,
        axisLine: { lineStyle: { color: '#333' } },
        axisLabel: { color: '#666', fontSize: 9, formatter: (val: number) => `${formatNumber2dp(val)}%` },
        splitLine: { lineStyle: { color: '#1a1a1a', type: 'solid' } },
      },
      series: [{
        data,
        type: 'line',
        smooth: 0.4,
        symbol: 'none',
        lineStyle: { color: '#ef4444', width: 2 },
        areaStyle: { 
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: '#ef444440' },
              { offset: 1, color: '#ef444400' }
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
            <div style="color: #999; font-size: 10px; margin-bottom: 2px;">Error Rate</div>
            <div style="font-weight: 600;">${value}%</div>
            <div style="color: #666; font-size: 9px; margin-top: 2px;">${time}</div>
          </div>`
        }
      },
    }
  }

  private async generateLatencyChart() {
    let p50Data = await this.fetchTimeSeries('LatencyMs', 'p50', 30)
    let p75Data = await this.fetchTimeSeries('LatencyMs', 'p75', 30)
    let p90Data = await this.fetchTimeSeries('LatencyMs', 'p90', 30)
    let p95Data = await this.fetchTimeSeries('LatencyMs', 'p95', 30)
    let p99Data = await this.fetchTimeSeries('LatencyMs', 'p99', 30)
    
    // Fallback to fake data if no real data available
    if (p50Data.length === 0) p50Data = generateTimeSeries(30, this.metrics.p95Latency * 0.5, 1.5)
    if (p75Data.length === 0) p75Data = generateTimeSeries(30, this.metrics.p95Latency * 0.75, 2)
    if (p90Data.length === 0) p90Data = generateTimeSeries(30, this.metrics.p95Latency * 0.9, 2)
    if (p95Data.length === 0) p95Data = generateTimeSeries(30, this.metrics.p95Latency, 2.5)
    if (p99Data.length === 0) p99Data = generateTimeSeries(30, this.metrics.p95Latency * 1.2, 3)

    return {
      backgroundColor: 'transparent',
      grid: { left: 60, right: 30, top: 60, bottom: 40 },
      legend: {
        data: ['p50', 'p75', 'p90', 'p95', 'p99'],
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
        scale: false,
        min: (value: any) => Math.max(0, value.min - (value.max - value.min) * 0.5),
        max: (value: any) => value.max + (value.max - value.min) * 1.5,
        axisLine: { lineStyle: { color: '#333' } },
        axisLabel: { color: '#666', fontSize: 9, formatter: (val: number) => `${formatNumber2dp(val)}ms` },
        splitLine: { lineStyle: { color: '#1a1a1a', type: 'solid' } },
      },
      series: [
        { name: 'p50', data: p50Data, type: 'line', smooth: 0.4, symbol: 'none', lineStyle: { color: '#14b8a6', width: 1.5 } },
        { name: 'p75', data: p75Data, type: 'line', smooth: 0.4, symbol: 'none', lineStyle: { color: '#3b82f6', width: 1.5 } },
        { name: 'p90', data: p90Data, type: 'line', smooth: 0.4, symbol: 'none', lineStyle: { color: '#f59e0b', width: 1.5 } },
        { name: 'p95', data: p95Data, type: 'line', smooth: 0.4, symbol: 'none', lineStyle: { color: '#ef4444', width: 1.5 } },
        { name: 'p99', data: p99Data, type: 'line', smooth: 0.4, symbol: 'none', lineStyle: { color: '#8b5cf6', width: 1.5 } },
      ],
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
    }
  }

  private async generateAuthChart() {
    // Auth failures are tracked as errors in CloudWatch
    let data = await this.fetchTimeSeries('Error', 'Sum', 30)
    if (data.length === 0) {
      data = generateTimeSeries(30, this.metrics.throughput * 0.15, 4)
    }

    return {
      backgroundColor: 'transparent',
      grid: { left: 60, right: 30, top: 50, bottom: 40 },
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
        scale: false,
        min: (value: any) => Math.max(0, value.min - (value.max - value.min) * 0.5),
        max: (value: any) => value.max + (value.max - value.min) * 1.5,
        axisLine: { lineStyle: { color: '#333' } },
        axisLabel: { color: '#666', fontSize: 9, formatter: (val: number) => `${formatNumber2dp(val)}/min` },
        splitLine: { lineStyle: { color: '#1a1a1a', type: 'solid' } },
      },
      series: [{
        data,
          type: 'line',
        smooth: 0.4,
        symbol: 'none',
        lineStyle: { color: '#3b82f6', width: 2 },
        areaStyle: { 
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: '#3b82f640' },
              { offset: 1, color: '#3b82f600' }
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
            <div style="color: #999; font-size: 10px; margin-bottom: 2px;">Auth Events</div>
            <div style="font-weight: 600;">${value}/min</div>
            <div style="color: #666; font-size: 9px; margin-top: 2px;">${time}</div>
          </div>`
        }
      },
    }
  }

  private async generateDbConnectionChart() {
    // Note: DatabaseConnections uses a different dimension (Resource instead of Endpoint)
    let data = await this.fetchTimeSeries('DatabaseConnections', 'Average', 30)
    if (data.length === 0) {
      data = generateTimeSeries(30, this.metrics.dbConnections, 3)
    }

    return {
      backgroundColor: 'transparent',
      grid: { left: 60, right: 30, top: 50, bottom: 40 },
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
        scale: false,
        min: (value: any) => Math.max(0, value.min - (value.max - value.min) * 0.5),
        max: (value: any) => Math.min(100, value.max + (value.max - value.min) * 1.5),
        axisLine: { lineStyle: { color: '#333' } },
        axisLabel: { color: '#666', fontSize: 9 },
        splitLine: { lineStyle: { color: '#1a1a1a', type: 'solid' } },
      },
      series: [{
        data,
        type: 'line',
        smooth: 0.4,
        symbol: 'none',
        lineStyle: { color: '#14b8a6', width: 2 },
        areaStyle: { 
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: '#14b8a640' },
              { offset: 1, color: '#14b8a600' }
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
            <div style="color: #999; font-size: 10px; margin-bottom: 2px;">DB Connections</div>
            <div style="font-weight: 600;">${value}/100</div>
            <div style="color: #666; font-size: 9px; margin-top: 2px;">${time}</div>
          </div>`
        }
      },
    }
  }

  private async generateCacheChart() {
    let data = await this.fetchTimeSeries('CacheHitRate', 'Average', 30)
    if (data.length === 0) {
      data = generateTimeSeries(30, this.metrics.cacheHitRate, 1.5)
    }

    return {
      backgroundColor: 'transparent',
      grid: { left: 60, right: 30, top: 50, bottom: 40 },
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
        scale: false,
        min: (value: any) => Math.max(0, value.min - (value.max - value.min) * 0.5),
        max: (value: any) => Math.min(100, value.max + (value.max - value.min) * 1.5),
        axisLine: { lineStyle: { color: '#333' } },
        axisLabel: { color: '#666', fontSize: 9, formatter: (val: number) => `${formatNumber2dp(val)}%` },
        splitLine: { lineStyle: { color: '#1a1a1a', type: 'solid' } },
      },
      series: [{
        data,
        type: 'line',
        smooth: 0.4,
        symbol: 'none',
        lineStyle: { color: '#8b5cf6', width: 2 },
        areaStyle: { 
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: '#8b5cf640' },
              { offset: 1, color: '#8b5cf600' }
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
            <div style="color: #999; font-size: 10px; margin-bottom: 2px;">Cache Hit Rate</div>
            <div style="font-weight: 600;">${value}%</div>
            <div style="color: #666; font-size: 9px; margin-top: 2px;">${time}</div>
          </div>`
        }
      },
    }
  }

  private async generateThroughputChart() {
    let data = await this.fetchTimeSeries('RequestCount', 'Sum', 30)
    if (data.length === 0) {
      data = generateTimeSeries(30, this.metrics.throughput, 20)
    }

    return {
      backgroundColor: 'transparent',
      grid: { left: 60, right: 30, top: 50, bottom: 40 },
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
        scale: false,
        min: (value: any) => Math.max(0, value.min - (value.max - value.min) * 0.5),
        max: (value: any) => value.max + (value.max - value.min) * 1.5,
        axisLine: { lineStyle: { color: '#333' } },
        axisLabel: { color: '#666', fontSize: 9, formatter: (val: number) => `${formatNumber2dp(val)}` },
        splitLine: { lineStyle: { color: '#1a1a1a', type: 'solid' } },
      },
      series: [{
        data,
        type: 'line',
        smooth: 0.4,
        symbol: 'none',
        lineStyle: { color: '#14b8a6', width: 2 },
        areaStyle: { 
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: '#14b8a640' },
              { offset: 1, color: '#14b8a600' }
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
            <div style="color: #999; font-size: 10px; margin-bottom: 2px;">Throughput</div>
            <div style="font-weight: 600;">${value} req/s</div>
            <div style="color: #666; font-size: 9px; margin-top: 2px;">${time}</div>
          </div>`
        }
      },
    }
  }
}

export function Assistant() {
  const [isConfigured, setIsConfigured] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [currentVizIndex, setCurrentVizIndex] = useState(0)
  const [vizKey, setVizKey] = useState(0)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [metrics, setMetrics] = useState<MetricData>({
    errorRate: 2.3,
    p95Latency: 156,
    throughput: 458,
    failedAuth: 23,
    cacheHitRate: 94.5,
    dbConnections: 45,
    queueDepth: 12
  })
  const [timeSeriesCache, setTimeSeriesCache] = useState<{
    [key: string]: [number, number][]
  }>({})
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const configured = localStorage.getItem('cw_is_configured') === '1'
    setIsConfigured(configured)
  }, [])

  useEffect(() => {
    if (isConfigured) {
    // Fetch real metrics from CloudWatch
    fetchMetrics()
    const interval = setInterval(fetchMetrics, 30000) // Update every 30s
    return () => clearInterval(interval)
    }
  }, [isConfigured])

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [messages])

  const fetchCloudWatchTimeSeries = async (metric: string, stat: string, minutes: number = 30): Promise<[number, number][]> => {
    try {
      const token = localStorage.getItem('auth_token')
      const namespace = localStorage.getItem('cw_namespace') || '1PasswordSimulator'
      
      // Determine endpoint/resource based on metric type
      const endpoint = (metric === 'DatabaseConnections' || metric === 'CacheHitRate') 
        ? (metric === 'DatabaseConnections' ? 'primary-db' : 'redis')
        : '/api/v1/items/get'
      
      const cacheKey = `${metric}_${stat}_${minutes}`
      if (timeSeriesCache[cacheKey]) {
        return timeSeriesCache[cacheKey]
      }
      
      const response = await fetch(
        `${API_URL}/api/v1/cloudwatch/metrics/timeseries?ns=${encodeURIComponent(namespace)}&metric=${metric}&endpoint=${encodeURIComponent(endpoint)}&stat=${stat}&minutes=${minutes}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      )
      
      if (response.ok) {
        const json = await response.json()
        const data = json.data || []
        setTimeSeriesCache(prev => ({ ...prev, [cacheKey]: data }))
        return data
      }
    } catch (error) {
      console.error('Failed to fetch time-series:', error)
    }
    return []
  }

  const fetchMetrics = async () => {
    try {
      const token = localStorage.getItem('auth_token')
      const namespace = localStorage.getItem('cw_namespace') || '1PasswordSimulator'
      
      const response = await fetch(
        `${API_URL}/api/v1/cloudwatch/summary?ns=${encodeURIComponent(namespace)}&endpoint=/api/v1/items/get&minutes=60`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      )
      
      if (response.ok) {
        const data = await response.json()
        
        // Fetch additional infrastructure metrics
        const dbData = await fetchCloudWatchTimeSeries('DatabaseConnections', 'Average', 5)
        const cacheData = await fetchCloudWatchTimeSeries('CacheHitRate', 'Average', 5)
        
        const latestDbConnections = dbData.length > 0 ? dbData[dbData.length - 1][1] : 45
        const latestCacheHitRate = cacheData.length > 0 ? cacheData[cacheData.length - 1][1] : 94.5
        
        setMetrics({
          errorRate: (data.error_rate * 100) || 2.3,
          p95Latency: data.p95_ms || 156,
          throughput: data.requests / 60 || 458,
          failedAuth: Math.floor(data.errors || 23),
          cacheHitRate: latestCacheHitRate,
          dbConnections: latestDbConnections,
          queueDepth: 12
        })
      }
    } catch (error) {
      console.error('Failed to fetch metrics:', error)
    }
  }

  const handleSend = async () => {
    if (!input.trim()) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 500))

    // Run rules engine with real time-series fetcher
    const engine = new RulesEngine(metrics, fetchCloudWatchTimeSeries)
    const { insights, visualizations } = await engine.analyzeQuery(input)

    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: generateResponse(insights, input),
      timestamp: new Date(),
      insights,
      visualizations
    }

    setMessages(prev => [...prev, assistantMessage])
    setIsLoading(false)
    
    // Trigger fade out/in transition for new visualizations
    if (visualizations.length > 0) {
      setIsTransitioning(true)
      setTimeout(() => {
        setCurrentVizIndex(0)
        setVizKey(prev => prev + 1)
        setIsTransitioning(false)
      }, 300)
    }
  }

  const generateResponse = (insights: Insight[], query: string): string => {
    if (insights.length === 0) {
      return "I've analyzed your system but couldn't find specific issues related to your query. Could you provide more details?"
    }

    const criticalCount = insights.filter(i => i.type === 'error').length
    const warningCount = insights.filter(i => i.type === 'warning').length
    const successCount = insights.filter(i => i.type === 'success').length
    
    // Extract query context
    const queryLower = query.toLowerCase()
    const isPerformanceQuery = queryLower.includes('performance') || queryLower.includes('slow') || queryLower.includes('latency')
    const isAuthQuery = queryLower.includes('auth') || queryLower.includes('login')
    const isDatabaseQuery = queryLower.includes('database') || queryLower.includes('db') || queryLower.includes('connection')
    const isErrorQuery = queryLower.includes('error') || queryLower.includes('wrong') || queryLower.includes('issue')

    // Generate personalized intro
    let intro = ''

    if (criticalCount > 0) {
      if (isPerformanceQuery) {
        intro = `I've analyzed your application's performance and found ${criticalCount} critical issue${criticalCount > 1 ? 's' : ''} that ${criticalCount > 1 ? 'are' : 'is'} affecting speed. Here's my analysis:`
      } else if (isAuthQuery) {
        intro = `I've checked your authentication systems and identified ${criticalCount} critical issue${criticalCount > 1 ? 's' : ''} requiring immediate attention. Here's what I found:`
      } else if (isDatabaseQuery) {
        intro = `I've reviewed your database performance and found ${criticalCount} critical issue${criticalCount > 1 ? 's' : ''} that need${criticalCount === 1 ? 's' : ''} your attention. Here's my analysis:`
      } else if (isErrorQuery) {
        intro = `I've investigated the errors in your system and found ${criticalCount} critical issue${criticalCount > 1 ? 's' : ''}. Here's what I found:`
      } else {
        intro = `I've identified ${criticalCount} critical issue${criticalCount > 1 ? 's' : ''} that need${criticalCount === 1 ? 's' : ''} your attention. Here's what I found:`
      }
    } else if (warningCount > 0) {
      if (isPerformanceQuery) {
        intro = `Regarding your performance concerns, I've found ${warningCount} area${warningCount > 1 ? 's' : ''} that could use some attention. Here's my analysis:`
      } else if (isAuthQuery) {
        intro = `I've examined your authentication flow and found ${warningCount} area${warningCount > 1 ? 's' : ''} that could be improved. Here's my analysis:`
      } else if (isDatabaseQuery) {
        intro = `I've analyzed your database metrics and found ${warningCount} area${warningCount > 1 ? 's' : ''} that could use some attention. Here's my analysis:`
      } else if (isErrorQuery) {
        intro = `I've checked for errors and found ${warningCount} area${warningCount > 1 ? 's' : ''} that could use some attention. Here's my analysis:`
    } else {
        intro = `I've found ${warningCount} area${warningCount > 1 ? 's' : ''} that could use some attention. Here's my analysis:`
      }
    } else if (successCount > 0) {
      if (isPerformanceQuery) {
        intro = "Good news! Your application's performance is healthy. Here's a detailed breakdown:"
      } else if (isAuthQuery) {
        intro = "Good news! Your authentication systems are functioning properly. Here's a detailed breakdown:"
      } else if (isDatabaseQuery) {
        intro = "Good news! Your database is performing well. Here's a detailed breakdown:"
      } else {
        intro = "Good news! Your system is performing well. Here's a detailed breakdown:"
      }
    }
    
    return intro
  }


  const suggestedQueries = [
    "What's wrong with my application?",
    "Why is performance slow?",
    "Are there any authentication issues?",
    "How is my database performing?",
    "Show me error trends"
  ]

  // Get the latest message's visualizations
  const latestVisualizations = useMemo(() => {
    const lastMessage = messages
              .filter(m => m.visualizations && m.visualizations.length > 0)
              .slice(-1)[0]
    return lastMessage?.visualizations || []
  }, [messages])

  // Current visualization to display
  const currentViz = latestVisualizations[currentVizIndex]

  // Show configuration required message if not configured
  if (!isConfigured) {
    return (
      <div className="space-y-3 px-6 py-4">
        <Card className="!border-white/10">
          <CardHeader className="text-center pb-6">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <AlertCircle className="h-8 w-8 text-primary" />
              </div>
            </div>
            <CardTitle className="text-2xl mb-2">Connect Your Data Source</CardTitle>
            <CardDescription className="text-base max-w-2xl mx-auto">
              Configure your monitoring namespace on the Overview page to start using the AI Copilot.
            </CardDescription>
                  </CardHeader>
          <CardContent className="pb-8">
            <div className="max-w-2xl mx-auto space-y-4">
              <div className="p-4 rounded border border-border bg-black/30">
                <div className="text-sm font-medium mb-2">To get started:</div>
                <div className="text-xs text-foreground/70 space-y-2">
                  <div>1. Navigate to the Overview page</div>
                  <div>2. Enter your monitoring namespace</div>
                  <div>3. Return here to chat with the AI about your metrics</div>
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
    <div className="h-full flex gap-0 overflow-hidden">
      {/* Visualizations Section - Left Half */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden border-r-2 border-white/20 max-w-[45%] shadow-[4px_0_20px_rgba(0,0,0,0.5)]">
        <div className="flex-shrink-0 px-6 pt-6 pb-5 border-b border-white/10">
          {currentViz ? (
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Additional Context</h2>
              {latestVisualizations.length > 1 && (
                <div className="text-xs text-foreground/50 font-medium px-2.5 py-1 rounded-full bg-white/5">
                  {currentVizIndex + 1} of {latestVisualizations.length}
                </div>
              )}
            </div>
          ) : (
            <h2 className="text-lg font-semibold text-white">Additional Context</h2>
          )}
        </div>
        
        <div className="flex-1 px-8 py-8 overflow-hidden flex items-center justify-center">
          {currentViz ? (
            <div 
              key={vizKey} 
              className="w-full overflow-hidden animate-scale-in"
              style={{
                opacity: isTransitioning ? 0 : 1,
                transform: isTransitioning ? 'scale(0.9) translateY(20px)' : 'scale(1) translateY(0)',
                transition: 'opacity 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
                maxHeight: '540px',
              }}
            >
              <Card className="!border-white/20 !bg-white/[0.03] flex flex-col overflow-hidden shadow-xl backdrop-blur-sm">
                <CardHeader className="pb-4 flex-shrink-0 border-b border-white/10">
                  <CardTitle className="text-base font-semibold text-white">{currentViz.title}</CardTitle>
                  {currentViz.description && (
                    <CardDescription className="text-xs text-foreground/70 mt-2 leading-relaxed">{currentViz.description}</CardDescription>
                  )}
                  </CardHeader>
                <CardContent className="overflow-hidden p-5" style={{ height: '440px' }}>
                  {currentViz.type === 'chart' && (
                    <div className="w-full h-full overflow-hidden">
                      <ReactECharts
                        option={currentViz.data}
                        style={{ height: '100%', width: '100%' }}
                        opts={{ renderer: 'canvas' }}
                        notMerge={true}
                        lazyUpdate={true}
                      />
                    </div>
                  )}
                  {currentViz.type === 'metric' && (
                    <div className="w-full h-full flex items-center justify-center overflow-hidden">
                      <div className="grid grid-cols-2 gap-5 max-w-md">
                        <div className="p-6 rounded-xl bg-white/[0.02] border border-white/20 backdrop-blur-sm shadow-md hover:border-white/30 transition-all">
                          <div className="text-xs text-foreground/70 mb-2.5 font-medium uppercase tracking-wider">Error Rate</div>
                          <div className="text-2xl font-semibold text-white">{currentViz.data.errorRate.toFixed(2)}%</div>
                        </div>
                        <div className="p-6 rounded-xl bg-white/[0.02] border border-white/20 backdrop-blur-sm shadow-md hover:border-white/30 transition-all">
                          <div className="text-xs text-foreground/70 mb-2.5 font-medium uppercase tracking-wider">P95 Latency</div>
                          <div className="text-2xl font-semibold text-white">{currentViz.data.p95Latency.toFixed(0)}ms</div>
                        </div>
                        <div className="p-6 rounded-xl bg-white/[0.02] border border-white/20 backdrop-blur-sm shadow-md hover:border-white/30 transition-all">
                          <div className="text-xs text-foreground/70 mb-2.5 font-medium uppercase tracking-wider">Throughput</div>
                          <div className="text-2xl font-semibold text-white">{currentViz.data.throughput.toFixed(0)}/s</div>
                        </div>
                        <div className="p-6 rounded-xl bg-white/[0.02] border border-white/20 backdrop-blur-sm shadow-md hover:border-white/30 transition-all">
                          <div className="text-xs text-foreground/70 mb-2.5 font-medium uppercase tracking-wider">Cache Hit</div>
                          <div className="text-2xl font-semibold text-white">{currentViz.data.cacheHitRate.toFixed(1)}%</div>
                        </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
            </div>
        ) : (
            <div className="h-full flex items-center justify-center">
              <p className="text-sm text-foreground/50 px-6 py-4 rounded-xl bg-white/[0.02] border border-white/10">Context will appear here</p>
          </div>
        )}
        </div>
      </div>

      {/* Chat Section - Right Half */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Messages Container */}
          <div className="flex-1 overflow-y-auto px-6 pt-6 pb-4">
            <div className="space-y-6">
              {/* Welcome Message - Always Visible */}
              <div className="flex flex-col items-center justify-center text-center py-8 mb-6 animate-fade-in">
                <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">How can I help you today?</h3>
                <p className="text-sm text-foreground/60 max-w-md">
                      I can analyze your application's health, identify issues, and provide recommendations based on real-time metrics.
                    </p>
                    </div>

              {/* Conversation Divider */}
              {messages.length > 0 && (
                <div className="flex items-center gap-3 my-6">
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                  <span className="text-xs text-foreground/40">Conversation</span>
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                  </div>
                )}

              {messages.map((message, idx) => (
                <div 
                  key={message.id} 
                  className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : ''} animate-slide-in`}
                  style={{
                    animation: `slideIn 0.3s ease-out ${idx * 0.05}s both`
                  }}
                >
                    <div className={`flex-1 ${message.role === 'user' ? 'flex justify-end' : ''}`}>
                    <div className={`rounded-xl p-5 ${
                        message.role === 'user' 
                        ? 'bg-blue-600 text-white ml-auto max-w-lg shadow-lg' 
                        : 'bg-white/[0.03] border border-white/20 max-w-3xl backdrop-blur-sm shadow-md'
                      }`}>
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
                        
                        {message.insights && message.insights.length > 0 && (
                          <div className="mt-4 space-y-3">
                          {message.insights.map((insight, insightIdx) => (
                            <div 
                              key={insightIdx} 
                              className="p-4 rounded-lg border border-white/20 bg-black/40 animate-fade-in backdrop-blur-sm"
                              style={{
                                animation: `fadeIn 0.3s ease-out ${(insightIdx + 1) * 0.1}s both`
                              }}
                            >
                                <div className="flex-1">
                                <h4 className="text-sm font-semibold text-white mb-1.5">{insight.title}</h4>
                                <p className="text-xs text-foreground/80 leading-relaxed">{insight.description}</p>
                                </div>
                                {insight.recommendation && (
                                <div className="mt-3 pt-3 border-t border-white/10">
                                  <p className="text-xs text-blue-400 leading-relaxed">
                                    <strong className="font-semibold">Recommendation:</strong> {insight.recommendation}
                                    </p>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {isLoading && (
                <div className="flex gap-3 animate-fade-in">
                    <div className="bg-black/50 border border-white/10 rounded-lg p-4">
                      <div className="flex gap-2">
                        <div className="w-2 h-2 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
            </div>
              </div>

          {/* Suggestions Section - Always Above Input */}
          <div className="flex-shrink-0 px-6 pb-3 border-t border-border/30 pt-3 animate-slide-up" style={{ animation: messages.length === 0 ? 'slideUp 0.4s ease-out 0.2s both' : 'none' }}>
            <div className="space-y-2">
              <p className="text-xs text-foreground/50 font-medium">Suggested queries:</p>
              <div className="flex flex-wrap gap-2">
                {suggestedQueries.map((query, idx) => (
                  <button
                    key={idx}
                    onClick={() => setInput(query)}
                    className="text-left px-4 py-2 rounded-full border border-white/10 bg-black/60 hover:bg-white/5 hover:border-blue-500/30 text-xs text-foreground/80 transition-all duration-200 hover:scale-[1.02] hover:shadow-lg hover:shadow-blue-500/10"
                    style={{
                      animation: messages.length === 0 ? `fadeIn 0.3s ease-out ${0.3 + idx * 0.05}s both` : 'none'
                    }}
                  >
                    {query}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Input Section - Fixed at Bottom */}
          <div className="flex-shrink-0 border-t border-border px-6 py-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="Ask about your application's health..."
                  className="flex-1 px-4 py-3 bg-black/50 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-blue-500/50 transition-colors"
                  disabled={isLoading}
                />
                <Button
                  onClick={handleSend}
                  disabled={isLoading || !input.trim()}
                  className="px-4 bg-blue-600 hover:bg-blue-700"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
          </div>
          
          <style>{`
            @keyframes fadeIn {
              from {
                opacity: 0;
              }
              to {
                opacity: 1;
              }
            }
            
            @keyframes slideIn {
              from {
                opacity: 0;
                transform: translateY(10px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }
            
            @keyframes slideUp {
              from {
                opacity: 0;
                transform: translateY(20px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }
            
            @keyframes scaleIn {
              from {
                opacity: 0;
                transform: scale(0.9) translateY(20px);
              }
              to {
                opacity: 1;
                transform: scale(1) translateY(0);
              }
            }
            
            .animate-fade-in {
              animation: fadeIn 0.4s ease-out;
            }
            
            .animate-slide-in {
              animation: slideIn 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            }
            
            .animate-slide-up {
              animation: slideUp 0.5s cubic-bezier(0.4, 0, 0.2, 1);
            }
            
            .animate-scale-in {
              animation: scaleIn 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
            }
          `}</style>
        </div>
      </div>
    </div>
  )
}

