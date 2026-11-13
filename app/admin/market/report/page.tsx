'use client'
// The local market report (12 Nov 2026, Harry: "compare 3 local boroughs where an individual has properties — a full
// report maker for email or PDF"). Pick a landlord (their boroughs fill in) or up to three areas, make the report, read
// and edit the commentary, then download the PDF or email it to the landlord with the PDF attached.
import { useEffect, useState } from 'react'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'
import { adminFetch } from '@/lib/adminFetch'
import { createClient } from '@/lib/supabase'
import PeoplePicker, { type Recipient } from '@/app/components/notify/PeoplePicker'

interface Area { code: string; name: string; region: string | null }

export default function MarketReportPage() {
  const [areas, setAreas] = useState<Area[]>([])
  const [landlords, setLandlords] = useState<{ id: string; name: string }[]>([])
  const [landlordId, setLandlordId] = useState('')
  const [picked, setPicked] = useState<Area[]>([])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [rep, setRep] = useState<{ title: string; html: string; commentary: string; to: string | null } | null>(null)
  const [commentary, setCommentary] = useState('')
  // who it goes to (13 Nov 2026): any landlord, anyone else picked, or a typed address — one or many
  const [to, setTo] = useState<Recipient[]>([])
  const [own, setOwn] = useState(false)            // each landlord gets the report for their own areas (the monthly mail-out)
  const [sent, setSent] = useState<{ who: string; ok: boolean; note: string }[]>([])

  useEffect(() => {
    adminFetch('/api/admin/market').then(r => r.json()).then(d => setAreas(d.areas ?? []))
    // landlords who have houses with us
    const s = createClient()
    s.from('properties').select('landlord_id, people!landlord_id(first_name, last_name, full_name, company)').not('landlord_id', 'is', null).then(({ data }) => {
      const m = new Map<string, string>()
      for (const p of (data ?? []) as any[]) { const pp = p.people; if (pp) m.set(p.landlord_id, pp.company || [pp.first_name, pp.last_name].filter(Boolean).join(' ') || pp.full_name || 'Landlord') }
      setLandlords([...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)))
    })
  }, [])
  useEffect(() => {
    const pre = new URLSearchParams(window.location.search).get('areas')
    if (pre && areas.length && !picked.length) setPicked(pre.split(',').map(c => areas.find(a => a.code === c)).filter(Boolean) as Area[])
  }, [areas])   // eslint-disable-line react-hooks/exhaustive-deps

  async function chooseLandlord(id: string) {
    setLandlordId(id); setRep(null); setErr('')
    if (!id) return
    setBusy('areas')
    const r = await adminFetch('/api/admin/market/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'areas', landlordId: id }) })
    const d = await r.json().catch(() => ({}))
    setBusy('')
    const got = (d.codes ?? []).map((c: string) => areas.find(a => a.code === c)).filter(Boolean)
    setPicked(got)
    const l = landlords.find(x => x.id === id)
    if (l) { const { data: p } = await createClient().from('people').select('email, phone').eq('id', id).maybeSingle(); if ((p as any)?.email) setTo(t => t.some(r => r.personId === id) ? t : [...t, { name: l.name, email: (p as any).email, phone: (p as any).phone ?? null, from: 'Landlord', personId: id }]) }
    if (!got.length) setErr('None of their houses have a postcode we can place — choose the areas below.')
  }
  const post = (body: any) => adminFetch('/api/admin/market/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codes: picked.map(p => p.code), landlordId: landlordId || undefined, ...body }) })
  async function make() {
    setBusy('preview'); setErr(''); setRep(null); setMsg('')
    const r = await post({ action: 'preview' }); const d = await r.json().catch(() => ({}))
    setBusy('')
    if (!r.ok) { setErr(d.error || 'Couldn’t make the report'); return }
    setRep(d); setCommentary(d.commentary)
  }
  async function pdf() {
    setBusy('pdf'); setErr('')
    const r = await post({ action: 'pdf', commentary })
    setBusy('')
    if (!r.ok) { setErr('Couldn’t make the PDF'); return }
    window.open(URL.createObjectURL(await r.blob()), '_blank')
  }
  const withEmail = to.filter(r => r.email)
  async function sendAll() {
    if (!withEmail.length) return
    if (!window.confirm(own ? `Send each of these ${withEmail.length} their own market report (their properties' areas, written for them), with the PDF attached?` : `Email this report to ${withEmail.length === 1 ? withEmail[0].email : `${withEmail.length} people`}, with the PDF attached?`)) return
    setBusy('email'); setErr(''); setSent([])
    for (const r of withEmail) {
      const body = own && r.personId ? { action: 'email_own', landlordId: r.personId } : { action: 'email', commentary, to: r.email, name: r.name, landlordId: r.personId || undefined }
      const res = await adminFetch('/api/admin/market/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codes: picked.map(p => p.code), ...body }) })
      const d = await res.json().catch(() => ({}))
      setSent(x => [...x, { who: r.name ? `${r.name} (${r.email})` : String(r.email), ok: res.ok, note: res.ok ? (d.areas ? `sent — ${d.areas.join(', ')}` : 'sent') : (d.error || 'didn’t send') }])
    }
    setBusy('')
  }

  const hits = q.trim().length >= 2 ? areas.filter(a => a.name.toLowerCase().includes(q.trim().toLowerCase()) && !picked.some(p => p.code === a.code)).slice(0, 6) : []
  return (
    <div className="office min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin/market" />} title="Market report" />
      <PageHero eyebrow="Communications · Market updates" title="Local market report" subtitle="Compare up to three areas — rents, house prices, yields and trends, with a short commentary — as a PDF on our letterhead, or email it to any landlord or contact. For the monthly landlord update, pick several landlords and each gets their own areas." />
      <div className="mx-auto max-w-5xl space-y-lg px-lg py-xl">
        <section className="space-y-md rounded-2xl bg-white p-lg ring-1 ring-neutral-200">
          <label className="block text-sm font-semibold text-neutral-800">For a landlord (optional) — their houses’ areas fill in
            <select value={landlordId} onChange={e => chooseLandlord(e.target.value)} className="mt-xs block w-full rounded-xl border border-neutral-300 bg-white px-md py-sm text-base font-normal">
              <option value="">— No landlord: choose areas —</option>
              {landlords.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
          <div>
            <p className="text-sm font-semibold text-neutral-800">Areas (up to 3)</p>
            <div className="mt-xs flex flex-wrap gap-xs">
              {picked.map(p => <span key={p.code} className="inline-flex items-center gap-xs rounded-full bg-neutral-900 px-md py-xs text-sm font-semibold text-white">{p.name}<button type="button" aria-label={`Remove ${p.name}`} onClick={() => { setPicked(picked.filter(x => x.code !== p.code)); setRep(null) }}>×</button></span>)}
              {busy === 'areas' && <span className="text-sm text-neutral-500">Finding their areas…</span>}
            </div>
            {picked.length < 3 && (
              <div className="relative mt-sm">
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Add an area — e.g. Lewisham" className="w-full rounded-xl border border-neutral-300 px-md py-sm text-base" />
                {hits.length > 0 && <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-neutral-200">{hits.map(a => <li key={a.code}><button type="button" onClick={() => { setPicked([...picked, a]); setQ(''); setRep(null) }} className="flex w-full justify-between px-md py-sm text-left text-sm hover:bg-neutral-50"><span>{a.name}</span><span className="text-neutral-500">{a.region}</span></button></li>)}</ul>}
              </div>
            )}
          </div>
          <button type="button" onClick={make} disabled={!picked.length || !!busy} className="rounded-full bg-neutral-900 px-lg py-sm text-sm font-semibold text-white disabled:opacity-40">{busy === 'preview' ? 'Making the report — about 30 seconds…' : rep ? 'Make it again' : 'Make the report'}</button>
          {err && <p className="text-sm text-red-700">{err}</p>}
        </section>

        {rep && !rep.commentary && <p className="rounded-xl bg-amber-50 px-md py-sm text-sm text-amber-900">The commentary didn’t come through — press “Make it again”, or write a few lines below before sending.</p>}
        {rep && (
          <section className="space-y-md">
            <div className="rounded-2xl bg-white p-lg ring-1 ring-neutral-200">
              <p className="text-xs font-bold uppercase tracking-wide text-neutral-500">The email</p>
              <h2 className="text-lg font-bold text-neutral-900">{rep.title}</h2>
              <div className="prose-sm mt-sm max-w-none text-sm leading-relaxed text-neutral-800 [&_p]:my-2" dangerouslySetInnerHTML={{ __html: rep.html }} />
            </div>
            <div className="rounded-2xl bg-white p-lg ring-1 ring-neutral-200">
              <label className="block text-sm font-semibold text-neutral-800">Commentary — edit before you send; the PDF and email use this
                <textarea rows={10} value={commentary} onChange={e => setCommentary(e.target.value)} className="mt-xs block w-full rounded-xl border border-neutral-300 px-md py-sm text-sm font-normal leading-relaxed" />
              </label>
              <div className="mt-sm flex flex-wrap gap-sm">
                <button type="button" onClick={pdf} disabled={!!busy} className="rounded-full border border-neutral-300 bg-white px-lg py-sm text-sm font-semibold disabled:opacity-40">{busy === 'pdf' ? 'Making the PDF…' : 'Open the PDF'}</button>
              </div>
              {msg && <p className="mt-sm text-sm text-emerald-700">{msg}</p>}
            </div>
            {/* who it goes to — any landlord, anyone else, or a typed address; one or many */}
            <div className="space-y-sm rounded-2xl bg-white p-lg ring-1 ring-neutral-200">
              <p className="text-sm font-semibold text-neutral-800">Send it to</p>
              <PeoplePicker value={to} onChange={setTo} includeLandlords compact />
              {to.some(r => r.personId) && (
                <label className="flex items-start gap-sm text-sm text-neutral-800"><input type="checkbox" className="mt-1" checked={own} onChange={e => setOwn(e.target.checked)} />
                  <span>Each landlord gets the report for <b>their own properties’ areas</b>, written for them (the monthly landlord update). Anyone who isn’t a landlord gets the report above.</span></label>
              )}
              <button type="button" onClick={sendAll} disabled={!!busy || !withEmail.length} className="rounded-full bg-neutral-900 px-lg py-sm text-sm font-semibold text-white disabled:opacity-40">{busy === 'email' ? `Sending… ${sent.length} of ${withEmail.length}` : withEmail.length ? `Send to ${withEmail.length === 1 ? withEmail[0].email : `${withEmail.length} people`}` : 'Pick who to send it to'}</button>
              {sent.length > 0 && <ul className="space-y-0.5 text-sm">{sent.map((x, i) => <li key={i} className={x.ok ? 'text-emerald-800' : 'text-red-700'}>{x.ok ? '✓' : '✕'} {x.who} — {x.note}</li>)}</ul>}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
