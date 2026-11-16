'use client'

// Property check (16 Nov 2026, Harry: "a property search and get all possible data about a property we might want to
// buy or let but don't have a landlord for"). A postcode → pick the address → one report: the building (EPC, rooms,
// floor area), planning (Article 4, conservation, listed), licensing, flood, crime, schools, stations, street sales,
// rents and a rough yield as a whole let and as rooms, then a written verdict with things to check. Each check is kept
// (migration 291) with interested / not for us and notes. /api/admin/property-check, lib/propertyCheck.
import { useEffect, useState } from 'react'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import { adminFetch } from '@/lib/adminFetch'
import type { PropertyReport } from '@/lib/propertyCheck'

type Saved = { id: string; address: string; postcode: string; status: 'new' | 'interested' | 'not_for_us'; notes: string | null; created_at: string; report: PropertyReport }
const gbp = (n: number | null | undefined) => n == null ? '—' : `£${Math.round(n).toLocaleString('en-GB')}`
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
const STATUS = { new: 'New', interested: 'Interested', not_for_us: 'Not for us' } as const

function Verdict({ text }: { text: string }) {
  // "## " headings and "- " bullets, as the AI is asked to write
  const blocks: React.ReactNode[] = []
  let list: string[] = []
  const flush = () => { if (list.length) { blocks.push(<ul key={blocks.length} className="ml-5 list-disc space-y-1 text-sm text-neutral-800">{list.map((l, i) => <li key={i}>{l}</li>)}</ul>); list = [] } }
  for (const raw of text.split('\n')) {
    const line = raw.trim().replace(/\*\*/g, '')
    if (!line) { flush(); continue }
    if (line.startsWith('## ')) { flush(); blocks.push(<h3 key={blocks.length} className="mt-md text-sm font-bold uppercase tracking-wide text-neutral-500">{line.slice(3)}</h3>) }
    else if (/^[-•] /.test(line)) list.push(line.slice(2))
    else { flush(); blocks.push(<p key={blocks.length} className="text-sm text-neutral-800">{line}</p>) }
  }
  flush()
  return <div className="space-y-2">{blocks}</div>
}

const Fact = ({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'good' | 'warn' | 'bad' }) => (
  <div className="rounded-xl bg-neutral-50 p-md">
    <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
    <p className={`mt-0.5 text-[15px] font-bold ${tone === 'bad' ? 'text-red-700' : tone === 'warn' ? 'text-amber-700' : tone === 'good' ? 'text-green-700' : 'text-neutral-900'}`}>{value}</p>
  </div>
)
const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="rounded-2xl border border-neutral-200 bg-white p-lg">
    <h2 className="mb-md text-base font-bold text-neutral-900">{title}</h2>
    {children}
  </section>
)

