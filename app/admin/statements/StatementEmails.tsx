'use client'
// Statement emails (15 Oct 2026): every email forwarded to statements@ and what it became — logged with the agent's
// number, still to read, or no PDF — and "Re-read" to run them through the import again, one at a time. A statement
// already in CROS is never added twice: re-reading stamps it with the agent's number and date instead.
import { useEffect, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'

interface Row { id: string; receivedAt: string; subject: string; files: string[]; number: string | null; status: 'logged' | 'to_read' | 'no_pdf'; statement: { reference: string; date: string; property: string; gross: number; net: number } | null }
const gbp = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const BADGE: Record<Row['status'], [string, string]> = { logged: ['Logged', 'bg-green-100 text-green-800'], to_read: ['To read', 'bg-amber-100 text-amber-900'], no_pdf: ['No PDF', 'bg-red-100 text-red-800'] }

export default function StatementEmails({ onChanged }: { onChanged?: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [hidden, setHidden] = useState(false)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [progress, setProgress] = useState('')
  const [err, setErr] = useState('')
  const [results, setResults] = useState<{ subject: string; outcome: string; detail: string }[]>([])
  async function load() {
    const r = await adminFetch('/api/admin/statements/intake').catch(() => null)
    if (!r || r.status === 403 || r.status === 401) { setHidden(true); return }
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(d.error || 'Not loaded'); return }
    setRows(d.emails)
  }
  useEffect(() => { load() }, [])
  async function reread(list: Row[]) {
    setErr(''); setResults([])
    for (let i = 0; i < list.length; i++) {
      setBusy(list[i].id); setProgress(`Reading ${i + 1} of ${list.length}: ${list[i].subject.replace(/^Fwd:\s*/i, '')}`)
      const r = await adminFetch('/api/webhooks/autoledger', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-cros-reread': '1' }, body: JSON.stringify({ emailId: list[i].id }) }).catch(() => null)
      const d = await r?.json().catch(() => ({}))
      const subject = list[i].subject.replace(/^Fwd:\s*/i, '')
      setResults(prev => [...prev, r?.ok ? { subject, outcome: d.outcome ?? 'done', detail: d.detail ?? '' } : { subject, outcome: 'failed', detail: d?.error || 'not read' }])
    }
    setBusy(null); setProgress(''); await load(); onChanged?.()
  }
  if (hidden) return null
  const toRead = (rows ?? []).filter(r => r.status === 'to_read')
  const counts = { logged: (rows ?? []).filter(r => r.status === 'logged').length, toRead: toRead.length, noPdf: (rows ?? []).filter(r => r.status === 'no_pdf').length }
  return (
    <section className="mt-2xl rounded-2xl border border-neutral-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-sm px-md py-sm">
        <div>
          <h2 className="font-bold text-neutral-900">Statement emails</h2>
          <p className="text-xs text-neutral-500">{rows ? `${rows.length} forwarded to statements@ · ${counts.logged} logged with the agent’s number · ${counts.toRead} to read · ${counts.noPdf} with no PDF` : 'Loading…'}</p>
        </div>
        <div className="flex gap-sm">
          {toRead.length > 0 && <button type="button" disabled={!!busy} onClick={() => reread(toRead)} className="rounded-lg bg-neutral-900 px-md py-xs text-sm font-bold text-white disabled:opacity-40">{busy ? 'Reading…' : `Re-read ${toRead.length}`}</button>}
          <button type="button" onClick={() => setOpen(v => !v)} className="rounded-lg border border-neutral-300 px-md py-xs text-sm font-semibold text-neutral-800">{open ? 'Hide' : 'Show all'}</button>
        </div>
      </div>
      {progress && <p className="px-md pb-sm text-xs text-neutral-600">{progress} — each takes about 20 seconds; keep this page open.</p>}
      {err && <p className="px-md pb-sm text-xs text-red-700">{err}</p>}
      {results.length > 0 && (
        <ul className="mx-md mb-sm space-y-0.5 rounded-lg bg-neutral-50 p-sm text-xs">
          {results.map((r, i) => (
            <li key={i}><span className={`mr-xs rounded px-xs font-semibold ${r.outcome === 'failed' ? 'bg-red-100 text-red-800' : r.outcome === 'created' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>{r.outcome === 'stamped' ? 'Dated' : r.outcome === 'already' ? 'Already in' : r.outcome === 'created' ? 'Added' : r.outcome === 'failed' ? 'Not read' : r.outcome}</span>{r.subject} — {r.detail}</li>
          ))}
        </ul>
      )}
      {open && rows && (
        <div className="overflow-x-auto border-t border-neutral-100">
          <table className="w-full text-xs">
            <thead><tr className="text-left text-neutral-500"><th className="px-md py-xs">Received</th><th className="px-sm py-xs">Email</th><th className="px-sm py-xs">Agent no.</th><th className="px-sm py-xs">Logged as</th><th className="px-sm py-xs text-right">Rent</th><th className="px-sm py-xs text-right">Net</th><th className="px-sm py-xs" /></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-t border-neutral-100">
                  <td className="px-md py-xs whitespace-nowrap">{new Date(r.receivedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</td>
                  <td className="px-sm py-xs">{r.subject.replace(/^Fwd:\s*/i, '')}</td>
                  <td className="px-sm py-xs whitespace-nowrap">{r.number ?? '—'}</td>
                  <td className="px-sm py-xs">{r.statement ? `${r.statement.property} · ${new Date(r.statement.date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : <span className={`rounded px-xs ${BADGE[r.status][1]}`}>{BADGE[r.status][0]}</span>}</td>
                  <td className="px-sm py-xs text-right tabular-nums">{r.statement ? gbp(r.statement.gross) : ''}</td>
                  <td className="px-sm py-xs text-right tabular-nums">{r.statement ? gbp(r.statement.net) : ''}</td>
                  <td className="px-sm py-xs text-right">{r.status !== 'no_pdf' && <button type="button" disabled={!!busy} onClick={() => reread([r])} className="font-semibold text-blue-700 hover:underline disabled:opacity-40">{busy === r.id ? 'Reading…' : 'Re-read'}</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
