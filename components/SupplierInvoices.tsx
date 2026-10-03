'use client'

// Invoices made in CROS — for contractors (our completed jobs, and other clients once all our jobs are booked)
// and cleaners (a period's completed cleans in one invoice, each clean only ever on one). A professional PDF
// under their own name and logo; sent to the client with a copy to them. Data: /api/supplier/invoices.

import { useCallback, useEffect, useMemo, useState } from 'react'
import NameInput, { emptyName, toFullName, type NameValue } from '@/app/components/NameInput'

type Tab = 'new' | 'list' | 'details'
interface Line { key: string; description: string; where: string; labour: string; parts: string; partsPaid: boolean; ticketId?: string; cleanId?: string; propertyId?: string; date?: string; receipt?: string | null }
const input = 'w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-[15px] text-neutral-900'
const label = 'block text-xs font-bold uppercase tracking-wide text-neutral-500 mb-1'
const btn = 'rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 disabled:opacity-40'
const btnDark = 'rounded-xl bg-neutral-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-40'
const gbp = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const day = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
let seq = 0
const blank = (): Line => ({ key: `l${++seq}`, description: '', where: '', labour: '', parts: '', partsPaid: false })

async function toDataUrl(file: File, max = 1600): Promise<string> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.8)
}

export default function SupplierInvoices({ viewAs }: { viewAs?: string | null }) {
  const [data, setData] = useState<any>(null)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState<Tab>('new')
  const headers = useMemo(() => ({ 'Content-Type': 'application/json', ...(viewAs ? { 'x-view-as': viewAs } : {}) }), [viewAs])

  const load = useCallback(async () => {
    const r = await fetch('/api/supplier/invoices', { headers })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(d.error ?? 'Could not load'); return }
    setData(d)
    if (d.profile && !d.profile.exists) setTab('details')
  }, [headers])
  useEffect(() => { load() }, [load])

  async function post(body: Record<string, unknown>) {
    const r = await fetch('/api/supplier/invoices', { method: 'POST', headers, body: JSON.stringify(body) })
    if (body.action === 'preview') {
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error ?? 'Could not make the preview') }
      return r.blob()
    }
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(d.error ?? 'Something went wrong')
    return d
  }

  if (err) return <p className="rounded-2xl bg-red-50 p-4 text-sm text-red-800">{err}</p>
  if (!data) return <p className="text-sm text-neutral-500">Loading…</p>
  if (data.setupNeeded) return <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">Invoicing isn’t switched on yet — ask the office.</p>

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-2xl bg-white p-1 ring-1 ring-neutral-200">
        {([['new', 'New invoice'], ['list', `My invoices${data.invoices.length ? ` · ${data.invoices.length}` : ''}`], ['details', 'My details']] as [Tab, string][]).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`flex-1 rounded-xl px-2 py-2 text-sm font-semibold ${tab === k ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}>{l}</button>
        ))}
      </div>
      {!data.gate.enabled && <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">{data.gate.why}</p>}
      {tab === 'new' && data.gate.enabled && (data.role === 'cleaner' ? <CleanerNew data={data} post={post} done={() => { load(); setTab('list') }} /> : <ContractorNew data={data} post={post} done={() => { load(); setTab('list') }} />)}
      {tab === 'list' && <List data={data} headers={headers} post={post} reload={load} />}
      {tab === 'details' && <Details data={data} post={post} saved={() => { load(); setTab('new') }} />}
    </div>
  )
}

// ── lines editor, shared ─────────────────────────────────────────────────────

function Lines({ lines, setLines, post, role }: { lines: Line[]; setLines: (l: Line[]) => void; post: (b: Record<string, unknown>) => Promise<any>; role: 'contractor' | 'cleaner' }) {
  const set = (k: string, u: Partial<Line>) => setLines(lines.map(l => l.key === k ? { ...l, ...u } : l))
  const [busy, setBusy] = useState('')
  async function receipt(k: string, f: File | undefined) {
    if (!f) return
    setBusy(k)
    try { const d = await post({ action: 'receipt', dataUrl: await toDataUrl(f) }); set(k, { receipt: d.path }) } catch (e) { alert(e instanceof Error ? e.message : 'Upload failed') } finally { setBusy('') }
  }
  return (
    <div className="space-y-3">
      {lines.map(l => (
        <div key={l.key} className="rounded-2xl border border-neutral-200 bg-white p-3 space-y-2">
          <div className="flex gap-2">
            <input className={input} value={l.description} onChange={e => set(l.key, { description: e.target.value })} placeholder={role === 'cleaner' ? 'e.g. Fortnightly clean' : 'What you did, e.g. Fixed leaking sink trap'} />
            <button type="button" className="px-2 text-neutral-400" onClick={() => setLines(lines.filter(x => x.key !== l.key))} aria-label="Remove line">✕</button>
          </div>
          <input className={input} value={l.where} onChange={e => set(l.key, { where: e.target.value })} placeholder={role === 'cleaner' ? 'Property / notes' : 'Where exactly, e.g. Room 3 en-suite, kitchen'} />
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-neutral-600">{role === 'cleaner' ? 'Clean price (£)' : 'Labour (£)'}<input inputMode="decimal" className={`${input} mt-1`} value={l.labour} onChange={e => set(l.key, { labour: e.target.value.replace(/[^\d.]/g, '') })} /></label>
            <div className="text-xs text-neutral-600">
              <label className="flex items-center gap-2 py-1"><input type="checkbox" checked={l.partsPaid} onChange={e => set(l.key, { partsPaid: e.target.checked, parts: e.target.checked ? l.parts : '' })} /> {role === 'cleaner' ? 'Bought products?' : 'Paid for parts?'}</label>
              {l.partsPaid && <input inputMode="decimal" className={input} value={l.parts} onChange={e => set(l.key, { parts: e.target.value.replace(/[^\d.]/g, '') })} placeholder="£" />}
            </div>
          </div>
          {l.partsPaid && (
            <label className="block text-xs text-neutral-600">{l.receipt ? '✅ Receipt added' : busy === l.key ? 'Uploading…' : 'Add the receipt photo (optional) — say which items were for this job above'}
              <input type="file" accept="image/*" className="mt-1 block text-xs" onChange={e => receipt(l.key, e.target.files?.[0])} />
            </label>
          )}
        </div>
      ))}
      <button type="button" className={btn} onClick={() => setLines([...lines, blank()])}>+ Add a line</button>
    </div>
  )
}

function Totals({ lines, vat }: { lines: Line[]; vat: boolean }) {
  const labour = lines.reduce((t, l) => t + (Number(l.labour) || 0), 0), parts = lines.reduce((t, l) => t + (l.partsPaid ? Number(l.parts) || 0 : 0), 0)
  const v = vat ? (labour + parts) * 0.2 : 0
  return <p className="text-right text-sm text-neutral-700">Labour {gbp(labour)} · {lines.some(l => l.partsPaid) ? `Parts ${gbp(parts)} · ` : ''}{vat ? `VAT ${gbp(v)} · ` : ''}<strong className="text-neutral-900">Total {gbp(labour + parts + v)}</strong></p>
}

const toDraftLines = (lines: Line[]) => lines.map(l => ({ description: l.description, where: l.where, labour: Number(l.labour) || 0, parts: l.partsPaid ? Number(l.parts) || 0 : 0, ticketId: l.ticketId, cleanId: l.cleanId, propertyId: l.propertyId, date: l.date, receipt: l.receipt }))

function SendBar({ draft, post, done }: { draft: () => any; post: (b: Record<string, unknown>) => Promise<any>; done: () => void }) {
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  async function preview() {
    setBusy('preview'); setMsg('')
    const win = window.open('', '_blank')
    try { const blob = await post({ action: 'preview', draft: draft() }); const u = URL.createObjectURL(blob); if (win) win.location.href = u; else window.location.href = u }
    catch (e) { win?.close(); setMsg(e instanceof Error ? e.message : 'Could not preview') } finally { setBusy('') }
  }
  async function send() {
    if (!confirm('Send this invoice now? It gets its number and is emailed to the client, with a copy to you.')) return
    setBusy('send'); setMsg('')
    try { const d = await post({ action: 'send', draft: draft() }); alert(`Invoice ${d.number} ${d.emailed ? 'sent' : `saved — but the email to the client didn’t go (${d.emailError}). Fix the address and use “Email it again” in My invoices.`}${d.emailed && d.copyOk === false ? ' (your copy couldn’t be emailed — check your email in My details)' : ''}`); done() }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Could not send') } finally { setBusy('') }
  }
  return (
    <div className="space-y-2">
      {msg && <p className="text-sm text-red-700">{msg}</p>}
      <div className="flex gap-2">
        <button type="button" className={`${btn} flex-1`} disabled={!!busy} onClick={preview}>{busy === 'preview' ? 'Making…' : 'Preview'}</button>
        <button type="button" className={`${btnDark} flex-1`} disabled={!!busy} onClick={send}>{busy === 'send' ? 'Sending…' : 'Send invoice'}</button>
      </div>
    </div>
  )
}

// ── contractor ───────────────────────────────────────────────────────────────

function ContractorNew({ data, post, done }: { data: any; post: (b: Record<string, unknown>) => Promise<any>; done: () => void }) {
  const [ours, setOurs] = useState(true)
  const [propertyId, setPropertyId] = useState('')
  const [client, setClient] = useState({ company: '', email: '', address: '' })
  const [contact, setContact] = useState<NameValue>(emptyName())
  const [lines, setLines] = useState<Line[]>([])
  const [notes, setNotes] = useState('')
  const jobs = (data.jobs as any[]).filter(j => !propertyId || j.propertyId === propertyId)
  const added = new Set(lines.map(l => l.ticketId).filter(Boolean))
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-4 ring-1 ring-neutral-200 space-y-3">
        <p className={label}>Who is it for?</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => { setOurs(true); setLines([]) }} className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${ours ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300'}`}>Capital Rooms</button>
          <button type="button" disabled={!data.gate.others} onClick={() => { setOurs(false); setLines([blank()]) }} className={`rounded-xl border px-3 py-2.5 text-sm font-semibold disabled:opacity-40 ${!ours ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300'}`}>Another client</button>
        </div>
        {!data.gate.others && (
          <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            {data.gate.why}
            <ul className="mt-1 list-disc pl-5 text-xs">{data.gate.unbooked.slice(0, 6).map((u: any) => <li key={u.id}>{u.title} — {u.where}</li>)}</ul>
          </div>
        )}
        {ours ? (
          <label className="block"><span className={label}>Which property?</span>
            <select className={input} value={propertyId} onChange={e => { setPropertyId(e.target.value); setLines([]) }}>
              <option value="">Choose…</option>
              {data.properties.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        ) : (
          <div className="space-y-2">
            <NameInput value={contact} onChange={setContact} label="Client (the person)" inputClass={input} />
            <input className={input} value={client.company} onChange={e => setClient({ ...client, company: e.target.value })} placeholder="Company name (if it’s a business — optional)" />
            <input className={input} type="email" value={client.email} onChange={e => setClient({ ...client, email: e.target.value })} placeholder="Client email (to send it)" />
            <textarea rows={2} className={input} value={client.address} onChange={e => setClient({ ...client, address: e.target.value })} placeholder="Client address" />
          </div>
        )}
      </div>
      {ours && propertyId && (
        <div className="rounded-2xl bg-white p-4 ring-1 ring-neutral-200 space-y-2">
          <p className={label}>Your completed jobs here</p>
          {jobs.length ? jobs.map(j => (
            <label key={j.id} className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={added.has(j.id)} onChange={e => setLines(e.target.checked
                ? [...lines, { ...blank(), description: j.title, where: j.where, labour: j.price ? String(j.price) : '', ticketId: j.id, propertyId: j.propertyId }]
                : lines.filter(l => l.ticketId !== j.id))} />
              <span><strong>{j.title}</strong><span className="block text-xs text-neutral-500">{j.where || 'Where?'} · done {day(j.completedAt)}{j.price ? ` · £${j.price}` : ''}</span></span>
            </label>
          )) : <p className="text-sm text-neutral-500">No completed jobs to invoice at this property — add a line below for anything else.</p>}
        </div>
      )}
      {(ours ? !!propertyId : true) && <Lines lines={lines} setLines={setLines} post={post} role="contractor" />}
      {lines.length > 0 && <>
        <textarea rows={2} className={input} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Note on the invoice (optional)" />
        <Totals lines={lines} vat={data.profile.vatRegistered} />
        <SendBar post={post} done={done} draft={() => ({ toCapitalRooms: ours, propertyId: ours ? propertyId : null, client: ours ? undefined : { name: client.company.trim() || toFullName(contact), email: client.email, address: [client.company.trim() && toFullName(contact) ? `FAO ${toFullName(contact)}` : '', client.address].filter(Boolean).join('\n') }, lines: toDraftLines(lines), notes })} />
      </>}
    </div>
  )
}

