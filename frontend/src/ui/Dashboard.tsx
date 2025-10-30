import { useEffect, useState } from 'react'
import { Card } from '../components/ui/card'
import { Badge } from '../components/ui/badge'

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

async function fetchJSON<T>(path: string, token: string): Promise<T> {
  const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export function Dashboard({ region, tenant, windowSel }: { region: string; tenant: string; windowSel: '5m'|'1h'|'24h' }) {
  const [data, setData] = useState<SummaryResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const token = import.meta.env.VITE_ADMIN_TOKEN || 'dev-admin-token'

  useEffect(() => {
    setError(null)
    setData(null)
    const controller = new AbortController()
    fetchJSON<SummaryResponse>(`/api/v1/summary?region=${region}&tenant=${tenant}&window=${windowSel}`, token)
      .then(setData)
      .catch(e => setError(String(e)))
    return () => controller.abort()
  }, [region, tenant, windowSel])

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {error && <div className="col-span-full text-red-600">{error}</div>}
      {!data && !error && Array.from({length:4}).map((_,i)=>(<div key={i} className="card animate-pulse h-28"/>))}
      {data && (
        <>
          <Panel title="Databases" health={data.databases.health}>
            <Kpi label="p95" value={`${data.databases.p95_ms.toFixed(0)} ms`} />
            <Kpi label="Active/Max" value={`${data.databases.active_connections}/${data.databases.max_connections}`} />
            <Kpi label="Repl Lag" value={`${data.databases.replication_lag_sec.toFixed(1)} s`} />
          </Panel>
          <Panel title="Redis" health={data.redis.health}>
            <Kpi label="Hit Ratio" value={`${Math.round(data.redis.hit_ratio*100)}%`} />
            <Kpi label="Memory" value={`${Math.round(data.redis.mem_used_mb)} MB`} />
            <Kpi label="Evictions" value={`${data.redis.evictions}`} />
          </Panel>
          <Panel title="Queues" health={data.queues.health}>
            <Kpi label="Depth" value={`${data.queues.queue_depth}`} />
            <Kpi label="Lag" value={`${data.queues.consumer_lag}`} />
            <Kpi label="Oldest" value={`${data.queues.oldest_age_sec}s`} />
          </Panel>
          <Panel title="Search" health={data.search.health}>
            <Kpi label="Status" value={data.search.cluster_status.toUpperCase()} />
            <Kpi label="Red/Yellow" value={`${data.search.red_indices}/${data.search.yellow_indices}`} />
            <Kpi label="p95" value={`${data.search.query_p95_ms.toFixed(0)} ms`} />
          </Panel>
        </>
      )}
    </div>
  )
}

function Panel({ title, children, health }: { title: string; children: React.ReactNode; health: string }) {
  const badgeVariant = health === 'healthy' ? 'green' : health === 'warning' ? 'amber' : 'red'
  return (
    <Card title={title} action={<Badge variant={badgeVariant as any}>{health}</Badge>}>
      <div className="grid grid-cols-3 gap-2 text-sm">
        {children}
      </div>
    </Card>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-gray-500">{label}</span>
      <span className="text-lg font-semibold">{value}</span>
    </div>
  )
}


