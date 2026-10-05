'use client'

// Move-in pack for one tenancy: check the move-in figures, choose documents, preview, send one link.
import { use, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'
import { adminFetch } from '@/lib/adminFetch'
import { firstRentPayment, ukLongDate } from '@/lib/tenancy/firstRent'
import { fiveWeeksDeposit, oneWeekRent } from '@/lib/tenancy/deposit'

interface Doc { key: string; label: string; group: string; source: string; url?: string; available: boolean; note?: string; include: boolean }
interface Pack {
  id: string; link: string; tenant_email: string; status: string; sent_at: string; first_viewed_at: string | null
  confirmed_at: string | null; confirmed_name: string | null; tenant_questions: string | null
  documents: { key: string; label: string; available: boolean }[]
  tenancy_pack_events: { event: string; document_key: string | null; at: string }[]
}
interface Data {
  context: {
    tenancyId: string; tenant: { name: string; email: string; formalName: string }; address: string; landlordName: string
    property: { id: string }; startDate: string | null; rentMonthly: number; rentDueDay: number; deposit: number; holdingDeposit: number
    paymentRef: string; paymentRefStored: boolean; warnings: string[]; documents: Doc[]
  }
  packs: Pack[]; commsLive: boolean; defaults: { subject: string; message: string }; setupNeeded: string | null
}

const gbp = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const GROUPS = ['Your tenancy', 'Safety certificates', 'Your deposit', 'Your rights', 'Living in the house']
const input = 'mt-xs w-full rounded-lg border border-neutral-300 bg-white px-md py-sm text-sm text-neutral-900'

export default function MoveInPackAdmin({ params }: { params: Promise<{ tenancyId: string }> }) {
  const { tenancyId } = use(params)
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')
  const [form, setForm] = useState({ start_date: '', rent_amount: '', rent_due_day: '1', deposit_amount: '', holding_deposit_received: '', payment_reference: '' })
  const [dirty, setDirty] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [parking, setParking] = useState(false)
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [cc, setCc] = useState('harry@capitalrooms.co.uk')
  const [emailHtml, setEmailHtml] = useState('')

  const load = useCallback(async (resetForm = false) => {
    try {
      const r = await adminFetch(`/api/admin/move-in/${tenancyId}`)
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Could not load this tenancy')
      setData(d)
      if (resetForm) {
        const c = d.context
        setForm({ start_date: c.startDate || '', rent_amount: c.rentMonthly ? String(c.rentMonthly) : '', rent_due_day: String(c.rentDueDay || 1),
          deposit_amount: c.deposit ? String(c.deposit) : '', holding_deposit_received: c.holdingDeposit ? String(c.holdingDeposit) : '', payment_reference: c.paymentRef })
        setPicked(new Set(c.documents.filter((x: Doc) => x.include).map((x: Doc) => x.key)))
        // a suggested (not yet stored) payment reference counts as an unsaved change
        setSubject(d.defaults.subject); setMessage(d.defaults.message); setDirty(!c.paymentRefStored)
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load this tenancy') }
  }, [tenancyId])
  useEffect(() => { load(true) }, [load])

  // Live figures from the form (same maths as the documents)
  const live = useMemo(() => {
    const rent = Number(form.rent_amount) || 0, dep = Number(form.deposit_amount) || 0, hold = Number(form.holding_deposit_received) || 0
    const f = form.start_date && rent ? firstRentPayment(form.start_date, rent, Number(form.rent_due_day) || 1) : null
    return { f, due: Math.round(((f?.amount ?? 0) + dep - hold) * 100) / 100, capDeposit: fiveWeeksDeposit(rent), capHolding: oneWeekRent(rent), dep, hold, rent }
  }, [form])

  async function save() {
    setBusy('save'); setError(''); setNotice('')
    try {
      const r = await adminFetch(`/api/admin/move-in/${tenancyId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Could not save')
      setDirty(false); setNotice('Saved.'); await load(false)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save') }
    finally { setBusy('') }
  }

  async function previewDoc(key: 'agreement' | 'check_in') {
    if (dirty) return setError('Save the figures first, so the preview uses them.')
    setBusy(key); setError('')
    const win = window.open('', '_blank')
    try {
      const r = await adminFetch(`/api/admin/move-in/${tenancyId}/doc?key=${key}${parking ? '&parking=1' : ''}`)
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not build the document')
      const url = URL.createObjectURL(await r.blob())
      if (win) win.location.href = url; else window.open(url, '_blank')
    } catch (e) { win?.close(); setError(e instanceof Error ? e.message : 'Could not build the document') }
    finally { setBusy('') }
  }

  async function previewEmail() {
    setBusy('email'); setError('')
    try {
      const r = await adminFetch(`/api/admin/move-in/${tenancyId}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'preview', docs: [...picked], message }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Could not build the email')
      setEmailHtml(d.html)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not build the email') }
    finally { setBusy('') }
  }

  async function go(action: 'link' | 'test' | 'send') {
    if (dirty) return setError('Save the figures first.')
    if (action === 'send' && !window.confirm(`Email the move-in pack to ${data?.context.tenant.email}?`)) return
    setBusy(action); setError(''); setNotice('')
    try {
      const r = await adminFetch(`/api/admin/move-in/${tenancyId}/send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, docs: [...picked], parking, subject, message, cc }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Could not create the pack')
      if (action === 'link') { await navigator.clipboard?.writeText(d.link).catch(() => {}); setNotice(`Link created and copied: ${d.link}`) }
      else setNotice(action === 'test' ? `Test sent to ${d.sentTo?.[0]}.` : `Sent to ${d.sentTo?.join(', ')}.`)
      await load(false)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create the pack') }
    finally { setBusy('') }
  }

  async function withdraw(p: Pack) {
    if (!window.confirm('Withdraw this link? The tenant will be told it has been replaced.')) return
    const r = await adminFetch(`/api/admin/move-in/packs/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'withdraw' }) })
    if (!r.ok) setError((await r.json().catch(() => ({}))).error || 'Could not withdraw'); else load(false)
  }

  if (!data) return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin/tenancies" />} title="Move-in pack" />
      <div className="mx-auto max-w-6xl px-lg py-xl">{error ? <p className="rounded-xl bg-red-50 px-md py-sm text-sm text-red-700">{error}</p> : <p className="text-sm text-neutral-400">Loading…</p>}</div>
    </div>
  )

  const c = data.context
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { setForm(f => ({ ...f, [k]: e.target.value })); setDirty(true) }

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin/tenancies" />} title="Move-in pack" />
      <PageHero eyebrow="Lettings · Move-in pack" title={c.tenant.formalName} subtitle={`${c.address} · ${c.tenant.email || 'no email'}${c.landlordName ? ` · landlord ${c.landlordName}` : ''}`} />
      <div className="mx-auto max-w-6xl px-lg py-xl space-y-lg">

        {data.setupNeeded && <p className="rounded-xl border border-amber-200 bg-amber-50 px-md py-sm text-sm text-amber-900">{data.setupNeeded}</p>}
        {error && <p className="rounded-xl bg-red-50 px-md py-sm text-sm text-red-700">{error}</p>}
        {notice && <p className="rounded-xl bg-green-50 px-md py-sm text-sm text-green-800 break-all">{notice}</p>}

        <div className="grid gap-lg lg:grid-cols-[1.05fr_1fr]">
          {/* ── Figures ── */}
          <section className="rounded-2xl bg-white p-lg space-y-md">
            <h2 className="font-bold text-neutral-900">Move-in figures</h2>
            <div className="grid grid-cols-2 gap-md">
              <label className="text-xs font-semibold text-neutral-700">Move-in date<input type="date" className={input} value={form.start_date} onChange={set('start_date')} /></label>
              <label className="text-xs font-semibold text-neutral-700">Monthly rent (£)<input inputMode="decimal" className={input} value={form.rent_amount} onChange={set('rent_amount')} /></label>
              <label className="text-xs font-semibold text-neutral-700">Rent due on the
                <select className={input} value={form.rent_due_day} onChange={set('rent_due_day')}>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}{d === 1 ? 'st' : d === 2 ? 'nd' : d === 3 ? 'rd' : d === 21 ? 'st' : d === 22 ? 'nd' : d === 23 ? 'rd' : 'th'}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-neutral-700">Payment reference<input className={input + ' uppercase'} value={form.payment_reference} onChange={set('payment_reference')} />
                {!c.paymentRefStored && <span className="mt-xs block font-normal text-neutral-500">Suggested from the address — saved when you press Save.</span>}
              </label>
              <label className="text-xs font-semibold text-neutral-700">Deposit (£)
                {/* the standard options: 1 month, 5 weeks (rent × 12 ÷ 52 × 5), or any other amount typed in */}
                <span className="mt-xs flex flex-wrap gap-xs font-normal">
                  {([['1 month', live.rent], ['5 weeks', live.capDeposit]] as const).map(([label, amt]) => (
                    <button key={label} type="button" disabled={!live.rent} onClick={() => { setForm(f => ({ ...f, deposit_amount: amt.toFixed(2) })); setDirty(true) }}
                      className={`rounded-lg border px-sm py-xs text-xs font-semibold disabled:opacity-40 ${live.rent && Math.abs(live.dep - amt) < 0.005 ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white text-neutral-800'}`}>
                      {label}{live.rent ? ` · ${gbp(amt)}` : ''}
                    </button>
                  ))}
                  <span className="self-center text-neutral-500">or type another amount:</span>
                </span>
                <input inputMode="decimal" className={input} value={form.deposit_amount} onChange={set('deposit_amount')} />
                {live.dep > live.capDeposit + 0.01 && <span className="mt-xs block font-normal text-red-700">Over the 5-week cap of {gbp(live.capDeposit)}</span>}
              </label>
              <label className="text-xs font-semibold text-neutral-700">Holding deposit already paid (£)<input inputMode="decimal" className={input} value={form.holding_deposit_received} onChange={set('holding_deposit_received')} />
                {live.hold > live.capHolding + 0.01 && <span className="mt-xs block font-normal text-red-700">Over the 1-week cap of {gbp(live.capHolding)}</span>}
              </label>
            </div>

            <div className="rounded-xl bg-neutral-950 p-md text-white">
              {live.f ? (
                <>
                  <div className="flex justify-between text-sm"><span className="text-white/70">{live.f.full ? 'First month' : `Pro-rata rent ${ukLongDate(live.f.from)} – ${ukLongDate(live.f.to)} (${live.f.days} days)`}</span><span className="tabular-nums">{gbp(live.f.amount)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-white/70">Deposit</span><span className="tabular-nums">{gbp(live.dep)}</span></div>
                  {live.hold > 0 && <div className="flex justify-between text-sm"><span className="text-white/70">Less holding deposit</span><span className="tabular-nums">− {gbp(live.hold)}</span></div>}
                  <div className="mt-sm flex justify-between border-t border-white/20 pt-sm font-bold"><span>Balance to pay</span><span className="tabular-nums">{gbp(live.due)}</span></div>
                  <p className="mt-xs text-xs text-white/60">Rent × 12 ÷ 365 × days. The agreement’s first payment and the check-in balance both use this figure.</p>
                </>
              ) : <p className="text-sm text-white/70">Add the move-in date and rent to see the figures.</p>}
            </div>

            <div className="flex flex-wrap items-center gap-sm">
              <button onClick={save} disabled={!dirty || busy === 'save'} className="rounded-lg bg-neutral-900 px-lg py-sm text-sm font-bold text-white disabled:bg-neutral-300">{busy === 'save' ? 'Saving…' : dirty ? 'Save figures' : 'Saved'}</button>
              <button onClick={() => previewDoc('agreement')} disabled={!!busy} className="rounded-lg border border-neutral-300 px-md py-sm text-sm font-bold text-neutral-800">{busy === 'agreement' ? 'Building…' : 'Preview agreement'}</button>
              <button onClick={() => previewDoc('check_in')} disabled={!!busy} className="rounded-lg border border-neutral-300 px-md py-sm text-sm font-bold text-neutral-800">{busy === 'check_in' ? 'Building…' : 'Preview check-in balance'}</button>
              <label className="flex items-center gap-xs text-xs text-neutral-700"><input type="checkbox" checked={parking} onChange={e => setParking(e.target.checked)} />Include parking clause</label>
            </div>
            {c.warnings.length > 0 && <ul className="list-disc space-y-xs pl-lg text-sm text-amber-800">{c.warnings.map(w => <li key={w}>{w}</li>)}</ul>}
          </section>

          {/* ── Documents ── */}
          <section className="rounded-2xl bg-white p-lg">
            <h2 className="font-bold text-neutral-900">Documents</h2>
            <div className="mt-sm space-y-md">
              {GROUPS.map(g => {
                const list = c.documents.filter(d => d.group === g)
                if (!list.length) return null
                return (
                  <div key={g}>
                    <p className="text-xs font-bold uppercase tracking-wide text-neutral-500">{g}</p>
                    <ul className="mt-xs space-y-xs">
                      {list.map(d => (
                        <li key={d.key} className="flex items-start gap-sm text-sm">
                          <input type="checkbox" className="mt-1" checked={picked.has(d.key)} onChange={e => setPicked(p => { const n = new Set(p); if (e.target.checked) n.add(d.key); else n.delete(d.key); return n })} />
                          <span className="flex-1">
                            <span className="text-neutral-900">{d.label}</span>
                            {!d.available && <span className="ml-sm rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-800">Missing</span>}
                            {d.note && <span className="block text-xs text-neutral-500">{d.note}{!d.available && <> · <Link href={`/admin/properties/${c.property.id}`} className="underline">upload on the property</Link></>}</span>}
                          </span>
                          {d.url && d.available && <a href={d.url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-neutral-500 underline">Open</a>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          </section>
        </div>

        {/* ── Email + send ── */}
        <section className="rounded-2xl bg-white p-lg">
          <h2 className="font-bold text-neutral-900">Email to the tenant</h2>
          <div className="mt-sm grid gap-lg lg:grid-cols-2">
            <div className="space-y-sm">
              <label className="block text-xs font-semibold text-neutral-700">To<input className={input} value={c.tenant.email} readOnly /></label>
              <label className="block text-xs font-semibold text-neutral-700">CC<input className={input} value={cc} onChange={e => setCc(e.target.value)} /></label>
              <label className="block text-xs font-semibold text-neutral-700">Subject<input className={input} value={subject} onChange={e => setSubject(e.target.value)} /></label>
              <label className="block text-xs font-semibold text-neutral-700">Message<textarea rows={8} className={input} value={message} onChange={e => setMessage(e.target.value)} /></label>
              {!data.commsLive && <p className="rounded-lg bg-amber-50 px-md py-sm text-xs text-amber-900">Tenant messages are paused in Settings, so “Send to tenant” is off. Send a test to yourself, or create the link and paste it into your own email.</p>}
              <div className="flex flex-wrap gap-sm">
                <button onClick={() => go('send')} disabled={!!busy || !data.commsLive || !!data.setupNeeded} className="rounded-lg bg-neutral-900 px-lg py-sm text-sm font-bold text-white disabled:bg-neutral-300">{busy === 'send' ? 'Sending…' : 'Send to tenant'}</button>
                <button onClick={() => go('test')} disabled={!!busy || !!data.setupNeeded} className="rounded-lg border border-neutral-300 px-md py-sm text-sm font-bold text-neutral-800">{busy === 'test' ? 'Sending…' : 'Send test to me'}</button>
                <button onClick={() => go('link')} disabled={!!busy || !!data.setupNeeded} className="rounded-lg border border-neutral-300 px-md py-sm text-sm font-bold text-neutral-800">{busy === 'link' ? 'Creating…' : 'Create link only'}</button>
                <button onClick={previewEmail} disabled={!!busy} className="rounded-lg px-md py-sm text-sm font-bold text-neutral-600 underline">{busy === 'email' ? 'Building…' : 'Preview email'}</button>
              </div>
            </div>
            <div className="min-h-[360px]">
              {emailHtml ? <iframe title="Email preview" srcDoc={emailHtml} className="h-[520px] w-full rounded-lg border border-neutral-200 bg-white" />
                : <div className="flex h-full min-h-[360px] items-center justify-center rounded-lg border border-dashed border-neutral-300 text-sm text-neutral-400">Press “Preview email” to see it as the tenant will</div>}
            </div>
          </div>
        </section>

        {/* ── Sent ── */}
        {data.packs.length > 0 && (
          <section className="rounded-2xl bg-white p-lg">
            <h2 className="font-bold text-neutral-900">Sent</h2>
            <ul className="mt-sm divide-y divide-neutral-100">
              {data.packs.map(p => {
                const opened = new Set(p.tenancy_pack_events.filter(e => e.event === 'opened_document').map(e => e.document_key))
                const sentTo = p.tenancy_pack_events.find(e => e.event === 'sent')?.document_key
                const avail = p.documents.filter(d => d.available)
                return (
                  <li key={p.id} className="py-md text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-sm">
                      <span className="font-semibold text-neutral-900">
                        {when(p.sent_at)} · {sentTo?.startsWith('test:') ? `test to ${sentTo.slice(5)}` : sentTo ? `emailed to ${sentTo}` : 'link created'}
                      </span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${p.status === 'confirmed' ? 'bg-green-50 text-green-700' : p.status === 'withdrawn' ? 'bg-neutral-100 text-neutral-400' : p.status === 'viewed' ? 'bg-blue-50 text-blue-700' : 'bg-neutral-100 text-neutral-600'}`}>
                        {p.status === 'confirmed' ? 'Ready to sign' : p.status}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-500">
                      {p.first_viewed_at ? `First opened ${when(p.first_viewed_at)}` : 'Not opened yet'} · {opened.size} of {avail.length} documents opened
                      {p.confirmed_at ? ` · confirmed by “${p.confirmed_name}” ${when(p.confirmed_at)}` : ''}
                    </p>
                    {p.tenant_questions && <p className="mt-xs rounded-lg bg-amber-50 px-md py-sm text-xs text-amber-900 whitespace-pre-line">Questions: {p.tenant_questions}</p>}
                    {p.status !== 'withdrawn' && (
                      <div className="mt-xs flex flex-wrap gap-sm">
                        <button onClick={() => navigator.clipboard?.writeText(p.link).then(() => setNotice('Link copied.'))} className="text-xs font-bold text-neutral-700 underline">Copy link</button>
                        <a href={p.link} target="_blank" rel="noreferrer" className="text-xs font-bold text-neutral-700 underline">Open as tenant</a>
                        <button onClick={() => withdraw(p)} className="text-xs font-bold text-neutral-500 underline">Withdraw</button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
            <p className="mt-sm text-xs text-neutral-500">“Open as tenant” counts as an open in the log.</p>
          </section>
        )}
      </div>
    </div>
  )
}