// ── cleaner ──────────────────────────────────────────────────────────────────

function CleanerNew({ data, post, done }: { data: any; post: (b: Record<string, unknown>) => Promise<any>; done: () => void }) {
  const cleans: any[] = data.cleans
  const [from, setFrom] = useState(cleans[0]?.date ?? today())
  const [to, setTo] = useState(today())
  const inRange = cleans.filter(c => c.date >= from && c.date <= to)
  const [lines, setLines] = useState<Line[]>([])
  const [notes, setNotes] = useState('')
  // the cleans in the period, prefilled; extra lines kept when the period changes
  useEffect(() => {
    setLines(prev => [
      ...inRange.map(c => prev.find(l => l.cleanId === c.id) ?? {
        ...blank(), cleanId: c.id, propertyId: c.propertyId, date: c.date,
        description: `Clean — ${day(c.date)}`, where: [c.property, c.extraNote].filter(Boolean).join(' · '),
        labour: c.price != null ? String(Number(c.price) + Number(c.extra || 0)) : c.extra ? String(c.extra) : '',
        partsPaid: !!Number(c.products), parts: Number(c.products) ? String(c.products) : '',
      }),
      ...prev.filter(l => !l.cleanId),
    ])
  }, [from, to])   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-4 ring-1 ring-neutral-200 space-y-3">
        <p className="text-sm text-neutral-700">One invoice for all your cleans in a period, sent to Capital Rooms. Cleans already on an invoice don’t show — each one can only be paid once.</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-neutral-600">From<input type="date" className={`${input} mt-1`} value={from} onChange={e => setFrom(e.target.value)} /></label>
          <label className="text-xs text-neutral-600">To<input type="date" className={`${input} mt-1`} value={to} max={today()} onChange={e => setTo(e.target.value)} /></label>
        </div>
        <p className="text-sm font-semibold text-neutral-900">{inRange.length} completed clean{inRange.length === 1 ? '' : 's'} not yet invoiced</p>
      </div>
      <Lines lines={lines} setLines={setLines} post={post} role="cleaner" />
      {lines.length > 0 && <>
        <textarea rows={2} className={input} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Note on the invoice (optional)" />
        <Totals lines={lines} vat={data.profile.vatRegistered} />
        <SendBar post={post} done={done} draft={() => ({ toCapitalRooms: true, periodFrom: from, periodTo: to, lines: toDraftLines(lines), notes })} />
      </>}
    </div>
  )
}