function Report({ r }: { r: PropertyReport }) {
  const e = r.estimate, m = r.market
  const risk = (v: string | null) => !v ? undefined : /high/i.test(v) ? 'bad' as const : /medium/i.test(v) ? 'warn' as const : 'good' as const
  return (
    <div className="space-y-lg">
      <div className="rounded-2xl bg-neutral-900 p-lg text-white">
        <p className="text-xs font-semibold uppercase tracking-widest text-white/60">Property check · {day(r.checkedAt)}</p>
        <h2 className="mt-1 text-2xl font-bold">{r.address}</h2>
        <p className="text-sm text-white/70">{[r.postcode, r.area?.ward, r.area?.borough].filter(Boolean).join(' · ')}</p>
        {r.planning && (
          <div className="mt-md flex flex-wrap gap-2 text-xs font-bold">
            <span className={`rounded-full px-3 py-1 ${r.planning.article4 ? 'bg-amber-400 text-neutral-900' : 'bg-white/15'}`}>{r.planning.article4 ? 'Article 4 area' : 'No Article 4 found'}</span>
            {r.planning.conservation && <span className="rounded-full bg-amber-400 px-3 py-1 text-neutral-900">Conservation area</span>}
            {r.planning.listed && <span className="rounded-full bg-red-400 px-3 py-1 text-neutral-900">Listed building</span>}
            {r.epc?.rating && <span className={`rounded-full px-3 py-1 ${/[FG]/.test(r.epc.rating) ? 'bg-red-400 text-neutral-900' : 'bg-white/15'}`}>EPC {r.epc.rating}</span>}
          </div>
        )}
      </div>

      {r.verdict && <Card title="The verdict"><Verdict text={r.verdict} />
        {!!r.sources.length && <p className="mt-md text-xs text-neutral-500">Sources: {r.sources.map((x, i) => <a key={x.url} href={x.url} target="_blank" rel="noreferrer" className="underline">{i ? ', ' : ''}{x.title}</a>)}</p>}</Card>}

      {e && <Card title="Rough numbers">
        <div className="grid grid-cols-2 gap-sm md:grid-cols-4">
          <Fact label="Bedrooms (from EPC)" value={e.bedrooms ?? '—'} />
          <Fact label="Price used" value={gbp(e.price)} />
          <Fact label="Whole let a month" value={gbp(e.wholeRent)} />
          <Fact label="As rooms a month" value={gbp(e.roomsRent)} />
          <Fact label="Gross yield — whole let" value={e.yieldWhole != null ? `${e.yieldWhole}%` : '—'} />
          <Fact label="Gross yield — rooms" value={e.yieldRooms != null ? `${e.yieldRooms}%` : '—'} tone={e.yieldRooms && e.yieldRooms >= 7 ? 'good' : undefined} />
        </div>
        <p className="mt-sm text-xs text-neutral-500">{e.note}</p>
      </Card>}

      <div className="grid gap-lg md:grid-cols-2">
        <Card title="The building">
          {r.epc ? <div className="grid grid-cols-2 gap-sm">
            <Fact label="EPC" value={`${r.epc.rating ?? '—'}${r.epc.potential ? ` (could be ${r.epc.potential})` : ''}`} tone={r.epc.rating && /[FG]/.test(r.epc.rating) ? 'bad' : undefined} />
            <Fact label="Floor area" value={r.epc.floorArea ? `${r.epc.floorArea} m²` : '—'} />
            <Fact label="Habitable rooms" value={r.epc.rooms ?? '—'} />
            <Fact label="Type" value={r.epc.type ?? '—'} />
            <Fact label="Built" value={r.epc.built ?? '—'} />
            <Fact label="EPC lodged" value={r.epc.date ? day(r.epc.date) : '—'} />
          </div> : <p className="text-sm text-neutral-500">No EPC found for this exact address.</p>}
          {r.epc?.matched && <p className="mt-sm text-xs text-neutral-500">Matched EPC: {r.epc.matched}</p>}
        </Card>
        <Card title="Risks and services">
          <div className="grid grid-cols-2 gap-sm">
            <Fact label="Flood (rivers / sea)" value={r.flood?.riverSea ?? '—'} tone={risk(r.flood?.riverSea ?? null)} />
            <Fact label="Flood (surface water)" value={r.flood?.surface ?? '—'} tone={risk(r.flood?.surface ?? null)} />
            <Fact label="Broadband" value={r.broadband?.down ? `${r.broadband.down} Mbps${r.broadband.ultrafast ? ' · ultrafast' : ''}` : '—'} />
            <Fact label="Council" value={r.councilTax?.authority ?? r.area?.borough ?? '—'} />
            <Fact label={`Crime ${r.crime?.month ? `(${r.crime.month})` : ''}`} value={r.crime?.total != null ? `${r.crime.total} reports nearby` : '—'} />
            <Fact label="Most common" value={r.crime?.top?.[0] ? `${r.crime.top[0].category}` : '—'} />
          </div>
          {!!r.planning?.constraints.length && <p className="mt-sm text-xs text-neutral-500">Planning: {r.planning.constraints.join(' · ')}</p>}
        </Card>
      </div>

      <div className="grid gap-lg md:grid-cols-2">
        <Card title="Sales on the street (Land Registry)">
          {r.sales.length ? <table className="w-full text-sm"><tbody>{r.sales.map((x, i) => (
            <tr key={i} className="border-t border-neutral-100"><td className="py-1.5 pr-2 text-neutral-500 tabular-nums">{x.date.slice(0, 7)}</td><td className="py-1.5 pr-2">{x.address}</td><td className="py-1.5 pr-2 text-neutral-500">{x.type}{x.tenure ? `, ${x.tenure.toLowerCase()}` : ''}</td><td className="py-1.5 text-right font-semibold tabular-nums">{gbp(x.price)}</td></tr>
          ))}</tbody></table> : <p className="text-sm text-neutral-500">No sales recorded on this street.</p>}
        </Card>
        <Card title="The area">
          {m && <div className="grid grid-cols-2 gap-sm">
            <Fact label="Average rent (whole home)" value={gbp(m.rentAll)} />
            <Fact label="Our typical room" value={gbp(m.ourRoomMedian)} />
            <Fact label="Average price" value={gbp(m.avgPrice)} />
            <Fact label="Area gross yield" value={m.yieldWhole != null ? `${m.yieldWhole}%` : '—'} />
          </div>}
          {!!r.stations.length && <><p className="mt-md text-xs font-semibold uppercase tracking-wide text-neutral-500">Stations</p>
            <ul className="mt-1 space-y-0.5 text-sm">{r.stations.map(x => <li key={x.name}>{x.name} <span className="text-neutral-500">· {x.walkMins} min walk · {x.modes}</span></li>)}</ul></>}
          {!!r.schools.length && <><p className="mt-md text-xs font-semibold uppercase tracking-wide text-neutral-500">Schools</p>
            <ul className="mt-1 space-y-0.5 text-sm">{r.schools.map(x => <li key={x.name}>{x.name} <span className="text-neutral-500">· {x.phase}{x.ofsted ? ` · ${x.ofsted}` : ''}</span></li>)}</ul></>}
        </Card>
      </div>

      <Card title="Who owns it">
        <p className="text-sm text-neutral-700">The owner’s name and address are on the title register from HM Land Registry (about £7, usually within minutes). With it you can write to the owner about letting or selling.</p>
        <a href="https://search-property-information.service.gov.uk/search/search-by-postcode" target="_blank" rel="noreferrer" className="mt-sm inline-block rounded-lg border border-neutral-300 px-md py-sm text-sm font-semibold">Get the title register ↗</a>
      </Card>

      {!!r.missing.length && <p className="text-xs text-neutral-500">Couldn’t get: {r.missing.join(' · ')}</p>}
    </div>
  )
}

