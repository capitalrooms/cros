'use client'

// The yearly certificate round: every house, its certificates uploaded since a date, one send to all tenants.
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'
import { adminFetch } from '@/lib/adminFetch'

interface House { id: string; name: string; address: string; fresh: { key: string; label: string }[]; older: string[]; tenants: number; lastSent: string | null }

const d = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

export default function CertificateRound() {
  const [since, setSince] = useState(`${new Date().getFullYear()}-07-01`)
  const [houses, setHouses] = useState<House[] | null>(null)
  const [commsLive, setCommsLive] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setHouses(null); setError('')
    try {
      const r = await adminFetch(`/api/admin/house-docs/bulk?since=${since}`)
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Could not load the houses')
      setHouses(j.houses); setCommsLive(j.commsLive); setMessage(m => m || j.defaultMessage)
      setPicked(new Set(j.houses.filter((h: House) => h.fresh.length && h.tenants).map((h: House) => h.id)))
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load the houses') }
  }, [since])
  useEffect(() => { load() }, [load])

  async function post(action: 'test' | 'send') {
    const chosen = (houses ?? []).filter(h => picked.has(h.id))
    const people = chosen.reduce((n, h) => n + h.tenants, 0)
    if (action === 'send' && !window.confirm(`Send certificates to ${people} tenants across ${chosen.length} houses?`)) return
    setBusy(action); setError(''); setNotice('')
    try {
      const r = await adminFetch('/api/admin/house-docs/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, since, message, propertyIds: chosen.map(h => h.id) }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Could not send')
      if (action === 'test') setNotice(`Test (${chosen[0]?.name}) sent to ${j.sentTo}.`)
      else { setNotice(j.results.map((x: any) => `${x.house}: ${x.sent ? `sent to ${x.sent}` : x.skipped}${x.failed?.length ? `, failed ${x.failed.join(', ')}` : ''}`).join(' · ')); load() }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not send') }
    finally { setBusy('') }
  }

  const chosen = (houses ?? []).filter(h => picked.has(h.id))
  const people = chosen.reduce((n, h) => n + h.tenants, 0)

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin/compliance" />} title="Certificate round" />
      <PageHero title="Send Certificates" subtitle={<>Every house, with the certificates uploaded since the date below. Each tenant gets their own email for their house, with a link to each certificate and when it’s next due.</>} />
      <div className="mx-auto max-w-6xl px-lg py-xl space-y-lg">
        <div>
        </div>

        <div className="flex flex-wrap items-center gap-sm rounded-2xl bg-white p-md text-sm">
          <span className="text-neutral-700">Certificates uploaded since</span>
          <input type="date" value={since} onChange={e => setSince(e.target.value)} className="rounded-lg border border-neutral-300 px-sm py-xs text-sm text-neutral-900" />
          <span className="ml-auto text-neutral-500">{chosen.length} houses · {people} tenants ticked</span>
        </div>

        {error && <p className="rounded-xl bg-red-50 px-md py-sm text-sm text-red-700">{error}</p>}
        {notice && <p className="rounded-xl bg-green-50 px-md py-sm text-sm text-green-800">{notice}</p>}

        {!houses ? <p className="text-sm text-neutral-400">Checking every house…</p> : (
          <div className="overflow-x-auto rounded-2xl bg-white">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-neutral-100 text-left text-xs uppercase tracking-wide text-neutral-500">
                  <th className="px-md py-sm"></th><th className="px-md py-sm">House</th><th className="px-md py-sm">New certificates</th><th className="px-md py-sm">Tenants</th><th className="px-md py-sm">Last sent</th><th className="px-md py-sm"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {houses.map(h => (
                  <tr key={h.id} className="align-top">
                    <td className="px-md py-sm"><input type="checkbox" disabled={!h.fresh.length || !h.tenants} checked={picked.has(h.id)} onChange={e => setPicked(p => { const n = new Set(p); if (e.target.checked) n.add(h.id); else n.delete(h.id); return n })} /></td>
                    <td className="px-md py-sm font-semibold text-neutral-900">{h.name}</td>
                    <td className="px-md py-sm">
                      {h.fresh.length ? <span className="text-neutral-800">{h.fresh.map(f => f.label).join(', ')}</span> : <span className="text-amber-700">None uploaded since {d(since)}</span>}
                    </td>
                    <td className="px-md py-sm tabular-nums">{h.tenants || <span className="text-neutral-400">none</span>}</td>
                    <td className="px-md py-sm text-neutral-600">{h.lastSent ? d(h.lastSent) : '—'}</td>
                    <td className="px-md py-sm text-right"><Link href={`/admin/properties/${h.id}/send-documents`} className="text-xs font-semibold text-neutral-500 underline whitespace-nowrap">Open house</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <section className="rounded-2xl bg-white p-lg space-y-sm">
          <label className="block text-xs font-semibold text-neutral-700">Message (goes above the list of certificates)
            <textarea rows={3} value={message} onChange={e => setMessage(e.target.value)} className="mt-xs w-full rounded-lg border border-neutral-300 px-md py-sm text-sm text-neutral-900" />
          </label>
          {!commsLive && <p className="rounded-lg bg-amber-50 px-md py-sm text-xs text-amber-900">Tenant messages are paused in Settings, so sending to tenants is off. You can send yourself a test of the first ticked house.</p>}
          <div className="flex flex-wrap gap-sm">
            <button onClick={() => post('send')} disabled={!!busy || !commsLive || !chosen.length} className="rounded-lg bg-neutral-900 px-lg py-sm text-sm font-bold text-white disabled:bg-neutral-300">{busy === 'send' ? 'Sending…' : `Send to ${people} tenants`}</button>
            <button onClick={() => post('test')} disabled={!!busy || !chosen.length} className="rounded-lg border border-neutral-300 px-md py-sm text-sm font-bold text-neutral-800">{busy === 'test' ? 'Sending…' : 'Send test to me'}</button>
          </div>
        </section>
      </div>
    </div>
  )
}