// ── my invoices / my details ─────────────────────────────────────────────────

function List({ data, headers, post, reload }: { data: any; headers: Record<string, string>; post: (b: Record<string, unknown>) => Promise<any>; reload: () => Promise<void> }) {
  async function resend(id: string) {
    try { await post({ action: 'resend', id }); alert('Emailed'); reload() } catch (e) { alert(e instanceof Error ? e.message : 'Could not email it') }
  }
  async function open(id: string) {
    const win = window.open('', '_blank')
    const r = await fetch(`/api/supplier/invoices?pdf=${id}`, { headers })
    if (!r.ok) { win?.close(); alert('Could not open it'); return }
    const u = URL.createObjectURL(await r.blob()); if (win) win.location.href = u; else window.location.href = u
  }
  if (!data.invoices.length) return <p className="rounded-2xl bg-white p-4 text-sm text-neutral-500 ring-1 ring-neutral-200">No invoices yet.</p>
  return (
    <ul className="divide-y divide-neutral-100 rounded-2xl bg-white ring-1 ring-neutral-200">
      {data.invoices.map((i: any) => (
        <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-3">
          <span className="min-w-0"><span className="font-semibold text-neutral-900">No. {i.number} · {gbp(Number(i.total))}</span>
            <span className="block truncate text-xs text-neutral-500">{i.client}{i.property ? ` · ${i.property}` : ''} · {day(i.date)} · {i.status === 'paid' ? 'paid' : i.status === 'approved' ? 'approved' : i.status === 'void' ? 'void' : i.emailed ? 'sent' : 'saved (not emailed)'}</span></span>
          <span className="flex shrink-0 gap-2">
            {!i.emailed && i.status !== 'void' && <button type="button" className={btn} onClick={() => resend(i.id)}>Email it again</button>}
            <button type="button" className={btn} onClick={() => open(i.id)}>PDF</button>
          </span>
        </li>
      ))}
    </ul>
  )
}

