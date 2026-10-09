'use client'

// Capture — photos and paperwork from your phone, filed in a couple of taps (migration 204).
// Take a photo or pick from the camera roll (or share to the "Send to CROS" iPhone shortcut); a quick look suggests
// what it is and which property; you confirm and it's filed: room / property photos, letters and post, bills,
// certificates (through the AI Doc Scanner), handwritten smoke-alarm / fire-door sheets (each line becomes a check,
// the photo kept as proof), or company post. Data: /api/admin/capture.

import { use, useCallback, useEffect, useRef, useState } from 'react'
import AppBar from '@/components/AppBar'
import PageHero, { HeroButton } from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'
import { adminFetch } from '@/lib/adminFetch'
import { createClient } from '@/lib/supabase'
import { one, type PageSearchParams } from '@/lib/pageSearchParams'

type Tab = 'inbox' | 'company' | 'iphone'
const card = 'rounded-2xl border border-neutral-200 bg-white'
const input = 'w-full rounded-lg border border-neutral-300 bg-white px-sm py-xs text-sm text-neutral-900'
const btn = 'rounded-lg border border-neutral-300 px-md py-xs text-sm font-semibold text-neutral-800 hover:bg-neutral-50 disabled:opacity-40'
const btnDark = 'rounded-lg bg-neutral-900 px-md py-xs text-sm font-bold text-white hover:bg-neutral-700 disabled:opacity-40'
const SITE = typeof window !== 'undefined' ? window.location.origin : 'https://cros-sigma.vercel.app'

/** A small JPEG of a photo for the quick look (cheaper and faster than the original). */
async function thumbnail(file: File, max = 900): Promise<string | null> {
  if (!file.type.startsWith('image/')) return null
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', 0.72)
  } catch { return null }
}

export default function CapturePage({ searchParams }: { searchParams: PageSearchParams }) {
  const sp = use(searchParams)
  const t = one(sp.tab) as Tab
  return <Capture initialTab={['inbox', 'company', 'iphone'].includes(t) ? t : 'inbox'} />
}

