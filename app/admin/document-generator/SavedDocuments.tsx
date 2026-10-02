'use client'

// Every letter and invoice made on this page: view, download or delete (delete hides it; the record is kept).
import { useCallback, useEffect, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'

interface Doc {
  id: string
  kind: 'invoice' | 'letter'
  number: string | null
  title: string
  recipient_name: string
  total: number | null
  created_at: string
  created_by: string | null
  emailed_at: string | null
  emailed_to: string[] | null
}

const when = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const money = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function SavedDocuments({ refreshKey }: { refreshKey: number }) {
  const [docs, setDocs] = useState<Doc[] | null>(null)
  const [setupNeeded, setSetupNeeded] = useState(false)
  const [filter, setFilter] = useState<'all' | 'invoice' | 'letter'>('all')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const r = await adminFetch('/api/admin/documents/generated')
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error ?? 'Could not load your documents'); setDocs([]); return }
    setDocs(d.documents ?? []); setSetupNeeded(!!d.setupNeeded); setError('')
  }, [])
  useEffect(() => { load() }, [load, refreshKey])

  async function open(doc: Doc, mode: 'view' | 'download') {
    const win = mode === 'view' ? window.open('', '_blank') : null   // open now, while the click still allows it
    setBusy(doc.id + mode)
    try {
      const r = await adminFetch(`/api/admin/documents/generated?id=${doc.id}&mode=${mode}`)
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.url) throw new Error(d.error ?? 'Could not open it')
      if (win) win.location.href = d.url
      else { const a = document.createElement('a'); a.href = d.url; a.click() }
    } catch (e) {
      win?.close()
      setError(e instanceof Error ? e.message : 'Could not open it')
    } finally { setBusy('') }
  }

  async function remove(doc: Doc) {
    const name = doc.kind === 'invoice' ? `invoice ${doc.number}` : `letter “${doc.title}”`
    if (!window.confirm(`Delete ${name} to ${doc.recipient_name}? It disappears from this list; a copy is kept on record.`)) return
    setBusy(doc.id + 'delete')
    const r = await adminFetch(`/api/admin/documents/generated?id=${doc.id}`, { method: 'DELETE' })
    const d = await r.json().catch(() => ({}))
    setBusy('')
    if (!r.ok) { setError(d.error ?? 'Could not delete it'); return }
    setDocs(list => (list ?? []).filter(x => x.id !== doc.id))
  }

  const q = query.trim().toLowerCase()
  const shown = (docs ?? []).filter(d => (filter === 'all' || d.kind === filter) &&
    (!q || [d.number, d.title, d.recipient_name].some(v => (v ?? '').toLowerCase().includes(q))))

  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-lg">
      <div className="flex flex-wrap items-center justify-between gap-sm mb-md">
        <h2 className="font-semibold text-neutral-900">Your letters &amp; invoices</h2>
        <div className="flex flex-wrap items-center gap-sm">
          <div className="inline-flex rounded-lg border border-neutral-200 p-0.5 bg-neutral-50">
            {([['all', 'All'], ['invoice', 'Invoices'], ['letter', 'Letters']] as const).map(([v, l]) => (
              <button key={v} type="button" onClick={() => setFilter(v)}
                className={`rounded-md px-sm py-0.5 text-xs font-semibold ${filter === v ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}>{l}</button>
            ))}
          </div>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search number, name or subject"
            className="rounded-lg border border-neutral-200 px-sm py-1 text-sm w-56" />
        </div>
      </div>

      {setupNeeded && <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-md py-sm mb-md">Saving documents needs migration 197 running in Supabase.</p>}
      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-md py-sm mb-md">{error}</p>}
      {docs === null && <p className="text-sm text-neutral-400">Loading…</p>}
      {docs !== null && !shown.length && !setupNeeded && (
        <p className="text-sm text-neutral-500">{docs.length ? 'Nothing matches.' : 'Nothing yet — every letter or invoice you download or email is saved here.'}</p>
      )}

      {shown.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-neutral-500 border-b border-neutral-200">
                <th className="py-xs pr-sm font-semibold">Date</th>
                <th className="py-xs pr-sm font-semibold">Document</th>
                <th className="py-xs pr-sm font-semibold">To</th>
                <th className="py-xs pr-sm font-semibold text-right">Amount</th>
                <th className="py-xs pr-sm font-semibold">Emailed</th>
                <th className="py-xs font-semibold text-right">&nbsp;</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {shown.map(d => (
                <tr key={d.id} className="align-top">
                  <td className="py-sm pr-sm whitespace-nowrap text-neutral-600 tabular-nums">{when(d.created_at)}</td>
                  <td className="py-sm pr-sm">
                    <p className="font-semibold text-neutral-900">{d.kind === 'invoice' ? `🧾 ${d.number}` : `✉️ ${d.title}`}</p>
                    {d.kind === 'invoice' && d.title && <p className="text-xs text-neutral-500">{d.title}</p>}
                  </td>
                  <td className="py-sm pr-sm text-neutral-700">{d.recipient_name}</td>
                  <td className="py-sm pr-sm text-right tabular-nums">{d.total != null ? money(Number(d.total)) : '—'}</td>
                  <td className="py-sm pr-sm text-xs text-neutral-500">{d.emailed_at ? `${when(d.emailed_at)}${d.emailed_to?.length ? ` · ${d.emailed_to.join(', ')}` : ''}` : 'Not emailed'}</td>
                  <td className="py-sm whitespace-nowrap text-right">
                    <button type="button" onClick={() => open(d, 'view')} disabled={!!busy} className="text-xs font-semibold text-blue-600 hover:underline mr-sm">View</button>
                    <button type="button" onClick={() => open(d, 'download')} disabled={!!busy} className="text-xs font-semibold text-blue-600 hover:underline mr-sm">Download</button>
                    <button type="button" onClick={() => remove(d)} disabled={!!busy} className="text-xs font-semibold text-red-600 hover:underline">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