function Details({ data, post, saved }: { data: any; post: (b: Record<string, unknown>) => Promise<any>; saved: () => void }) {
  const p = data.profile
  const [v, setV] = useState({ tradingName: p.tradingName ?? '', address: p.address ?? '', phone: p.phone ?? '', email: p.email ?? '', bankName: p.bankName ?? '', sortCode: p.sortCode ?? '', accountNo: p.accountNo ?? '', vatRegistered: !!p.vatRegistered, vatNumber: p.vatNumber ?? '', paymentDays: String(p.paymentDays ?? 14) })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const f = (k: keyof typeof v, l: string, extra: Record<string, unknown> = {}) => (
    <label className="block"><span className={label}>{l}</span><input className={input} value={String(v[k])} onChange={e => setV({ ...v, [k]: e.target.value })} {...extra} /></label>
  )
  async function save() {
    setBusy(true); setMsg('')
    try { await post({ action: 'profile', ...v }); saved() } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not save') } finally { setBusy(false) }
  }
  async function logo(file: File | undefined) {
    if (!file) return
    try { await post({ action: 'logo', dataUrl: await toDataUrl(file, 600) }); setMsg('Logo saved') } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not save the logo') }
  }
  const initials = String(v.tradingName || '?').replace(/\b(ltd|limited)\b/gi, '').trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('')
  return (
    <div className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-neutral-200">
      <p className="text-sm text-neutral-600">These go on your invoices. Your bank details are only shown on your own invoices.</p>
      <div className="flex items-center gap-3">
        {p.logoPath ? <span className="text-sm">Your logo is set.</span> : <span className="flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold text-white" style={{ background: p.colour }}>{initials}</span>}
        <label className="text-xs text-neutral-600">{p.logoPath ? 'Change logo' : 'Using a generated logo — upload your own (optional)'}<input type="file" accept="image/png,image/jpeg" className="mt-1 block text-xs" onChange={e => logo(e.target.files?.[0])} /></label>
      </div>
      {f('tradingName', 'Business name')}
      <label className="block"><span className={label}>Business address</span><textarea rows={2} className={input} value={v.address} onChange={e => setV({ ...v, address: e.target.value })} /></label>
      <div className="grid grid-cols-2 gap-2">{f('phone', 'Phone')}{f('email', 'Email (you get a copy here)', { type: 'email' })}</div>
      {f('bankName', 'Account name')}
      <div className="grid grid-cols-2 gap-2">{f('sortCode', 'Sort code', { inputMode: 'numeric', placeholder: '12-34-56' })}{f('accountNo', 'Account number', { inputMode: 'numeric' })}</div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.vatRegistered} onChange={e => setV({ ...v, vatRegistered: e.target.checked })} /> I’m VAT registered (adds 20%)</label>
      {v.vatRegistered && f('vatNumber', 'VAT number')}
      {f('paymentDays', 'Payment due after (days)', { inputMode: 'numeric' })}
      {msg && <p className={`text-sm ${msg === 'Logo saved' ? 'text-green-700' : 'text-red-700'}`}>{msg}</p>}
      <button type="button" className={`${btnDark} w-full`} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save my details'}</button>
    </div>
  )
}
