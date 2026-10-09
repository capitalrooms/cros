'use client'

// The Operations account (migration 212): the business account's bank CSV, once a month. Every payment out is
// filed once — a house (the landlord pays it on their statement), split across houses, a company expense, or not an
// expense. CROS remembers where each payee and reference went, so next month the same bills come pre-filled and
// "File all learnt" does them in one go. Receipts can follow later; the Missing receipts list is for the accountant.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'
import ExportButtons from '@/app/components/ExportButtons'
import { adminFetch } from '@/lib/adminFetch'
import { createClient } from '@/lib/supabase'
import { financeTabs } from '@/lib/financeTabs'

interface Prop { id: string; name: string; code: string | null; letOnly: boolean }
interface Room { id: string; name: string; property_id: string }
interface Suggestion { confidence: 'learnt' | 'usually' | 'several'; as?: string; propertyId?: string | null; roomId?: string | null; splits?: { propertyId: string; roomId: string | null; share: number; description: string }[] | null; category?: string | null; description?: string | null; lastAmount?: number | null; times?: number; options?: any[] }
interface Line {
  id: string; line_date: string; amount: number; description: string; payee_key: string; status: 'new' | 'filing' | 'filed' | 'not_expense'
  filed_as: string | null; filed_refs: { kind: string; id: string; no: string | null; propertyId?: string; amount: number; cost?: number }[] | null
  receipt_path: string | null; receipt_name: string | null; no_receipt_needed: boolean; note: string | null; file_name: string | null; suggestion: Suggestion | null
}
type Tab = 'new' | 'filed' | 'not_expense' | 'receipts'

