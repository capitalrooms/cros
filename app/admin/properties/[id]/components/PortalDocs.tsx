'use client'
// Required info for Rightmove advertising (12 Nov 2026) — on the landlord's page and each property's Lettings tab.
// Choose which of the landlord's properties to ask about (one, several or all): they sign one letter covering them,
// add photo ID once and proof of ownership for each. See what's come back and open each file to upload to OpenRent.
// lib/portalDocs, /api/admin/portal-docs.
import { useEffect, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'
import { openMyFile } from '@/lib/files/useStoredFile'

type Req = { status: string; sentAt: string; sentTo: string | null; completedAt: string | null; link: string; letter: string | null; id: string | null; properties: { id: string; street: string; ownershipType: string | null; ownership: string | null; onFile?: boolean }[]; idOnFile?: boolean }

export default function PortalDocs({ propertyId, landlordId }: { propertyId?: string; landlordId?: string }) {
  const [d, setD] = useState<{ landlord: { name: string; email: string | null } | null; properties: { id: string; street: string; ownershipOnFile: string | null }[]; idOnFile: string | null; requests: Req[]; setupNeeded?: boolean } | null>(null)
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [ask, setAsk] = useState<{ to: string; subject: string; html: string } | null>(null)
  const [look, setLook] = useState<'website' | 'landlord'>('website')
  // documents already on file (onboarding / the property's files) — used unless unticked, so the landlord isn't asked twice
  const [useId, setUseId] = useState(true)
  const [skipOwn, setSkipOwn] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const q = landlordId ? `landlordId=${landlordId}` : `propertyId=${propertyId}`
  const load = () => adminFetch(`/api/admin/portal-docs?${q}`).then(r => r.json()).then(x => {
    setD(x)
    // a property's tab starts with that property; the landlord's page with all of theirs
    if (x?.properties) setChosen(c => c.size ? c : new Set(propertyId ? [propertyId] : x.properties.map((p: any) => p.id)))
  }).catch(() => null)
  useEffect(() => { load() }, [q])   // eslint-disable-line react-hooks/exhaustive-deps
  async function post(action: string, lk = look) {
    setBusy(true); setErr('')
    const r = await adminFetch('/api/admin/portal-docs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ propertyIds: [...chosen], action, look: lk, useOnFile: { id: useId, ownership: [...chosen].filter(id => !skipOwn.has(id)) } }) })
    const x = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setErr(x.error || 'That didn’t work'); return null }
    return x
  }
  if (!d || (d as any).error) return null
  const date = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const toggle = (id: string) => { const n = new Set(chosen); n.has(id) ? n.delete(id) : n.add(id); setChosen(n); setAsk(null) }
  const file = (label: string, url: string | null, kept?: boolean) => (
    <li key={label} className="flex items-center justify-between gap-sm py-xs">
      <span className={url ? 'text-neutral-900' : 'text-neutral-400'}>{url ? '✓' : '○'} {label}{kept && <span className="ml-xs rounded bg-neutral-100 px-xs text-[11px] text-neutral-600">already on file</span>}</span>
      {url ? <button type="button" onClick={() => openMyFile(url)} className="text-xs font-semibold underline">Open</button> : <span className="text-xs text-neutral-400">not yet</span>}
    </li>
  )
  const chosenProps = (d.properties ?? []).filter(p => chosen.has(p.id))
  const heldOwn = chosenProps.filter(p => p.ownershipOnFile)
  return (
    <section className="mb-lg rounded-2xl border border-neutral-200 bg-white p-lg">
      <h3 className="text-base font-bold text-neutral-900">Required info for Rightmove advertising</h3>
      <p className="text-xs text-neutral-500">Rightmove (through OpenRent) need a signed letter of authority, proof of ownership and photo ID before an advert goes live. Ask once for any of {d.landlord?.name ? `${d.landlord.name}’s` : 'the landlord’s'} properties.</p>
      {d.setupNeeded ? <p className="mt-sm text-xs font-semibold text-amber-700">Run migration 283 in Supabase first.</p> : !d.landlord ? <p className="mt-sm text-sm text-neutral-500">Add a landlord to this property first.</p> : (<>
        {d.properties.length > 0 && (
          <div className="mt-md">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-neutral-500">Which properties?</p>
              {d.properties.length > 1 && <button type="button" className="text-xs font-semibold underline" onClick={() => { setChosen(chosen.size === d.properties.length ? new Set() : new Set(d.properties.map(p => p.id))); setAsk(null) }}>{chosen.size === d.properties.length ? 'Clear' : 'All'}</button>}
            </div>
            <div className="mt-xs flex flex-wrap gap-xs">
              {d.properties.map(p => <label key={p.id} className={`flex cursor-pointer items-center gap-xs rounded-full border px-md py-xs text-sm ${chosen.has(p.id) ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 text-neutral-700'}`}><input type="checkbox" className="hidden" checked={chosen.has(p.id)} onChange={() => toggle(p.id)} />{p.street}</label>)}
            </div>
          </div>
        )}
        {(d.idOnFile || heldOwn.length > 0) && chosen.size > 0 && (
          <div className="mt-md rounded-xl bg-neutral-50 p-md">
            <p className="text-xs font-bold uppercase tracking-wide text-neutral-500">Already on file — they won’t be asked again</p>
            <ul className="mt-xs space-y-xs text-sm">
              {d.idOnFile && <li><label className="flex cursor-pointer items-start gap-sm"><input type="checkbox" className="mt-1" checked={useId} onChange={e => { setUseId(e.target.checked); setAsk(null) }} /><span>Photo ID <span className="text-neutral-500">— {d.idOnFile}</span></span></label></li>}
              {heldOwn.map(p => <li key={p.id}><label className="flex cursor-pointer items-start gap-sm"><input type="checkbox" className="mt-1" checked={!skipOwn.has(p.id)} onChange={() => { const n = new Set(skipOwn); n.has(p.id) ? n.delete(p.id) : n.add(p.id); setSkipOwn(n); setAsk(null) }} /><span>Proof of ownership, {p.street} <span className="text-neutral-500">— {p.ownershipOnFile}</span></span></label></li>)}
            </ul>
            <p className="mt-xs text-xs text-neutral-500">Untick anything that’s out of date or doesn’t cover that property, and they’ll be asked for it.</p>
          </div>
        )}
        <div className="mt-sm">
          <button type="button" disabled={busy || !chosen.size} onClick={async () => { const x = await post('preview'); if (x) setAsk(x) }} className="rounded-full bg-neutral-900 px-md py-xs text-sm font-semibold text-white disabled:opacity-40">Ask the landlord{chosen.size > 1 ? ` (${chosen.size} properties)` : ''}</button>
        </div>
      </>)}
      {err && <p className="mt-sm text-sm text-red-700">{err}</p>}
      {msg && <p className="mt-sm text-sm text-emerald-700">{msg}</p>}
      {ask && (
        <div className="mt-md rounded-xl border border-neutral-200 bg-neutral-50 p-md text-sm">
          <p className="text-neutral-600">To <b>{ask.to}</b> · <b>{ask.subject}</b></p>
          <div className="mt-sm flex gap-1 rounded-full bg-white p-1 text-xs font-semibold ring-1 ring-neutral-200" style={{ width: 'fit-content' }}>
            {([['website', 'Website look'], ['landlord', 'Landlord look']] as const).map(([k, l]) => <button key={k} type="button" onClick={async () => { setLook(k); const x = await post('preview', k); if (x) setAsk(x) }} className={`rounded-full px-md py-xs ${look === k ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}>{l}</button>)}
          </div>
          <iframe title="The email" srcDoc={ask.html} className="mt-sm h-[620px] w-full rounded-lg bg-white ring-1 ring-neutral-200" />
          <div className="mt-sm flex gap-xs">
            <button type="button" disabled={busy} onClick={async () => { const x = await post('send'); if (x) { setAsk(null); setMsg(`Sent to ${x.to}.`); load() } }} className="rounded-full bg-neutral-900 px-md py-xs text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Sending…' : 'Send to the landlord'}</button>
            <button type="button" onClick={() => setAsk(null)} className="rounded-full border border-neutral-300 px-md py-xs text-sm font-semibold">Cancel</button>
          </div>
        </div>
      )}
      {d.requests.map((r, i) => (
        <div key={i} className="mt-md rounded-xl border border-neutral-200 p-md">
          <p className="text-xs text-neutral-500">{r.status === 'completed' ? <b className="text-emerald-700">All received {date(r.completedAt!)}</b> : <>Asked {date(r.sentAt)}{r.sentTo ? ` (${r.sentTo})` : ''} — <b className="text-amber-700">waiting for the landlord</b></>} · {r.properties.map(p => p.street).join(', ')}</p>
          <ul className="mt-xs divide-y divide-neutral-100 text-sm">
            {file('Signed letter of authority', r.letter)}
            {r.properties.map(p => file(`Proof of ownership — ${p.street}${p.ownershipType ? ` (${p.ownershipType})` : ''}`, p.ownership, p.onFile))}
            {file('Photo ID', r.id, r.idOnFile)}
          </ul>
          {r.status !== 'completed' && <p className="mt-xs text-xs text-neutral-500">Their link: <span className="select-all break-all">{r.link}</span></p>}
        </div>
      ))}
    </section>
  )
}