function Capture({ initialTab }: { initialTab: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const [data, setData] = useState<any>(null)
  const [err, setErr] = useState('')
  const [uploading, setUploading] = useState<string[]>([])
  const camRef = useRef<HTMLInputElement>(null)
  const pickRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const r = await adminFetch('/api/admin/capture')
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(d.error ?? 'Could not load'); return }
    setData(d)
  }, [])
  useEffect(() => { load() }, [load])

  async function addFiles(list: FileList | null) {
    const files = Array.from(list ?? [])
    if (!files.length) return
    setErr('')
    for (const f of files) {
      setUploading(u => [...u, f.name])
      try {
        const r = await adminFetch('/api/admin/capture', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'upload_url', fileName: f.name || 'photo.jpg', mime: f.type, size: f.size }) })
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d.error ?? 'Could not upload')
        const { error } = await createClient().storage.from('capture').uploadToSignedUrl(d.path, d.token, f, { contentType: f.type || undefined })
        if (error) throw new Error(error.message)
        const thumb = await thumbnail(f)
        await adminFetch('/api/admin/capture', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'look', id: d.itemId, thumb }) })
      } catch (e) { setErr(`${f.name}: ${e instanceof Error ? e.message : 'upload failed'}`) }
      finally { setUploading(u => u.filter(n => n !== f.name)) }
      await load()
    }
  }

  const items: any[] = data?.items ?? []
  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin" />} title="Capture" />
      <PageHero
        eyebrow="Documents"
        title="Capture"
        subtitle="Photos, paperwork and emailed invoices in one list: check what CROS thinks each is, and file it. Nothing becomes an expense until you file it here."
        stats={[{ label: 'To file', value: items.length, tone: items.length ? 'warn' : undefined }, { label: 'Emailed invoices waiting', value: items.filter((i: any) => i.source === 'email').length }, { label: 'Company expenses', value: (data?.company ?? []).filter((c: any) => c.amount && !c.voided_at).length }]}
        actions={<>
          <HeroButton primary onClick={() => camRef.current?.click()}>📷 Take a photo</HeroButton>
          <HeroButton onClick={() => pickRef.current?.click()}>Choose photos or files</HeroButton>
        </>}
        tabs={([['inbox', `To file${items.length ? ` · ${items.length}` : ''}`], ['company', 'Company post & expenses'], ['iphone', 'Email & iPhone']] as [Tab, string][]).map(([k, l]) => ({ key: k, label: l, active: tab === k, onClick: () => setTab(k) }))}
      />
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
      <input ref={pickRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={e => { addFiles(e.target.files); e.target.value = '' }} />

      <div className="mx-auto max-w-6xl px-lg py-xl space-y-md">
        {err && <p className="rounded-xl border border-red-200 bg-red-50 px-lg py-sm text-sm text-red-800">{err}</p>}
        {data?.setupNeeded && <p className="rounded-xl border border-amber-200 bg-amber-50 px-lg py-sm text-sm text-amber-900">Run migration 204 in Supabase to switch Capture on.</p>}
        {uploading.length > 0 && <p className="rounded-xl bg-white px-lg py-sm text-sm text-neutral-600">Uploading and taking a quick look: {uploading.join(', ')}…</p>}
        {!data && !err && <p className="text-sm text-neutral-500">Loading…</p>}

        {data && tab === 'inbox' && (
          items.length ? items.map(it => <Item key={it.id} it={it} data={data} reload={load} />) : (
            <div className={`${card} p-xl text-center`}>
              <p className="text-sm text-neutral-600">Nothing waiting. Take a photo of a letter, a room or a safety-check sheet — or share one from your camera roll.</p>
              <div className="mt-md flex justify-center gap-sm"><button type="button" className={btnDark} onClick={() => camRef.current?.click()}>📷 Take a photo</button><button type="button" className={btn} onClick={() => pickRef.current?.click()}>Choose files</button></div>
            </div>
          )
        )}
        {data && tab === 'inbox' && (data.recent ?? []).length > 0 && (
          <section className={card}>
            <h3 className="border-b border-neutral-100 px-lg py-sm text-xs font-bold uppercase tracking-wider text-neutral-500">Recently filed</h3>
            <ul className="divide-y divide-neutral-100 text-sm">
              {data.recent.map((r: any) => <li key={r.id} className="flex justify-between gap-sm px-lg py-xs"><span className="truncate">{r.name} <span className="text-neutral-500">· {r.kind}{r.property ? ` · ${r.property}` : ''}</span></span><span className="shrink-0 text-xs text-neutral-400">{new Date(r.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span></li>)}
            </ul>
          </section>
        )}

        {data && tab === 'company' && <CompanyTab data={data} reload={load} />}

        {data && tab === 'iphone' && <><EmailSetup data={data} /><IphoneSetup keys={data.keys ?? []} reload={load} /></>}
      </div>
    </div>
  )
}

// ── one item waiting to be filed ─────────────────────────────────────────────

function Item({ it, data, reload }: { it: any; data: any; reload: () => Promise<void> }) {
  const g = it.guess ?? {}
  const kinds: Record<string, string> = data.kinds ?? {}
  const [kind, setKind] = useState<string>(g.kind ?? '')
  const [propertyId, setPropertyId] = useState<string>(g.propertyId ?? '')
  const roomsHere = (data.rooms ?? []).filter((r: any) => r.property_id === propertyId)
  const guessRoom = roomsHere.find((r: any) => g.room && r.name.toLowerCase() === String(g.room).toLowerCase())
  const [roomId, setRoomId] = useState<string>('')
  const [title, setTitle] = useState<string>(g.title ?? '')
  const [rows, setRows] = useState<any[] | null>(null)
  const [unreadable, setUnreadable] = useState('')
  const [bill, setBill] = useState<any>(null)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [mode, setMode] = useState<'landlord' | 'company' | 'document'>(it.bill?.belongs_to === 'landlord' ? 'landlord' : it.bill?.belongs_to === 'company' ? 'company' : 'document')
  useEffect(() => { if (guessRoom && !roomId) setRoomId(guessRoom.id) }, [guessRoom, roomId])
  const isImage = String(it.mime ?? '').startsWith('image/') || /\.(jpe?g|png|webp|gif|heic)$/i.test(it.file_name)

  async function post(body: Record<string, unknown>) {
    const r = await adminFetch('/api/admin/capture', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: it.id, ...body }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(d.error ?? 'Something went wrong')
    return d
  }
  async function read(k: 'safety_sheet' | 'bill') {
    setBusy('read'); setMsg('')
    try {
      const d = await post({ action: 'read', kind: k })
      if (k === 'safety_sheet') { setRows(d.rows ?? []); setUnreadable(d.unreadable ?? '') } else setBill(d.bill)
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not read it') } finally { setBusy('') }
  }
  async function file() {
    setBusy('file'); setMsg('')
    try {
      const d = await post({ action: 'file', kind, propertyId: propertyId || null, roomId: roomId || null, title, rows, bill })
      setMsg(`✅ Filed: ${d.filedTo}`)
      setTimeout(reload, 1200)
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not file it') } finally { setBusy('') }
  }
  async function toScanner() {
    await post({ action: 'handed_to_scanner' })
    window.location.href = `/admin/ai-upload?capture=${it.id}`
  }

  const needsProperty = ['room_photo', 'property_photo', 'safety_sheet', 'certificate'].includes(kind)
  const canFile = kind && kind !== 'certificate' && (!needsProperty || propertyId) && (kind !== 'room_photo' || roomId) && (kind !== 'safety_sheet' || (rows && rows.length))
  return (
    <section className={`${card} p-md`}>
      <div className="grid gap-md sm:grid-cols-[160px_minmax(0,1fr)]">
        <a href={it.url ?? '#'} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl bg-neutral-100">
          {isImage && it.url ? <img src={it.url} alt="" className="h-40 w-full object-cover" /> : <div className="flex h-40 items-center justify-center text-3xl">📄</div>}
        </a>
        <div className="min-w-0 space-y-sm">
          <p className="text-xs text-neutral-500">{it.file_name} · {it.source === 'email' ? `emailed${it.email_from ? ` by ${it.email_from}` : ''}${it.email_subject ? ` — “${it.email_subject}”` : ''}` : it.source === 'shortcut' ? 'shared from iPhone' : 'from your phone'} · {new Date(it.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</p>
          {g.kind ? <p className="text-sm text-neutral-700">Looks like <strong>{kinds[g.kind] ?? g.kind}</strong>{g.title ? ` — ${g.title}` : ''}{g.reason ? <span className="text-neutral-500"> ({g.reason})</span> : null}</p> : <p className="text-sm text-neutral-500">Say what it is:</p>}
          <div className="flex flex-wrap gap-xs">
            {Object.entries(kinds).map(([k, l]) => (
              <button key={k} type="button" onClick={() => { setKind(k); setRows(null); setBill(null) }} className={`rounded-full border px-sm py-0.5 text-xs font-semibold ${kind === k ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 text-neutral-700'}`}>{l}</button>
            ))}
          </div>
          {kind && kind !== 'company_post' && !((kind === 'bill' || kind === 'receipt') && mode === 'company') && (
            <div className="grid gap-sm sm:grid-cols-2">
              <select className={input} value={propertyId} onChange={e => { setPropertyId(e.target.value); setRoomId('') }}>
                <option value="">{needsProperty ? 'Which property?' : 'Which property? (none = company post)'}</option>
                {(data.properties ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.name}{p.letOnly ? ' (let only)' : ''}</option>)}
              </select>
              {(kind === 'room_photo' || ((kind === 'bill' || kind === 'receipt') && mode === 'landlord')) && <select className={input} value={roomId} onChange={e => setRoomId(e.target.value)} disabled={!propertyId}>
                <option value="">{kind === 'room_photo' ? 'Which room?' : 'Room (optional)'}</option>
                {roomsHere.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>}
            </div>
          )}
          {kind && !((kind === 'bill' || kind === 'receipt') && mode !== 'document') && <input className={input} value={title} onChange={e => setTitle(e.target.value)} placeholder="A short name for it" />}

          {kind === 'safety_sheet' && (
            rows ? (
              <div className="rounded-xl bg-neutral-50 p-sm">
                <p className="mb-xs text-xs font-semibold text-neutral-600">{rows.length} check{rows.length === 1 ? '' : 's'} read — fix anything wrong, then file. Checks already on record for that day are skipped.</p>
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-xs">
                    <tbody className="divide-y divide-neutral-200">
                      {rows.map((r, i) => (
                        <tr key={i}>
                          <td className="py-0.5 pr-xs"><input type="date" className="rounded border border-neutral-300 px-1 py-0.5" value={r.date} onChange={e => setRows(rows.map((x, j) => j === i ? { ...x, date: e.target.value } : x))} /></td>
                          <td className="pr-xs"><select className="rounded border border-neutral-300 px-1 py-0.5" value={r.check} onChange={e => setRows(rows.map((x, j) => j === i ? { ...x, check: e.target.value } : x))}><option value="smoke_alarm">Smoke alarm</option><option value="fire_door">Fire door</option></select></td>
                          <td className="pr-xs">{r.result === 'fault' ? <span className="font-semibold text-red-700">Fault</span> : r.result === 'unclear' ? <span className="text-amber-700">Unclear</span> : 'OK'}</td>
                          <td className="pr-xs text-neutral-600">{[r.location, r.checked_by, r.notes].filter(Boolean).join(' · ')}</td>
                          <td><button type="button" className="text-neutral-400 hover:text-red-600" onClick={() => setRows(rows.filter((_, j) => j !== i))}>✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {unreadable && <p className="mt-xs text-xs text-amber-800">Couldn’t read: {unreadable}</p>}
              </div>
            ) : <button type="button" className={btn} disabled={!!busy} onClick={() => read('safety_sheet')}>{busy === 'read' ? 'Reading the sheet…' : 'Read the checks'}</button>
          )}
          {(kind === 'bill' || kind === 'receipt') && !it.bill && !bill && (
            <button type="button" className={btn} disabled={!!busy} onClick={() => read('bill')}>{busy === 'read' ? 'Reading…' : 'Read it (supplier, amount, date)'}</button>
          )}
          {(kind === 'bill' || kind === 'receipt') && (it.bill || bill) && (
            <ExpensePanel it={it} data={data} read={it.bill ?? bill} propertyId={propertyId} roomId={roomId} mode={mode} setMode={setMode} reload={reload} />
          )}
          {kind === 'certificate' && <p className="text-xs text-neutral-600">Certificates are read in the AI Doc Scanner so the property’s expiry dates update.</p>}

          <div className="flex flex-wrap items-center gap-sm pt-xs">
            {kind === 'certificate'
              ? <button type="button" className={btnDark} onClick={toScanner}>Read it in the scanner →</button>
              : ((kind === 'bill' || kind === 'receipt') && mode !== 'document') ? null
              : <button type="button" className={btnDark} disabled={!canFile || !!busy} onClick={file}>{busy === 'file' ? 'Filing…' : 'File it'}</button>}
            <button type="button" className={btn} disabled={!!busy} onClick={async () => { if (confirm('Discard this? It won’t be filed anywhere.')) { await post({ action: 'discard' }); reload() } }}>Discard</button>
            {msg && <span className={`text-sm ${msg.startsWith('✅') ? 'text-green-700' : 'text-red-700'}`}>{msg}</span>}
          </div>
        </div>
      </div>
    </section>
  )
}

// ── a bill or receipt: landlord expense, company expense, or just the document ─────────────
// Everything is checked on the server (lib/expenses/create): duplicates, which statement, one expense per document.

const gbp = (n: number) => `£${Number(n || 0).toFixed(2)}`
function ExpensePanel({ it, data, read, propertyId, roomId, mode, setMode, reload }: {
  it: any; data: any; read: any; propertyId: string; roomId: string; mode: 'landlord' | 'company' | 'document'; setMode: (m: 'landlord' | 'company' | 'document') => void; reload: () => Promise<void>
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [amount, setAmount] = useState(read?.amount ? String(read.amount) : '')
  const [date, setDate] = useState<string>(read?.date || read?.period_to || today)
  const [supplier, setSupplier] = useState<string>(read?.supplier ?? '')
  const [invoiceNumber, setInvoiceNumber] = useState<string>(read?.invoice_number ?? '')
  const [description, setDescription] = useState<string>([read?.what_for, read?.supplier && read?.what_for ? '' : read?.supplier].filter(Boolean).join(' ') || '')
  const [category, setCategory] = useState<string>(read?.company_category ?? 'Other')
  const [paid, setPaid] = useState<boolean>(!!read?.already_paid || !!read?.direct_debit)
  const [share, setShare] = useState(false)
  const [charge, setCharge] = useState('')   // a different amount for the landlord (mark-up on goods resold)
  const [split, setSplit] = useState(false)  // one invoice covering several houses
  const [shares, setShares] = useState<{ propertyId: string; amount: string }[]>([{ propertyId: '', amount: '' }, { propertyId: '', amount: '' }])
  const props: { id: string; name: string }[] = data.properties ?? []
  // the first share is the house chosen above; the last takes whatever is left
  const sharesShown = shares.map((x, i) => ({ ...x, propertyId: i === 0 ? propertyId : x.propertyId, amount: i === shares.length - 1 && x.amount === '' ? String(Math.round((Number(amount) - shares.slice(0, -1).reduce((n, y) => n + (Number(y.amount) || 0), 0)) * 100) / 100) : x.amount }))
  const sharesTotal = Math.round(sharesShown.reduce((n, x) => n + (Number(x.amount) || 0), 0) * 100) / 100
  const [choices, setChoices] = useState<{ month: string; label: string }[]>([])
  const [deductMonth, setDeductMonth] = useState('')
  const [dups, setDups] = useState<any[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  // which statements it could come off, and anything already on record it might be — refreshed as the facts change
  useEffect(() => {
    if (mode !== 'landlord' || !propertyId) { setChoices([]); setDups([]); return }
    const t = setTimeout(async () => {
      const r = await adminFetch('/api/admin/capture', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'choices', id: it.id, propertyId, date, amount: Number(amount), description, invoiceNumber, roomId }) })
      const d = await r.json().catch(() => ({}))
      setChoices(d.choices ?? []); setDups(d.duplicates ?? [])
      setDeductMonth(m => (d.choices ?? []).some((c: any) => c.month === m) ? m : d.choices?.[0]?.month ?? '')
    }, 400)
    return () => clearTimeout(t)
  }, [mode, propertyId, date, amount, description, invoiceNumber, roomId, it.id])

  async function go(confirmDuplicate = false) {
    setBusy(true); setMsg('')
    try {
      const r = await adminFetch('/api/admin/capture', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        action: 'expense', id: it.id, as: mode, amount: Number(amount), date, supplier, invoiceNumber, description, propertyId, roomId: roomId || null,
        deductMonth, shareInvoice: share, category, paidOn: paid ? date : null, paidHow: paid ? (read?.direct_debit ? 'direct_debit' : 'card') : null, confirmDuplicate,
        charge: mode === 'landlord' && !split && charge !== '' ? Number(charge) : null,
        splits: mode === 'landlord' && split ? sharesShown.map(x => ({ propertyId: x.propertyId, amount: Number(x.amount) })) : null,
      }) })
      const d = await r.json().catch(() => ({}))
      if (r.status === 409 && d.duplicates) { setDups(d.duplicates); setMsg('Looks like one already on record — check below.'); return }
      if (!r.ok) throw new Error(d.error ?? 'Could not file it')
      setMsg(`✅ ${d.filedTo}`); setTimeout(reload, 1500)
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not file it') } finally { setBusy(false) }
  }

  const amountChanged = read?.amount && Number(amount) !== Number(read.amount)
  const ready = Number(amount) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date) && description.trim() && (mode !== 'landlord' || (propertyId && (split ? sharesShown.every(x => x.propertyId && Number(x.amount) > 0) && sharesTotal === Math.round(Number(amount) * 100) / 100 : deductMonth)))
  return (
    <div className="space-y-sm rounded-xl border border-neutral-200 bg-neutral-50 p-sm">
      {read?.reason && <p className="text-xs text-neutral-600">CROS suggests <b>{read.belongs_to === 'landlord' ? 'a landlord expense' : read.belongs_to === 'company' ? 'a company expense' : 'checking this'}</b> — {read.reason}{read.confidence != null ? ` (${Math.round(read.confidence * 100)}% sure)` : ''}</p>}
      {read?.duplicate && <p className="rounded-lg bg-amber-100 px-sm py-xs text-xs font-semibold text-amber-900">⚠ {read.duplicate}</p>}
      {read?.doc_type === 'credit_note' && <p className="rounded-lg bg-amber-100 px-sm py-xs text-xs font-semibold text-amber-900">This is a credit note (money back), not a cost. File it as a document and adjust the original by hand.</p>}
      <div className="flex flex-wrap gap-xs">
        {([['landlord', 'Landlord expense'], ['company', 'Company expense'], ['document', 'Just file the document']] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setMode(k)} disabled={k !== 'document' && read?.doc_type === 'credit_note'} className={`h-8 rounded-lg border px-md text-xs font-semibold disabled:opacity-40 ${mode === k ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white text-neutral-700'}`}>{l}</button>
        ))}
      </div>
      {mode !== 'document' && (<>
        <div className="grid gap-sm sm:grid-cols-4">
          <label className="text-xs text-neutral-600">Amount (£)<input className={input} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))} /></label>
          <label className="text-xs text-neutral-600">Date on it<input type="date" className={input} value={date} onChange={e => setDate(e.target.value)} /></label>
          <label className="text-xs text-neutral-600">Supplier<input className={input} value={supplier} onChange={e => setSupplier(e.target.value)} /></label>
          <label className="text-xs text-neutral-600">Invoice no.<input className={input} value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} /></label>
        </div>
        <label className="block text-xs text-neutral-600">What it was for<input className={input} value={description} onChange={e => setDescription(e.target.value)} placeholder={mode === 'landlord' ? 'e.g. Boiler repair, Room 3' : 'e.g. Zoom subscription, October'} /></label>
        {amountChanged && <p className="text-xs font-semibold text-amber-800">You changed the amount from {gbp(read.amount)} on the document — make sure that’s right.</p>}
        <label className="flex items-center gap-xs text-xs text-neutral-700"><input type="checkbox" checked={paid} onChange={e => setPaid(e.target.checked)} />Already paid {read?.direct_debit ? '(direct debit)' : '(by card or transfer)'}</label>
      </>)}
      {mode === 'landlord' && (
        !propertyId ? <p className="text-xs font-semibold text-amber-800">Choose the property above.</p> : (<>
          {!split && <fieldset className="space-y-xs">
            <legend className="text-xs font-semibold text-neutral-700">Which statement does it come off?</legend>
            {choices.map((c, i) => (
              <label key={c.month} className="flex items-center gap-xs text-sm"><input type="radio" checked={deductMonth === c.month} onChange={() => setDeductMonth(c.month)} />{c.label}<span className="text-xs text-neutral-500">{i === 0 ? '· the next one to be paid' : '· the one after'}</span></label>
            ))}
          </fieldset>}
          <label className="flex items-center gap-xs text-xs text-neutral-700"><input type="checkbox" checked={share} onChange={e => setShare(e.target.checked)} />Send the invoice to the landlord with the statement</label>
          <label className="flex items-center gap-xs text-xs text-neutral-700"><input type="checkbox" checked={split} onChange={e => setSplit(e.target.checked)} />This invoice covers several houses — split it</label>
          {split ? (
            <div className="space-y-xs rounded-lg border border-neutral-200 bg-white p-sm">
              {sharesShown.map((x, i) => (
                <div key={i} className="flex flex-wrap items-center gap-xs">
                  {i === 0 ? <span className="min-w-[180px] flex-1 text-sm font-semibold">{props.find(p => p.id === propertyId)?.name ?? 'The house above'}</span>
                    : <select className={`${input} min-w-[180px] flex-1`} value={x.propertyId} onChange={e => setShares(s => s.map((y, j) => j === i ? { ...y, propertyId: e.target.value } : y))} aria-label={`House ${i + 1}`}><option value="">Choose a house…</option>{props.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
                  <input className={`${input} w-28`} inputMode="decimal" value={x.amount} onChange={e => setShares(s => s.map((y, j) => j === i ? { ...y, amount: e.target.value.replace(/[^\d.]/g, '') } : y))} placeholder="£" aria-label={`Share for house ${i + 1}`} />
                  {shares.length > 2 && i > 0 && <button type="button" className="text-xs font-semibold text-red-700" onClick={() => setShares(s => s.filter((_, j) => j !== i))}>Remove</button>}
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-md text-xs">
                <button type="button" className="font-semibold text-blue-700" onClick={() => setShares(s => [...s.slice(0, -1), { ...s[s.length - 1], amount: sharesShown[s.length - 1].amount }, { propertyId: '', amount: '' }])}>+ Add a house</button>
                <span className={sharesTotal === Math.round(Number(amount) * 100) / 100 ? 'text-green-700' : 'text-red-700'}>Shares £{sharesTotal.toFixed(2)} of £{(Number(amount) || 0).toFixed(2)}</span>
                <span className="text-neutral-500">Each comes off that house’s next statement.</span>
              </div>
            </div>
          ) : (
            <label className="block text-xs text-neutral-600">Charge the landlord <span className="text-neutral-400">(leave blank to charge what it cost)</span>
              <input className={`${input} max-w-[160px]`} inputMode="decimal" value={charge} onChange={e => setCharge(e.target.value.replace(/[^\d.]/g, ''))} placeholder={amount} />
              {charge !== '' && Number(charge) > 0 && Number(charge) !== Number(amount) && <span className="block text-neutral-500">{Number(charge) > Number(amount) ? `Mark-up £${(Number(charge) - Number(amount)).toFixed(2)} — shown in Reports › Mark-ups` : 'Less than it cost'}</span>}
            </label>
          )}
        </>)
      )}
      {mode === 'company' && (
        <label className="block text-xs text-neutral-600">Category<select className={input} value={category} onChange={e => setCategory(e.target.value)}>{(data.categories ?? []).map((c: string) => <option key={c}>{c}</option>)}</select></label>
      )}
      {dups.length > 0 && mode !== 'document' && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-sm text-xs text-amber-900">
          <p className="font-semibold">Possibly already on record:</p>
          {dups.map((d, i) => <p key={i}>• {gbp(d.amount)} {d.description} — {d.where} ({d.reason})</p>)}
          <button type="button" className="mt-xs h-8 rounded-lg border border-amber-400 bg-white px-md font-semibold" disabled={busy || !ready} onClick={() => go(true)}>It’s a different cost — add it anyway</button>
        </div>
      )}
      {mode !== 'document' && (
        <div className="flex flex-wrap items-center gap-sm">
          <button type="button" className={btnDark} disabled={busy || !ready} onClick={() => go(false)}>{busy ? 'Filing…' : mode === 'landlord' ? `Add ${amount ? gbp(Number(amount)) : ''} to the property’s expenses` : `Add ${amount ? gbp(Number(amount)) : ''} as a company expense`}</button>
          {msg && <span className={`text-sm ${msg.startsWith('✅') ? 'text-green-700' : 'text-red-700'}`}>{msg}</span>}
        </div>
      )}
    </div>
  )
}

// ── company post and the company's own expenses ──────────────────────────
function CompanyTab({ data, reload }: { data: any; reload: () => Promise<void> }) {
  const rows: any[] = data.company ?? []
  const exp = rows.filter(c => c.amount && !c.voided_at)
  const total = exp.reduce((a, c) => a + Number(c.amount), 0)
  function csv() {
    const head = ['Number', 'Date', 'Supplier', 'What for', 'Category', 'Amount', 'Invoice no.', 'Paid on', 'Void']
    const lines = rows.filter(c => c.amount).map(c => [c.cex_no, c.expense_date, c.supplier, c.title, c.expense_category, Number(c.amount).toFixed(2), c.invoice_number, c.paid_on, c.voided_at ? `void: ${c.void_reason}` : ''].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' })); a.download = `company-expenses-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
  }
  async function voidIt(c: any) {
    const reason = prompt(`Void ${c.cex_no}? It stays on record, marked void. Why?`)
    if (!reason) return
    const r = await adminFetch('/api/admin/capture', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'void_company', docId: c.id, reason }) })
    if (!r.ok) alert((await r.json().catch(() => ({}))).error ?? 'Could not void it')
    reload()
  }
  return (
    <section className={card}>
      <div className="flex flex-wrap items-center justify-between gap-sm border-b border-neutral-100 px-lg py-sm">
        <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">Company expenses {exp.length ? `· ${exp.length} · £${total.toFixed(2)}` : ''} <span className="font-normal normal-case tracking-normal">(not VAT registered: amounts as paid)</span></h3>
        {exp.length > 0 && <button type="button" className={btn} onClick={csv}>Download CSV</button>}
      </div>
      {rows.length ? (
        <ul className="divide-y divide-neutral-100 text-sm">
          {rows.map((c: any) => (
            <li key={c.id} className={`flex items-baseline justify-between gap-sm px-lg py-sm ${c.voided_at ? 'opacity-50' : ''}`}>
              <span className="min-w-0">
                <span className="font-semibold text-neutral-900">{c.cex_no ? `${c.cex_no} · ` : ''}{c.title}</span>
                <span className="block text-xs text-neutral-500">{c.amount ? `£${Number(c.amount).toFixed(2)} · ${c.expense_category ?? ''}${c.supplier ? ` · ${c.supplier}` : ''} · dated ${c.expense_date ?? '—'}` : `${c.category} · received ${new Date(`${c.received_on}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`}{c.voided_at ? ` · VOID: ${c.void_reason}` : ''}{c.notes ? ` · ${c.notes}` : ''}</span>
              </span>
              <span className="flex shrink-0 gap-sm">
                {c.url && <a href={c.url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-blue-700 hover:underline">Open</a>}
                {c.cex_no && !c.voided_at && <button type="button" className="text-xs font-semibold text-red-700 hover:underline" onClick={() => voidIt(c)}>Void</button>}
              </span>
            </li>
          ))}
        </ul>
      ) : <p className="px-lg py-md text-sm text-neutral-500">Nothing yet. Company costs you file from the list (emailed or photographed) appear here with a CEX number, ready for your accountant.</p>}
    </section>
  )
}

// ── forwarding invoices from your mailbox ─────────────────────────────────
function EmailSetup({ data }: { data: any }) {
  const addr = data.inboxAddress ?? 'invoices@crisiionta.resend.app'
  return (
    <section className={`${card} p-lg space-y-md max-w-3xl`}>
      <div>
        <h2 className="text-lg font-bold text-neutral-900">Invoices by email</h2>
        <p className="mt-xs text-sm text-neutral-600">Forward your email to <code className="rounded bg-neutral-100 px-1">{addr}</code>. CROS keeps only invoices, bills and receipts, and drops everything else without saving it. Each one waits under “To file”, read and with a suggestion, until you file it.</p>
        <button type="button" className={`${btn} mt-xs`} onClick={() => navigator.clipboard.writeText(addr)}>Copy the address</button>
      </div>
      {data.gmail?.code && <p className="rounded-xl border border-amber-300 bg-amber-50 p-md text-sm text-amber-900">Gmail sent a confirmation code on {new Date(data.gmail.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}: <b className="font-mono text-base">{data.gmail.code}</b> — enter it in Gmail (step 3).</p>}
      <ol className="list-decimal space-y-xs pl-lg text-sm text-neutral-800">
        <li>In Gmail on a computer: <strong>Settings (cog) → See all settings → Forwarding and POP/IMAP</strong>.</li>
        <li><strong>Add a forwarding address</strong> → paste <code className="rounded bg-neutral-100 px-1">{addr}</code> → Next → Proceed.</li>
        <li>Gmail sends a code to that address — it appears in the yellow box on this page within a minute (refresh). Type it into Gmail and press <strong>Verify</strong>.</li>
        <li>Choose <strong>Forward a copy of incoming mail to</strong> {addr} and <strong>keep Gmail’s copy in the Inbox</strong> → Save changes. (Or, to send only some: create a filter and choose “Forward it to” this address.)</li>
        <li>Anything you forward by hand to the address works too.</li>
      </ol>
    </section>
  )
}

// ── the iPhone share-sheet shortcut ──────────────────────────────────────────

function IphoneSetup({ keys, reload }: { keys: any[]; reload: () => Promise<void> }) {
  const [key, setKey] = useState('')
  async function make() {
    const r = await adminFetch('/api/admin/capture', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'new_key', label: 'iPhone' }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { alert(d.error ?? 'Could not make a key'); return }
    setKey(d.key); reload()
  }
  return (
    <section className={`${card} p-lg space-y-md max-w-3xl`}>
      <div>
        <h2 className="text-lg font-bold text-neutral-900">“Send to CROS” in your iPhone’s share menu</h2>
        <p className="mt-xs text-sm text-neutral-600">Apple doesn’t let web apps appear in the share menu, so a two-minute Shortcut does it: share any photo, PDF or screenshot to “Send to CROS” and it lands here, ready to file. (Or just use “Choose photos or files” above.)</p>
      </div>
      <div className="rounded-xl bg-neutral-50 p-md">
        <p className="text-sm font-semibold text-neutral-900">1. Your personal key</p>
        {key ? (
          <>
            <p className="mt-xs text-xs text-amber-800">Copy it now — it’s shown only once. Anyone with it can add files to your inbox (never anything else).</p>
            <code className="mt-xs block break-all rounded bg-white p-sm font-mono text-xs">{key}</code>
            <button type="button" className={`${btn} mt-xs`} onClick={() => navigator.clipboard.writeText(key)}>Copy</button>
          </>
        ) : <button type="button" className={`${btnDark} mt-xs`} onClick={make}>Make a key</button>}
        {keys.length > 0 && <p className="mt-sm text-xs text-neutral-500">Keys in use: {keys.map(k => `${k.label ?? 'key'} (made ${new Date(k.created_at).toLocaleDateString('en-GB')}${k.last_used_at ? `, last used ${new Date(k.last_used_at).toLocaleDateString('en-GB')}` : ''})`).join(', ')}</p>}
      </div>
      <ol className="list-decimal space-y-xs pl-lg text-sm text-neutral-800">
        <li>Open the <strong>Shortcuts</strong> app → <strong>+</strong> → name it <strong>Send to CROS</strong>.</li>
        <li>Tap the <strong>ⓘ</strong> (details) → turn on <strong>Show in Share Sheet</strong>; for “Receive” choose <strong>Images, PDFs and Files</strong>.</li>
        <li>Add the action <strong>Convert Image</strong> → to <strong>JPEG</strong> (iPhone photos are HEIC, which CROS can’t read).</li>
        <li>Add <strong>Get Contents of URL</strong>. URL: <code className="rounded bg-neutral-100 px-1">{SITE}/api/capture/upload</code> · Method <strong>POST</strong> · Headers: <strong>Authorization</strong> = <code className="rounded bg-neutral-100 px-1">Bearer</code> + a space + your key · Request Body <strong>Form</strong>: add a <strong>File</strong> field called <strong>file</strong> = the converted image (Shortcut Input for PDFs).</li>
        <li>Optional: add <strong>Show Notification</strong> “Sent to CROS”.</li>
        <li>Try it: open a photo → Share → <strong>Send to CROS</strong>. It appears here under “To file”, and you get a notification.</li>
      </ol>
    </section>
  )
}