const gbp = (n: number) => `£${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const day = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const inp = 'rounded-lg border border-neutral-300 bg-white px-sm py-xs text-sm text-neutral-900'
const btn = 'rounded-lg border border-neutral-300 bg-white px-md py-xs text-sm font-semibold text-neutral-800 hover:bg-neutral-50 disabled:opacity-40'
const btnDark = 'rounded-lg bg-neutral-900 px-md py-xs text-sm font-bold text-white hover:bg-neutral-700 disabled:opacity-40'

export default function OpsAccountPage() {
  const [lines, setLines] = useState<Line[]>([])
  const [props, setProps] = useState<Prop[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [setup, setSetup] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('new')
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null)
  const [importing, setImporting] = useState(false)
  const [bulk, setBulk] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const r = await adminFetch('/api/admin/ops-account')
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setBanner({ ok: false, text: d.error ?? 'Could not load the account' }); setLoading(false); return }
    setLines(d.lines ?? []); setProps(d.properties ?? []); setRooms(d.rooms ?? []); setCategories(d.categories ?? []); setSetup(d.setupNeeded ?? null)
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const propName = useCallback((id?: string | null) => props.find(p => p.id === id)?.name ?? 'a house', [props])

  async function importCsv(file: File) {
    setImporting(true); setBanner(null)
    try {
      const csv = await file.text()
      const r = await adminFetch('/api/admin/ops-account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'import', csv, fileName: file.name }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error ?? 'Import failed')
      setBanner({ ok: true, text: `${d.added} new payment${d.added === 1 ? '' : 's'} out${d.already ? ` · ${d.already} already imported` : ''} · ${gbp(d.total)} in the file${d.period?.[0] ? ` (${day(d.period[0])} – ${day(d.period[1])})` : ''}.${d.warnings?.length ? ' ' + d.warnings.join(' ') : ''}` })
      setTab('new'); await load()
    } catch (e) { setBanner({ ok: false, text: e instanceof Error ? e.message : 'Import failed' }) }
    finally { setImporting(false); if (fileRef.current) fileRef.current.value = '' }
  }

  const post = useCallback(async (body: Record<string, unknown>) => {
    const r = await adminFetch('/api/admin/ops-account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return { ok: r.ok, d: await r.json().catch(() => ({})) }
  }, [])

  const learnt = lines.filter(l => l.status === 'new' && l.suggestion?.confidence === 'learnt' && l.suggestion.as !== 'split')
  async function fileAllLearnt() {
    if (!window.confirm(`File ${learnt.length} payment${learnt.length === 1 ? '' : 's'} the same way as last time?`)) return
    let done = 0; const problems: string[] = []
    for (const l of learnt) {
      setBulk(`Filing ${done + 1} of ${learnt.length}…`)
      const sg = l.suggestion!
      const { ok, d } = await post({ action: 'file', id: l.id, as: sg.as, propertyId: sg.propertyId, roomId: sg.roomId, category: sg.category, description: sg.description || l.payee_key })
      if (ok) done++; else problems.push(`${l.description}: ${d.duplicates ? 'looks like a duplicate — file it by hand' : d.error}`)
    }
    setBulk(null)
    setBanner({ ok: !problems.length, text: `Filed ${done} of ${learnt.length}.${problems.length ? ' Not filed: ' + problems.join(' · ') : ''}` })
    await load()
  }

  const counts = useMemo(() => ({
    new: lines.filter(l => l.status === 'new' || l.status === 'filing').length,
    filed: lines.filter(l => l.status === 'filed').length,
    not_expense: lines.filter(l => l.status === 'not_expense').length,
    receipts: lines.filter(l => l.status === 'filed' && !l.receipt_path && !l.no_receipt_needed).length,
  }), [lines])
  const shown = lines.filter(l => tab === 'new' ? (l.status === 'new' || l.status === 'filing') : tab === 'receipts' ? (l.status === 'filed' && !l.receipt_path && !l.no_receipt_needed) : l.status === tab)
  const exportRows = shown.map(l => ({
    date: l.line_date, description: l.description, amount: l.amount,
    filed: l.status === 'filed' ? (l.filed_refs ?? []).map(r => `${r.no ?? ''}${r.propertyId ? ` ${propName(r.propertyId)}` : ''}`).join('; ') : l.status === 'not_expense' ? 'Not an expense' : 'To file',
    receipt: l.receipt_path ? 'Attached' : l.no_receipt_needed ? 'Not needed' : 'Missing',
  }))

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin/expense-log" />} title="Operations account" />
      <PageHero title="Operations account" subtitle="Payments out of the business account, from the month’s bank CSV. File each once: a house, a split, a company expense, or not an expense — CROS remembers for next month." tabs={financeTabs('expenses')} />
      <div className="mx-auto max-w-6xl px-lg py-xl space-y-lg">
        {setup && <p className="rounded-xl border border-amber-200 bg-amber-50 px-lg py-sm text-sm font-semibold text-amber-900">{setup}</p>}
        {banner && <p className={`rounded-xl border px-lg py-sm text-sm font-semibold ${banner.ok ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800'}`}>{banner.text}</p>}

        <section className="rounded-2xl border border-neutral-200 bg-white p-lg flex flex-wrap items-center justify-between gap-md">
          <div>
            <h2 className="text-lg font-bold text-neutral-900">Import the month’s CSV</h2>
            <p className="text-sm text-neutral-600">Download the Operations account statement from the bank as CSV. Only money going out is read; importing the same file twice adds nothing.</p>
          </div>
          <label className={`${btnDark} cursor-pointer ${importing || !!setup ? 'pointer-events-none opacity-40' : ''}`}>
            {importing ? 'Reading…' : 'Choose CSV'}
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) importCsv(f) }} />
          </label>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-sm">
          <div className="flex flex-wrap gap-xs" role="tablist">
            {([['new', 'To file'], ['filed', 'Filed'], ['receipts', 'Missing receipts'], ['not_expense', 'Not expenses']] as [Tab, string][]).map(([k, label]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-full px-md py-xs text-sm font-semibold ${tab === k ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-700 border border-neutral-300'}`}>{label} ({counts[k]})</button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-sm">
            {tab === 'new' && learnt.length > 0 && <button className={btnDark} disabled={!!bulk} onClick={fileAllLearnt}>{bulk ?? `File all ${learnt.length} learnt`}</button>}
            <ExportButtons title={`Operations account — ${tab === 'receipts' ? 'missing receipts' : tab === 'new' ? 'to file' : tab === 'filed' ? 'filed' : 'not expenses'}`} filename={`operations-${tab}`}
              columns={[{ key: 'date', label: 'Date' }, { key: 'description', label: 'Bank description' }, { key: 'amount', label: 'Amount', money: true, align: 'right' }, { key: 'filed', label: 'Filed as' }, { key: 'receipt', label: 'Receipt' }]}
              rows={exportRows} totals={{ description: 'Total', amount: r2(shown.reduce((n, l) => n + Number(l.amount), 0)) }} />
          </div>
        </div>

        {loading ? <p className="text-sm text-neutral-500">Loading…</p> : shown.length === 0 ? (
          <p className="rounded-2xl border border-neutral-200 bg-white px-lg py-xl text-sm text-neutral-500">{tab === 'new' ? 'Nothing to file. Import the next CSV when the month ends.' : tab === 'receipts' ? 'Every filed payment has its receipt.' : 'Nothing here yet.'}</p>
        ) : (
          <ul className="space-y-sm">
            {shown.map(l => <LineRow key={l.id} line={l} props={props} rooms={rooms} categories={categories} propName={propName} post={post} reload={load} />)}
          </ul>
        )}
      </div>
    </div>
  )
}

function LineRow({ line, props, rooms, categories, propName, post, reload }: {
  line: Line; props: Prop[]; rooms: Room[]; categories: string[]; propName: (id?: string | null) => string
  post: (b: Record<string, unknown>) => Promise<{ ok: boolean; d: any }>; reload: () => Promise<void>
}) {
  const sg = line.suggestion
  const pre = sg && sg.confidence !== 'several' ? sg : null
  const [open, setOpen] = useState(false)
  const [as, setAs] = useState<string>(pre?.as ?? 'landlord')
  const [propertyId, setPropertyId] = useState(pre?.propertyId ?? '')
  const [roomId, setRoomId] = useState(pre?.roomId ?? '')
  const [description, setDescription] = useState(pre?.description ?? '')
  const [charge, setCharge] = useState('')
  const [category, setCategory] = useState(pre?.category ?? 'Other')
  const [note, setNote] = useState('')
  const [splits, setSplits] = useState<{ propertyId: string; amount: string; charge: string }[]>(() =>
    pre?.splits?.length ? pre.splits.map((x, i, all) => ({ propertyId: x.propertyId, amount: i === all.length - 1 ? '' : String(r2(line.amount * x.share)), charge: '' })) : [{ propertyId: '', amount: '', charge: '' }, { propertyId: '', amount: '', charge: '' }])
  const [remember, setRemember] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [dups, setDups] = useState<any[] | null>(null)
  const [msg, setMsg] = useState('')

  // the last share takes whatever is left, so a split always adds up
  const splitShown = splits.map((x, i) => i === splits.length - 1 && x.amount === '' ? { ...x, amount: String(r2(line.amount - splits.slice(0, -1).reduce((n, y) => n + (Number(y.amount) || 0), 0))) } : x)
  const splitTotal = r2(splitShown.reduce((n, x) => n + (Number(x.amount) || 0), 0))
  const markUp = as === 'landlord' && charge !== '' && Number(charge) > 0 ? r2(Number(charge) - line.amount) : 0

  async function file(confirmDuplicate = false) {
    setBusy(true); setErr(''); setMsg('')
    const body: Record<string, unknown> = { action: 'file', id: line.id, as, description, remember, confirmDuplicate }
    if (as === 'landlord') Object.assign(body, { propertyId, roomId: roomId || null, charge: charge === '' ? null : Number(charge) })
    if (as === 'split') body.splits = splitShown.map(x => ({ propertyId: x.propertyId, amount: Number(x.amount), charge: x.charge === '' ? null : Number(x.charge) }))
    if (as === 'company') body.category = category
    if (as === 'not_expense') body.note = note
    const { ok, d } = await post(body)
    setBusy(false)
    if (d.duplicates) { setDups(d.duplicates); return }
    if (!ok) { setErr(d.error ?? 'Could not file it'); return }
    setMsg(d.filedTo ?? 'Filed'); setDups(null)
    setTimeout(reload, 700)
  }

  async function attach(f: File) {
    setBusy(true); setErr('')
    const { ok, d } = await post({ action: 'receipt_url', id: line.id, fileName: f.name })
    if (!ok) { setBusy(false); setErr(d.error ?? 'Could not prepare the upload'); return }
    const { error } = await createClient().storage.from(d.bucket).uploadToSignedUrl(d.path, d.token, f, { contentType: f.type || undefined })
    if (error) { setBusy(false); setErr(error.message); return }
    const done = await post({ action: 'receipt_done', id: line.id, path: d.path, fileName: f.name })
    setBusy(false)
    if (!done.ok) setErr(done.d.error ?? 'Could not attach it'); else reload()
  }

  const roomsHere = rooms.filter(r => r.property_id === propertyId)
  return (
    <li className="rounded-2xl border border-neutral-200 bg-white">
      <div className="flex flex-wrap items-center gap-md px-lg py-md">
        <span className="w-24 shrink-0 text-xs font-semibold text-neutral-500">{day(line.line_date)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-sm text-neutral-900">{line.description}</span>
          {line.status === 'new' && sg && (
            <span className={`mt-xs inline-block rounded-full px-sm py-0.5 text-xs font-semibold ${sg.confidence === 'learnt' ? 'bg-green-50 text-green-800' : 'bg-blue-50 text-blue-800'}`}>
              {sg.confidence === 'learnt' ? 'Learnt' : sg.confidence === 'usually' ? 'Usually' : 'Seen before'}: {sg.confidence === 'several' ? `${sg.options?.length} different places` : sg.as === 'landlord' ? `${propName(sg.propertyId)} — ${sg.description ?? ''}` : sg.as === 'split' ? `split across ${sg.splits?.length} houses` : sg.as === 'company' ? `company · ${sg.category}` : 'not an expense'}{sg.lastAmount != null && Number(sg.lastAmount) !== Number(line.amount) ? ` (last time ${gbp(Number(sg.lastAmount))})` : ''}
            </span>
          )}
          {line.status === 'filed' && (
            <span className="mt-xs block text-xs text-neutral-600">{line.filed_as === 'company' ? 'Company expense' : 'Landlord expense'}: {(line.filed_refs ?? []).map(r => `${r.no ?? ''}${r.propertyId ? ` · ${propName(r.propertyId)}` : ''} ${gbp(r.amount)}${r.cost != null && r.cost !== r.amount ? ` (cost ${gbp(r.cost)})` : ''}`).join(' · ')}{line.note ? ` — ${line.note}` : ''}</span>
          )}
          {line.status === 'not_expense' && <span className="mt-xs block text-xs text-neutral-500">Not an expense{line.note ? ` — ${line.note}` : ''}</span>}
        </span>
        <span className="shrink-0 text-right text-base font-bold tabular-nums text-neutral-900">{gbp(line.amount)}</span>
        {line.status === 'new' && <button className={open ? btn : btnDark} onClick={() => setOpen(o => !o)}>{open ? 'Close' : 'File'}</button>}
        {line.status === 'not_expense' && <button className={btn} onClick={async () => { await post({ action: 'undo', id: line.id }); reload() }}>Put back</button>}
        {line.status === 'filed' && (line.receipt_path
          ? <span className="text-xs font-semibold text-green-700">Receipt attached</span>
          : <span className="flex items-center gap-sm">
              <label className={`${btn} cursor-pointer`}>{busy ? 'Uploading…' : 'Attach receipt'}<input type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) attach(f) }} /></label>
              <label className="flex items-center gap-xs text-xs text-neutral-600"><input type="checkbox" checked={line.no_receipt_needed} onChange={async e => { await post({ action: 'no_receipt', id: line.id, value: e.target.checked }); reload() }} />Not needed</label>
            </span>)}
      </div>

      {open && line.status === 'new' && (
        <div className="border-t border-neutral-100 px-lg py-md space-y-md">
          <div className="flex flex-wrap gap-xs">
            {([['landlord', 'A house'], ['split', 'Split across houses'], ['company', 'Company expense'], ['not_expense', 'Not an expense']] as [string, string][]).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setAs(k)} className={`rounded-full px-md py-xs text-sm font-semibold ${as === k ? 'bg-neutral-900 text-white' : 'border border-neutral-300 bg-white text-neutral-700'}`}>{label}</button>
            ))}
          </div>

          {as !== 'not_expense' && (
            <label className="block text-xs font-semibold text-neutral-600">What it was for
              <input className={`${inp} mt-xs w-full`} value={description} onChange={e => setDescription(e.target.value)} placeholder={as === 'company' ? 'e.g. Laptop for the office' : 'e.g. Broadband, October'} />
            </label>
          )}

          {as === 'landlord' && (
            <div className="grid gap-sm md:grid-cols-3">
              <label className="text-xs font-semibold text-neutral-600">House
                <select className={`${inp} mt-xs w-full`} value={propertyId} onChange={e => { setPropertyId(e.target.value); setRoomId('') }}>
                  <option value="">Choose…</option>{props.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-neutral-600">Room (optional)
                <select className={`${inp} mt-xs w-full`} value={roomId} onChange={e => setRoomId(e.target.value)} disabled={!roomsHere.length}>
                  <option value="">Whole house</option>{roomsHere.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-neutral-600">Charge the landlord
                <input className={`${inp} mt-xs w-full`} inputMode="decimal" value={charge} onChange={e => setCharge(e.target.value)} placeholder={line.amount.toFixed(2)} />
                <span className="mt-xs block font-normal text-neutral-500">{markUp > 0 ? `Cost ${gbp(line.amount)} · mark-up ${gbp(markUp)} (goods resold)` : markUp < 0 ? `Less than it cost — ${gbp(-markUp)} we absorb` : 'Leave blank to charge what it cost'}</span>
              </label>
            </div>
          )}

          {as === 'split' && (
            <div className="space-y-xs">
              {splitShown.map((x, i) => (
                <div key={i} className="flex flex-wrap items-center gap-sm">
                  <select className={`${inp} min-w-[200px] flex-1`} value={x.propertyId} onChange={e => setSplits(s => s.map((y, j) => j === i ? { ...y, propertyId: e.target.value } : y))} aria-label={`House ${i + 1}`}>
                    <option value="">Choose a house…</option>{props.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <input className={`${inp} w-28`} inputMode="decimal" value={x.amount} onChange={e => setSplits(s => s.map((y, j) => j === i ? { ...y, amount: e.target.value } : y))} placeholder="Share £" aria-label={`Share for house ${i + 1}`} />
                  <input className={`${inp} w-32`} inputMode="decimal" value={x.charge} onChange={e => setSplits(s => s.map((y, j) => j === i ? { ...y, charge: e.target.value } : y))} placeholder="Charge (optional)" aria-label={`Charge for house ${i + 1}`} />
                  {splits.length > 2 && <button type="button" className="text-xs font-semibold text-red-700" onClick={() => setSplits(s => s.filter((_, j) => j !== i))}>Remove</button>}
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-md text-xs">
                <button type="button" className="font-semibold text-blue-700" onClick={() => setSplits(s => [...s.slice(0, -1).map((y, j) => j === s.length - 2 ? y : y), { ...splitShown[s.length - 1] }, { propertyId: '', amount: '', charge: '' }])}>+ Add a house</button>
                <span className={splitTotal === r2(line.amount) ? 'text-green-700' : 'text-red-700'}>Shares {gbp(splitTotal)} of {gbp(line.amount)}</span>
                <span className="text-neutral-500">The last house takes whatever is left.</span>
              </div>
            </div>
          )}

          {as === 'company' && (
            <label className="block text-xs font-semibold text-neutral-600">Category
              <select className={`${inp} mt-xs w-full md:w-80`} value={category} onChange={e => setCategory(e.target.value)}>{categories.map(c => <option key={c}>{c}</option>)}</select>
            </label>
          )}

          {as === 'not_expense' && (
            <label className="block text-xs font-semibold text-neutral-600">Why (optional)
              <input className={`${inp} mt-xs w-full`} value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Transfer to the client account" />
            </label>
          )}

          {dups && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-md py-sm text-sm text-amber-900">
              <p className="font-semibold">This looks like something already on record:</p>
              <ul className="mt-xs list-disc pl-lg">{dups.map((d, i) => <li key={i}>{d.description} · {gbp(d.amount)} · {d.date} — {d.reason} ({d.where})</li>)}</ul>
              <button className={`${btn} mt-sm`} disabled={busy} onClick={() => file(true)}>It’s not the same — file it</button>
            </div>
          )}
          {err && <p className="text-sm font-semibold text-red-700">{err}</p>}
          {msg && <p className="text-sm font-semibold text-green-700">{msg}</p>}

          <div className="flex flex-wrap items-center gap-md">
            <button className={btnDark} disabled={busy} onClick={() => file(false)}>{busy ? 'Filing…' : 'File it'}</button>
            <label className="flex items-center gap-xs text-xs text-neutral-600"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />Remember for next month</label>
          </div>
        </div>
      )}
    </li>
  )
}