export default function PropertyCheckPage() {
  const [postcode, setPostcode] = useState('')
  const [addresses, setAddresses] = useState<string[] | null>(null)
  const [pc, setPc] = useState('')
  const [picked, setPicked] = useState('')
  const [busy, setBusy] = useState<'' | 'find' | 'check'>('')
  const [err, setErr] = useState('')
  const [report, setReport] = useState<PropertyReport | null>(null)
  const [saved, setSaved] = useState<Saved[]>([])
  const [setupNeeded, setSetupNeeded] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  const loadSaved = () => adminFetch('/api/admin/property-check').then(r => r.json()).then(d => { setSaved(d.checks ?? []); setSetupNeeded(!!d.setupNeeded) }).catch(() => {})
  useEffect(() => { loadSaved() }, [])

  async function find() {
    setBusy('find'); setErr(''); setAddresses(null); setPicked('')
    const r = await adminFetch(`/api/admin/postcode-lookup?postcode=${encodeURIComponent(postcode.trim())}`).catch(() => null)
    const d = r ? await r.json().catch(() => ({})) : {}
    setBusy('')
    if (!r?.ok || !(d as any).addresses?.length) { setErr('No addresses found — check the postcode.'); return }
    setAddresses((d as any).addresses); setPc((d as any).postcode || postcode.trim().toUpperCase())
  }
  async function check(address: string) {
    setBusy('check'); setErr(''); setReport(null); setOpenId(null)
    const r = await adminFetch('/api/admin/property-check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address, postcode: pc }) }).catch(() => null)
    const d = r ? await r.json().catch(() => ({})) : {}
    setBusy('')
    if (!r?.ok) { setErr((d as any).error || 'The check didn’t finish — try again.'); return }
    setReport((d as any).report); if ((d as any).setupNeeded) setSetupNeeded(true)
    loadSaved()
  }
  async function patch(id: string, row: { status?: string; notes?: string }) {
    await adminFetch('/api/admin/property-check', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...row }) }).catch(() => null)
    setSaved(v => v.map(x => x.id === id ? { ...x, ...row } as Saved : x))
  }
  const open = saved.find(x => x.id === openId)

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin/new-business" />} title="Property check" />
      <div className="mx-auto max-w-6xl px-lg py-xl">
        <h1 className="text-3xl font-bold text-neutral-900">Property check</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-600">Any address in London: the building, planning and licensing, flood and crime, what’s sold on the street, rents and a rough yield as a whole let and as rooms — with a written verdict. About 30 seconds; it uses about 11 Property Insights credits (everything they have on it is kept).</p>

        {setupNeeded && <p className="mt-md rounded-xl bg-amber-50 p-md text-sm text-amber-900">Checks can’t be kept yet — run migration 291 (property_checks) in Supabase. Reports still show.</p>}

        <div className="mt-lg grid gap-lg lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-lg">
            <section className="rounded-2xl border border-neutral-200 bg-white p-lg">
              <form onSubmit={e => { e.preventDefault(); find() }} className="flex gap-sm">
                <input value={postcode} onChange={e => setPostcode(e.target.value)} placeholder="Postcode, e.g. E16 3AD" className="h-11 flex-1 rounded-xl border border-neutral-300 px-md text-[15px]" />
                <button disabled={!postcode.trim() || !!busy} className="h-11 rounded-xl bg-neutral-900 px-lg text-sm font-bold text-white disabled:opacity-40">{busy === 'find' ? 'Finding…' : 'Find addresses'}</button>
              </form>
              {addresses && (
                <div className="mt-md space-y-sm">
                  <select value={picked} onChange={e => setPicked(e.target.value)} className="h-11 w-full rounded-xl border border-neutral-300 px-md text-[15px]">
                    <option value="">Pick the address ({addresses.length})</option>
                    {addresses.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                  <button disabled={!picked || !!busy} onClick={() => check(picked)} className="h-11 w-full rounded-xl bg-amber-400 text-sm font-bold text-neutral-900 disabled:opacity-40">{busy === 'check' ? 'Checking — about 30 seconds…' : 'Check this property'}</button>
                </div>
              )}
              {err && <p className="mt-sm text-sm font-semibold text-red-700">{err}</p>}
            </section>
            {report && <Report r={report} />}
            {!report && open && (
              <>
                <div className="flex flex-wrap items-center gap-sm">
                  {(Object.keys(STATUS) as (keyof typeof STATUS)[]).map(k => <button key={k} onClick={() => patch(open.id, { status: k })} className={`rounded-full px-md py-1.5 text-sm font-semibold ${open.status === k ? 'bg-neutral-900 text-white' : 'border border-neutral-300 bg-white'}`}>{STATUS[k]}</button>)}
                  <button onClick={() => check(open.address)} disabled={!!busy} className="ml-auto text-sm font-semibold underline disabled:opacity-40">{busy === 'check' ? 'Checking…' : 'Check again'}</button>
                </div>
                <textarea defaultValue={open.notes ?? ''} onBlur={e => patch(open.id, { notes: e.target.value })} placeholder="Notes — viewing, asking price, the owner…" rows={2} className="w-full rounded-xl border border-neutral-300 bg-white p-md text-sm" />
                <Report r={open.report} />
              </>
            )}
          </div>

          <aside className="space-y-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Checked properties</p>
            {!saved.length && <p className="text-sm text-neutral-500">None yet.</p>}
            {saved.map(x => (
              <button key={x.id} onClick={() => { setReport(null); setOpenId(x.id); window.scrollTo({ top: 0, behavior: 'smooth' }) }} className={`block w-full rounded-xl border bg-white p-md text-left ${openId === x.id ? 'border-neutral-900' : 'border-neutral-200'}`}>
                <p className="truncate text-sm font-bold text-neutral-900">{x.address.split(',')[0]}</p>
                <p className="text-xs text-neutral-500">{x.postcode} · {day(x.created_at)}{x.report?.estimate?.yieldRooms != null ? ` · rooms ${x.report.estimate.yieldRooms}%` : ''}</p>
                {x.status !== 'new' && <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${x.status === 'interested' ? 'bg-green-100 text-green-800' : 'bg-neutral-100 text-neutral-600'}`}>{STATUS[x.status]}</span>}
              </button>
            ))}
          </aside>
        </div>
      </div>
    </div>
  )
}
