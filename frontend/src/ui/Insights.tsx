import { useState } from 'react'

type InsightsResponse = {
  answer: string
  links: string[]
  confidence?: number
  filters?: { region?: string; tenant?: string; window?: '5m'|'1h'|'24h' }
  assumptions?: string[]
}

export function Insights({ region, tenant, windowSel }: { region: string; tenant: string; windowSel: '5m'|'1h'|'24h' }) {
  const [q, setQ] = useState('Why is DB slow?')
  const [resp, setResp] = useState<InsightsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const token = import.meta.env.VITE_ADMIN_TOKEN || 'dev-admin-token'

  async function submit() {
    setLoading(true)
    setError(null)
    setResp(null)
    try {
      const r = await fetch('/api/v1/insights/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ question: q, filters: { region, tenant, window: windowSel } })
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setResp(await r.json())
    } catch (e:any) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="border rounded p-4 mt-6">
      <div className="font-medium mb-2">Insights</div>
      <div className="flex gap-2">
        <input className="border rounded px-2 py-1 flex-1" value={q} onChange={e=>setQ(e.target.value)} placeholder="Ask a question about your systems" />
        <button className="px-3 py-1 rounded bg-gray-900 text-white disabled:opacity-50" onClick={submit} disabled={loading}>{loading? 'Asking…':'Ask'}</button>
      </div>
      {error && <div className="text-red-600 mt-2">{error}</div>}
      {resp && (
        <div className="mt-3 space-y-2">
          <div>{resp.answer}</div>
          <div className="text-sm text-gray-500 flex gap-3 flex-wrap">
            {resp.links.map((l, i) => (
              <a key={i} href={l} className="underline">Link {i+1}</a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}



