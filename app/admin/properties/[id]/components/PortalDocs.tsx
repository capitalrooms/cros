'use client'
// Rightmove documents for this property (12 Nov 2026, Harry: "so we can market their property on Rightmove as per
// OpenRent required docs"). Ask the landlord (an email with their own link), see what's come back, and open each file to
// upload to OpenRent. lib/portalDocs, /api/admin/portal-docs.
import { useEffect, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'

export default function PortalDocs({ propertyId }: { propertyId: string }) {
  const [d, setD] = useState<any>(null)
  const [ask, setAsk] = useState<{ to: string; subject: string; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const load = () => adminFetch(`/api/admin/portal-docs?propertyId=${propertyId}`).then(r => r.json()).then(setD).catch(() => null)
  useEffect(() => { load() }, [propertyId])   // eslint-disable-line react-hooks/exhaustive-deps
  async function post(action: string) {
    setBusy(true); setErr('')
    const r = await adminFetch('/api/admin/portal-docs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ propertyId, action }) })
    const x = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setErr(x.error || 'That didn’t work'); return null }
    return x
  }
  if (!d || d.error) return null
  const r = d.request
  const files: [string, string | null][] = r ? [['Signed letter of authority', r.files.letter], [`Proof of ownership${r.ownershipType ? ` — ${r.ownershipType}` : ''}`, r.files.ownership], ['Photo ID', r.files.id]] : []
  const date = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  return (
    <section className="mb-lg rounded-2xl border border-neutral-200 bg-white p-lg">
      <div className="flex flex-wrap items-start justify-between gap-sm">
        <div>
          <h3 className="text-base font-bold text-neutral-900">Rightmove documents</h3>
          <p className="text-xs text-neutral-500">Rightmove (through OpenRent) need a signed letter of authority, proof of ownership and photo ID before the advert goes live.
            {r ? (r.status === 'completed' ? ` All three received ${date(r.completedAt)}.` : ` Asked ${date(r.sentAt)}${r.sentTo ? ` (${r.sentTo})` : ''} — waiting for the landlord.`) : ''}</p>
        </div>
        {d.setupNeeded ? <span className="text-xs font-semibold text-amber-700">Run migration 282 first</span>
          : <button type="button" disabled={busy} onClick={async () => { const x = await post('preview'); if (x) setAsk(x) }} className="rounded-full bg-neutral-900 px-md py-xs text-sm font-semibold text-white disabled:opacity-50">{r ? 'Ask again' : 'Ask the landlord'}</button>}
      </div>
      {err && <p className="mt-sm text-sm text-red-700">{err}</p>}
      {msg && <p className="mt-sm text-sm text-emerald-700">{msg}</p>}
      {ask && (
        <div className="mt-md rounded-xl border border-neutral-200 bg-neutral-50 p-md text-sm">
          <p className="text-neutral-600">To <b>{ask.to}</b> · <b>{ask.subject}</b></p>
          <pre className="mt-sm whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-neutral-800">{ask.text}</pre>
          <div className="mt-sm flex gap-xs">
            <button type="button" disabled={busy} onClick={async () => { const x = await post('send'); if (x) { setAsk(null); setMsg(`Sent to ${x.to}.`); load() } }} className="rounded-full bg-neutral-900 px-md py-xs text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Sending…' : 'Send to the landlord'}</button>
            <button type="button" onClick={() => setAsk(null)} className="rounded-full border border-neutral-300 px-md py-xs text-sm font-semibold">Cancel</button>
          </div>
        </div>
      )}
      {r && (
        <ul className="mt-md divide-y divide-neutral-100 text-sm">
          {files.map(([label, url]) => (
            <li key={label} className="flex items-center justify-between gap-sm py-xs">
              <span className={url ? 'text-neutral-900' : 'text-neutral-400'}>{url ? '✓' : '○'} {label}</span>
              {url ? <a href={url} target="_blank" rel="noreferrer" className="text-xs font-semibold underline">Open</a> : <span className="text-xs text-neutral-400">not yet</span>}
            </li>
          ))}
          {r.status !== 'completed' && <li className="py-xs text-xs text-neutral-500">Their link: <span className="select-all break-all">{r.link}</span></li>}
        </ul>
      )}
    </section>
  )
}
