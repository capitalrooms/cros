'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import { financeTabs } from '@/lib/financeTabs'
import BackButton from '@/app/components/BackButton'
import { sortPropertiesNumerically } from '@/lib/sortProperties'
import { genStatementRef } from '@/lib/references'
import { adminFetch, downloadPdf } from '@/lib/adminFetch'
import StatementSend from './StatementSend'
interface Property { id: string; name: string; address: string; management_fee_pct: number | null; property_code?: string | null; letting_type?: string | null }
interface Landlord { id: string; name: string | null; email: string; property_id: string | null }
interface StatementRow {
  id: string
  statement_reference: string
  statement_date: string
  period_start: string | null
  period_end: string | null
  gross_rent: number | null
  management_fees: number | null
  property_charges: number | null
  net_to_landlord: number
  amount_paid: number | null
  paid_date: string | null
  management_fee_pct: number | null
  rooms: any[] | null
  expenses: any[] | null
  property_id: string
  landlord_id: string
  properties?: { name: string; address: string }
  sent_at?: string | null
}

interface RoomLine { room_number: string; tenant_name: string; rent: string; fee: string; net: string; note?: string }
interface ExpenseLine { description: string; amount: string }

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const num = (v: string) => (v === '' || v == null ? 0 : parseFloat(v) || 0)

function blankRoom(n: number): RoomLine { return { room_number: String(n), tenant_name: '', rent: '', fee: '', net: '' } }
function blankExpense(): ExpenseLine { return { description: '', amount: '' } }

// ---- address matching (for PDF auto-match) ----
function norm(s: string) { return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() }
const STOP = new Set(['flat', 'the', 'london', 'uk', 'england', 'greater', 'road', 'rd', 'street', 'st', 'avenue', 'ave', 'lane', 'ln', 'close', 'court', 'ct', 'drive', 'dr', 'way', 'house', 'apartment', 'apt'])
function postcode(s: string) { const m = (s || '').toUpperCase().match(/([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})/); return m ? m[1] + m[2] : '' }
function houseNo(s: string) { const m = (s || '').match(/\b(\d{1,4})[a-z]?\b/); return m ? m[1] : '' }
function distinctTokens(s: string) { return norm(s).split(' ').filter((t) => t && !STOP.has(t)) }
function matchProperty(address: string, properties: Property[]): Property | null {
  const a = norm(address); if (!a) return null
  const apc = postcode(address), ahn = houseNo(address), at = new Set(distinctTokens(address))
  let best: Property | null = null, bestScore = 0
  for (const p of properties) {
    let score = 0
    if (norm(p.address) === a) score += 10
    const ppc = postcode(p.address); if (apc && ppc && apc === ppc) score += 5
    if (ahn && houseNo(p.address) === ahn) score += 2
    for (const t of distinctTokens(p.address)) if (at.has(t)) score++
    if (score > bestScore) { bestScore = score; best = p }
  }
  return bestScore >= 3 ? best : null
}

export default function AdminStatementsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [properties, setProperties] = useState<Property[]>([])
  const [landlords, setLandlords] = useState<Landlord[]>([])
  const [statements, setStatements] = useState<StatementRow[]>([])

  // header
  const [propertyId, setPropertyId] = useState('')
  const [landlordId, setLandlordId] = useState('')
  const [reference, setReference] = useState('')
  const [statementDate, setStatementDate] = useState('')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [paidDate, setPaidDate] = useState('')
  const [feePct, setFeePct] = useState('12')
  // lines
  const [expenses, setExpenses] = useState<ExpenseLine[]>([blankExpense()])
  const [rooms, setRooms] = useState<RoomLine[]>([blankRoom(1)])

  const [busy, setBusy] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [matchNote, setMatchNote] = useState('')
  const [expandedStatementId, setExpandedStatementId] = useState<string | null>(null)
  const [demoIds, setDemoIds] = useState<Set<string>>(new Set())
  // "Fill from rent received": the month to build, and what saving it must mark as paid over
  const [genMonth, setGenMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [genBusy, setGenBusy] = useState(false)
  const [annualLandlord, setAnnualLandlord] = useState('')
  const [annualYear, setAnnualYear] = useState(() => { const n = new Date(); return n.getMonth() > 3 || (n.getMonth() === 3 && n.getDate() >= 6) ? n.getFullYear() : n.getFullYear() - 1 })
  const [generated, setGenerated] = useState<{ charges: { id: string; amount: number }[]; expenseIds: string[] } | null>(null)

  async function loadStatements() {
    const supabase = createClient()
    const cols = 'id, statement_reference, statement_date, period_start, period_end, gross_rent, management_fees, property_charges, net_to_landlord, amount_paid, paid_date, management_fee_pct, rooms, expenses, property_id, landlord_id, properties(name, address)'
    let { data, error: e } = await supabase.from('landlord_statements').select(cols + ', sent_at').order('statement_date', { ascending: false })
    if (e) ({ data, error: e } = await supabase.from('landlord_statements').select(cols).order('statement_date', { ascending: false }))  // before migration 185
    if (e) setError(`Could not load statements: ${e.message}`)
    // practice statements (XLS…, demo houses) live in practice mode, not in the real list
    setStatements(((data as any) || []).filter((st: any) => !/^XLS/.test(st.statement_reference || '')))
  }

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      const role = data?.assignment?.role
      if (!data || (role !== 'administrator' && role !== 'admin')) { router.push('/login'); return }
      const supabase = createClient()
      const [{ data: props }, { data: lls }] = await Promise.all([
        supabase.from('properties').select('id, name, address, management_fee_pct, property_code, letting_type').order('name'),
        supabase.from('people').select('id, full_name, first_name, last_name, email, property_id').eq('role', 'landlord').order('full_name'),
      ])
      setProperties(sortPropertiesNumerically((props as any) || []))
      // practice (demo) houses stay out of the month grid; before migration 186 there's no column, so none are demo
      const { data: demo, error: demoErr } = await supabase.from('properties').select('id').eq('is_demo', true)
      if (!demoErr) setDemoIds(new Set(((demo as any[]) || []).map((d) => d.id)))
      // people has no "name" column — build the label the dropdowns show
      setLandlords(((lls as any[]) || []).map((l) => ({ ...l, name: [l.first_name, l.last_name].filter(Boolean).join(' ') || l.full_name || null })))
      await loadStatements()
      setLoading(false)
    }
    init()
  }, [router])

  function resolveLandlord(pid: string): string {
    const fromStatement = statements.find((s) => s.property_id === pid)
    if (fromStatement) return fromStatement.landlord_id
    const fromPeople = landlords.find((l) => l.property_id === pid)
    return fromPeople?.id || ''
  }

  function onSelectProperty(pid: string) {
    if (pid !== propertyId) setGenerated(null)
    setPropertyId(pid)
    setLandlordId(resolveLandlord(pid) || landlordId)
    const p = properties.find((x) => x.id === pid)
    const pct = p?.management_fee_pct != null ? String(p.management_fee_pct) : ''   // no fee is ever assumed
    setFeePct(pct)
    setRooms((rs) => rs.map((r) => applyFee(r, pct)))
  }

  // recompute a room's fee (from rent × pct) and net
  function applyFee(r: RoomLine, pct: string): RoomLine {
    const rent = num(r.rent)
    const fee = round2(rent * (num(pct) / 100))
    return { ...r, fee: r.rent === '' ? '' : String(fee), net: r.rent === '' ? '' : String(round2(rent - fee)) }
  }

  function updateRoom(i: number, patch: Partial<RoomLine>) {
    setRooms((rs) => rs.map((r, idx) => {
      if (idx !== i) return r
      let next = { ...r, ...patch }
      if ('rent' in patch) next = applyFee(next, feePct)          // rent drives fee + net
      else if ('fee' in patch) next = { ...next, net: String(round2(num(next.rent) - num(next.fee))) } // manual fee → net
      return next
    }))
  }

  function onFeePctChange(v: string) {
    setFeePct(v)
    setRooms((rs) => rs.map((r) => applyFee(r, v)))
  }

  const totals = useMemo(() => {
    const gross = round2(rooms.reduce((n, r) => n + num(r.rent), 0))
    const mgmt = round2(rooms.reduce((n, r) => n + num(r.fee), 0))
    const exp = round2(expenses.reduce((n, e) => n + num(e.amount), 0))
    const net = round2(gross - mgmt - exp)
    return { gross, mgmt, exp, net }
  }, [rooms, expenses])

  async function handleFile(file: File | undefined) {
    if (!file) return
    setAiBusy(true); setError(''); setNotice(''); setMatchNote(''); setGenerated(null)
    try {
      const body = new FormData(); body.append('file', file)
      const res = await fetch('/api/ai/extract-statement', { method: 'POST', body })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Could not read the statement')
      const r = json.result
      const matched = matchProperty(r.property_address || '', properties)
      const pid = matched?.id || ''
      if (pid) onSelectProperty(pid)
      const pct = r.management_fee_pct ? String(r.management_fee_pct) : (matched?.management_fee_pct != null ? String(matched.management_fee_pct) : '')
      setReference(r.statement_reference || '')
      setStatementDate(r.statement_date || '')
      setPeriodStart(r.period_start || '')
      setPeriodEnd(r.period_end || '')
      setPaidDate(r.paid_date || '')
      setFeePct(pct)
      const rms: RoomLine[] = (r.rooms || []).map((rm: any, idx: number) => applyFee({
        room_number: String(rm.room_number || idx + 1),
        tenant_name: rm.tenant_name || '',
        rent: rm.rent_income ? String(rm.rent_income) : '',
        fee: rm.management_fee ? String(rm.management_fee) : '',
        net: '',
      }, pct))
      setRooms(rms.length ? rms : [blankRoom(1)])
      const exs: ExpenseLine[] = (r.expenses || []).map((e: any) => ({ description: e.description || '', amount: e.amount ? String(e.amount) : '' }))
      setExpenses(exs.length ? exs : [blankExpense()])
      setMatchNote(matched
        ? `Matched to “${matched.name || matched.address}”. Check the rooms and expenses below, then save.`
        : `Read the statement for “${r.property_address || 'unknown address'}” — couldn't auto-match a property, pick one above.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong reading the file')
    } finally { setAiBusy(false) }
  }

  async function fillFromRent() {
    if (!propertyId) return setError('Choose the property first, then the month.')
    setGenBusy(true); setError(''); setNotice(''); setMatchNote('')
    try {
      const res = await adminFetch(`/api/admin/statements/draft?propertyId=${propertyId}&month=${genMonth}`)
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Could not build the statement')
      const dr = d.draft
      if (dr.landlordId) setLandlordId(dr.landlordId)
      setReference(dr.reference); setPeriodStart(dr.periodStart); setPeriodEnd(dr.periodEnd); setStatementDate(dr.statementDate)
      setFeePct(String(dr.feePct))
      setRooms(dr.rooms.length
        ? dr.rooms.map((r: any) => ({ room_number: r.room_number, tenant_name: r.tenant_name, rent: String(r.rent), fee: String(r.fee), net: String(round2(r.rent - r.fee)), note: r.note }))
        : [blankRoom(1)])
      setExpenses(dr.expenses.length ? dr.expenses.map((x: any) => ({ description: x.description, amount: String(x.amount) })) : [blankExpense()])
      setGenerated({ charges: dr.charges, expenseIds: dr.expenses.map((x: any) => x.id) })
      const notes: string[] = [
        dr.rooms.length
          ? `Filled from ${dr.rooms.length} room${dr.rooms.length === 1 ? '' : 's'} of rent received${dr.expenses.length ? ` and ${dr.expenses.length} logged expense${dr.expenses.length === 1 ? '' : 's'}` : ''}. Check it, then save.`
          : 'No rent has been received for this property yet this month — nothing to put on a statement.',
      ]
      if (dr.unpaid.length) notes.push(`Not yet received: ${dr.unpaid.map((u: any) => `${u.room}${u.tenant ? ` (${u.tenant})` : ''} £${(u.due - u.received).toFixed(2)}`).join(', ')}. It will go on the statement for the month it's paid.`)
      if (dr.existingId) notes.push(`A ${dr.reference} statement already exists for this property — saving updates it.`)
      if (!dr.tracksRemitted) notes.push('Run migration 185 so late payments carry onto the next statement automatically.')
      if (dr.feeWarnings?.length) notes.push(`⚠ ${dr.feeWarnings.join('; ')}.`)
      setMatchNote(notes.join(' '))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not build the statement')
    } finally { setGenBusy(false) }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setNotice('')
    if (!propertyId) return setError('Choose which property this statement is for.')
    if (!landlordId) return setError('Choose the landlord this statement belongs to.')
    if (!reference.trim()) return setError('Enter the statement reference.')
    if (!periodStart || !periodEnd) return setError('Enter the period this statement covers.')
    const filledRooms = rooms.filter((r) => r.rent !== '' || r.tenant_name.trim() !== '')
    if (filledRooms.length === 0) return setError('Add at least one room with its rent.')

    setBusy(true)
    const generatedAtSave = generated
    try {
      const supabase = createClient()
      const dt = (v: string) => (v ? v : null)
      const roomsJson = filledRooms.map((r) => ({
        room_number: r.room_number ? parseInt(r.room_number, 10) : null,
        tenant_name: r.tenant_name.trim() || null,
        rent_income: num(r.rent),
        management_fee: num(r.fee),
        net_to_landlord: num(r.net),
        ...(r.note ? { note: r.note } : {}),
      }))
      const expensesJson = expenses
        .filter((x) => x.description.trim() !== '' || x.amount !== '')
        .map((x) => ({ description: x.description.trim() || 'Expense', amount: num(x.amount) }))
      // Core totals always save (these columns exist). The breakdown columns
      // (management_fee_pct / rooms / expenses) are added by migration 044 — until
      // that's run we fall back to totals-only so the statement still saves.
      const prop = properties.find((p) => p.id === propertyId)
      const stmtRef = prop?.property_code
        ? genStatementRef(prop.property_code, new Date(periodEnd))
        : null
      const core = {
        landlord_id: landlordId,
        property_id: propertyId,
        statement_reference: reference.trim(),
        statement_date: dt(statementDate) || dt(periodEnd),
        period_start: periodStart,
        period_end: periodEnd,
        gross_rent: totals.gross,
        management_fees: totals.mgmt,
        property_charges: totals.exp,
        net_to_landlord: totals.net,
        amount_paid: totals.net,
        paid_date: dt(paidDate),
        ...(stmtRef ? { reference: stmtRef } : {}),
      }
      const full = { ...core, management_fee_pct: num(feePct), rooms: roomsJson, expenses: expensesJson }

      let breakdownSaved = true
      let { error: upErr } = await supabase
        .from('landlord_statements')
        .upsert(full, { onConflict: 'landlord_id,property_id,statement_reference' })
      if (upErr && /column|schema cache|does not exist/i.test(upErr.message)) {
        breakdownSaved = false
        ;({ error: upErr } = await supabase
          .from('landlord_statements')
          .upsert(core, { onConflict: 'landlord_id,property_id,statement_reference' }))
      }
      if (upErr) throw upErr

      // (Saving a statement no longer changes the property's management fee — that's set on the property/tenancy.)

      // Fire-and-forget: AI-categorise expense lines into statement_line_items.
      // Fetch the statement ID we just upserted, then POST to the categorise endpoint.
      supabase
        .from('landlord_statements')
        .select('id')
        .eq('landlord_id', landlordId)
        .eq('property_id', propertyId)
        .eq('statement_reference', reference.trim())
        .single()
        .then(async ({ data: s }) => {
          if (!s?.id) return
          fetch(`/api/admin/statements/${s.id}/categorise`, { method: 'POST' }).catch(() => {})
          // Generated from rent received: record what's now been paid over so it isn't counted twice.
          if (generatedAtSave) {
            const r = await adminFetch(`/api/admin/statements/${s.id}/finalise`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(generatedAtSave),
            })
            const d = await r.json().catch(() => ({}))
            if (!r.ok || d.warning) setError(d.warning || d.error || 'Saved, but could not mark the rent as paid over.')
          }
        })

      const where = prop?.name || prop?.address || 'the property'
      setNotice(breakdownSaved
        ? `Saved ${core.statement_reference} for ${where} — ${roomsJson.length} room${roomsJson.length === 1 ? '' : 's'}, net £${totals.net.toFixed(2)}. It now shows on that landlord's page.`
        : `Saved ${core.statement_reference} for ${where} — totals only (net £${totals.net.toFixed(2)}). Run migration 044 to also store the room-by-room breakdown.`)
      resetForm()
      await loadStatements()
    } catch (err: any) {
      const msg = err?.message || 'Could not save the statement'
      setError(/row-level security|policy|does not exist|column|schema cache/i.test(msg)
        ? `Save blocked: ${msg}. The 4-line migration (044) needs running in the SQL editor first.`
        : msg)
    } finally { setBusy(false) }
  }

  function resetForm() {
    setPropertyId(''); setLandlordId(''); setReference(''); setStatementDate('')
    setPeriodStart(''); setPeriodEnd(''); setPaidDate(''); setFeePct('12')
    setExpenses([blankExpense()]); setRooms([blankRoom(1)]); setMatchNote(''); setGenerated(null)
  }

  const grouped = useMemo(() => {
    const map = new Map<string, StatementRow[]>()
    for (const s of statements) { if (!map.has(s.property_id)) map.set(s.property_id, []); map.get(s.property_id)!.push(s) }
    return Array.from(map.entries())
  }, [statements])

  // Statements on file, house by month — so a missing month shows as a gap rather than having to be noticed
  const coverage = useMemo(() => {
    const monthOf = (st: StatementRow) => String(st.period_start || st.statement_date || '').slice(0, 7)
    const have = statements.map(monthOf).filter(Boolean).sort()
    if (!have.length) return null
    const months: string[] = []
    const now = new Date().toISOString().slice(0, 7)
    for (let [y, m] = have[0].split('-').map(Number); `${y}-${String(m).padStart(2, '0')}` <= now && months.length < 18; m === 12 ? (y++, m = 1) : m++) months.push(`${y}-${String(m).padStart(2, '0')}`)
    const houses = properties.filter((p) => !demoIds.has(p.id) && p.letting_type !== 'let_only')
    const cell = (pid: string, month: string) => statements.filter((st) => st.property_id === pid && monthOf(st) === month)
    return { months, houses, cell }
  }, [statements, properties, demoIds])

  if (loading) {
    return <div className="min-h-screen bg-neutral-100"><AppBar left={<BackButton href="/admin/accounts" />} /><p className="p-xl text-sm text-neutral-400">Loading…</p></div>
  }

  const field = 'mt-xs w-full rounded-xl border border-neutral-300 bg-white px-md py-sm text-sm text-neutral-900 focus:border-neutral-900 focus:outline-none'
  const cell = 'w-full rounded-lg border border-neutral-300 bg-white px-sm py-xs text-sm text-neutral-900 focus:border-neutral-900 focus:outline-none'
  const label = 'text-xs font-bold uppercase tracking-wide text-neutral-500'

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin" />} />
      <PageHero eyebrow="Step 2 of 3 · monthly cycle" title="Landlord statements"
        subtitle="Room by room — rent, the fee at that property and any expenses. The totals roll up onto the landlord's page; upload a PDF to fill it in."
        tabs={financeTabs('statements')} />
      <main className="mx-auto max-w-6xl px-lg py-xl">

        {error && <div className="mt-lg rounded-xl border-2 border-neutral-900 bg-white p-md text-sm text-neutral-900">{error}</div>}
        {notice && <div className="mt-lg rounded-xl bg-green-600 p-md text-sm font-semibold text-white">✅ {notice}</div>}

        <a href="/admin/statements/import" className="mt-lg flex items-center justify-between gap-md rounded-2xl bg-neutral-900 px-lg py-md text-white hover:bg-neutral-800">
          <span><span className="block font-bold">Upload a month of statements</span><span className="block text-xs text-neutral-300">Several PDFs at once, one per property — each checked before it’s saved</span></span>
          <span aria-hidden>→</span>
        </a>

        <label className="mt-lg block cursor-pointer rounded-2xl border-2 border-dashed border-neutral-300 bg-white p-lg text-center hover:border-neutral-900">
          <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} disabled={aiBusy || busy} />
          <p className="text-2xl">📄</p>
          <p className="mt-xs font-bold text-neutral-900">{aiBusy ? 'Reading the statement…' : 'Upload a statement PDF to auto-fill'}</p>
          <p className="mt-xs text-xs text-neutral-500">Or fill it in below</p>
        </label>
        {matchNote && <div className="mt-sm rounded-xl border border-neutral-300 bg-white p-md text-sm text-neutral-700">{matchNote}</div>}

        <form onSubmit={handleSave} className="mt-lg space-y-lg">
          {/* Header */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-lg">
            <div className="grid grid-cols-1 gap-md sm:grid-cols-2">
              <div className="sm:col-span-2">
                <span className={label}>Property</span>
                <select value={propertyId} onChange={(e) => onSelectProperty(e.target.value)} className={field} required>
                  <option value="">Select a property…</option>
                  {properties.map((p) => <option key={p.id} value={p.id}>{p.name ? `${p.name} — ${p.address}` : p.address}</option>)}
                </select>
                <div className="mt-sm flex flex-wrap items-center gap-sm rounded-xl bg-neutral-50 p-sm">
                  <span className="text-sm text-neutral-700">Statements from rent CROS has received are made on</span>
                  <input type="month" value={genMonth} onChange={(e) => setGenMonth(e.target.value)} className="rounded-lg border border-neutral-300 bg-white px-sm py-xs text-sm text-neutral-900" />
                  <a href={propertyId ? `/admin/statements/prepare?property=${propertyId}&month=${genMonth}` : `/admin/rent-roll?month=${genMonth}`} className="rounded-lg bg-neutral-900 px-md py-xs text-sm font-bold text-white">
                    Prepare statement →
                  </a>
                  <span className="w-full text-xs text-neutral-500">This form is for entering statements from the previous agent. New statements are made from the rent roll, checked and approved there, then paid in the payment run.</span>
                </div>
              </div>
              <div className="sm:col-span-2">
                <span className={label}>Landlord</span>
                <select value={landlordId} onChange={(e) => setLandlordId(e.target.value)} className={field} required>
                  <option value="">Select the landlord…</option>
                  {landlords.map((l) => <option key={l.id} value={l.id}>{l.name || l.email}</option>)}
                </select>
              </div>
              <div>
                <span className={label}>Statement reference</span>
                <input value={reference} onChange={(e) => setReference(e.target.value)} className={field} placeholder="e.g. LS1001" />
              </div>
              <div>
                <span className={label}>Management fee (this property)</span>
                <div className="mt-xs flex items-center gap-xs">
                  <input inputMode="decimal" value={feePct} onChange={(e) => onFeePctChange(e.target.value)} className={field + ' !mt-0'} />
                  <span className="text-sm font-bold text-neutral-500">%</span>
                </div>
              </div>
              <div>
                <span className={label}>Period start</span>
                <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className={field} />
              </div>
              <div>
                <span className={label}>Period end</span>
                <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className={field} />
              </div>
              <div>
                <span className={label}>Statement date</span>
                <input type="date" value={statementDate} onChange={(e) => setStatementDate(e.target.value)} className={field} />
              </div>
              <div>
                <span className={label}>Paid date</span>
                <input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} className={field} />
              </div>
            </div>
          </div>

          {/* Expenses (top of statement) */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-lg">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wide text-neutral-500">Expenses this period</h2>
              <span className="text-sm font-bold text-red-600">−£{totals.exp.toFixed(2)}</span>
            </div>
            <div className="mt-md space-y-sm">
              {expenses.map((x, i) => (
                <div key={i} className="flex items-center gap-sm">
                  <input value={x.description} onChange={(e) => setExpenses((xs) => xs.map((v, idx) => idx === i ? { ...v, description: e.target.value } : v))} className={cell} placeholder="e.g. Broadband, Cleaning, Boiler repair" />
                  <div className="flex items-center gap-xs">
                    <span className="text-sm text-neutral-400">£</span>
                    <input inputMode="decimal" value={x.amount} onChange={(e) => setExpenses((xs) => xs.map((v, idx) => idx === i ? { ...v, amount: e.target.value } : v))} className={cell + ' w-24'} placeholder="0.00" />
                  </div>
                  <button type="button" onClick={() => setExpenses((xs) => xs.length > 1 ? xs.filter((_, idx) => idx !== i) : xs)} className="shrink-0 px-sm text-neutral-400 hover:text-neutral-900" aria-label="Remove expense">✕</button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setExpenses((xs) => [...xs, blankExpense()])} className="mt-md text-sm font-semibold text-neutral-700 hover:text-neutral-900">+ Add expense</button>
          </div>

          {/* Rooms */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-lg">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wide text-neutral-500">Room rents received</h2>
              <span className="text-sm font-bold text-neutral-900">£{totals.gross.toFixed(2)}</span>
            </div>
            <div className="mt-md hidden grid-cols-[3rem_1fr_5rem_5rem_5rem_1.5rem] gap-sm text-[10px] font-bold uppercase tracking-wide text-neutral-400 sm:grid">
              <span>Room</span><span>Tenant</span><span>Rent £</span><span>Fee £</span><span>Net £</span><span></span>
            </div>
            <div className="mt-sm space-y-sm">
              {rooms.map((r, i) => (
                <div key={i} className="grid grid-cols-[3rem_1fr_5rem_5rem_5rem_1.5rem] items-center gap-sm">
                  <input inputMode="numeric" value={r.room_number} onChange={(e) => updateRoom(i, { room_number: e.target.value })} className={cell + ' text-center'} placeholder="#" />
                  <input value={r.tenant_name} onChange={(e) => updateRoom(i, { tenant_name: e.target.value })} className={cell} placeholder="Tenant name" />
                  <input inputMode="decimal" value={r.rent} onChange={(e) => updateRoom(i, { rent: e.target.value })} className={cell} placeholder="0.00" />
                  <input inputMode="decimal" value={r.fee} onChange={(e) => updateRoom(i, { fee: e.target.value })} className={cell + ' text-red-600'} placeholder="0.00" />
                  <input value={r.net === '' ? '' : `£${num(r.net).toFixed(2)}`} readOnly className={cell + ' bg-neutral-50 text-green-700'} tabIndex={-1} />
                  <button type="button" onClick={() => setRooms((rs) => rs.length > 1 ? rs.filter((_, idx) => idx !== i) : rs)} className="text-neutral-400 hover:text-neutral-900" aria-label="Remove room">✕</button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setRooms((rs) => [...rs, blankRoom(rs.length + 1)])} className="mt-md text-sm font-semibold text-neutral-700 hover:text-neutral-900">+ Add room</button>
          </div>

          {/* Totals */}
          <div className="rounded-2xl bg-neutral-900 p-lg text-white">
            <Row k="Gross rent (rooms)" v={`£${totals.gross.toFixed(2)}`} />
            <Row k={`Management fee (${feePct || 0}%)`} v={`−£${totals.mgmt.toFixed(2)}`} red />
            <Row k="Expenses" v={`−£${totals.exp.toFixed(2)}`} red />
            <div className="mt-sm flex items-center justify-between border-t border-white/15 pt-sm">
              <span className="font-bold">Net to landlord</span>
              <span className="text-xl font-bold text-green-400">£{totals.net.toFixed(2)}</span>
            </div>
          </div>

          <div className="flex items-center gap-md">
            <button type="submit" disabled={busy} className="rounded-xl bg-neutral-900 px-lg py-sm text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-50">
              {busy ? 'Saving…' : 'Save statement'}
            </button>
            <button type="button" onClick={resetForm} className="text-sm font-semibold text-neutral-500 hover:text-neutral-900">Clear</button>
          </div>
        </form>

        {/* Annual summary for a landlord's tax return */}
        <div className="mt-2xl flex flex-wrap items-end gap-sm rounded-2xl border border-neutral-200 bg-white p-lg">
          <div className="mr-auto">
            <h2 className="font-bold text-neutral-900">Annual summary</h2>
            <p className="text-xs text-neutral-500">Income and expenditure for a landlord’s tax return (6 April – 5 April), from their statements.</p>
          </div>
          <select value={annualLandlord} onChange={(e) => setAnnualLandlord(e.target.value)} className="rounded-lg border border-neutral-300 px-sm py-xs text-sm">
            <option value="">Landlord…</option>
            {landlords.map((l) => <option key={l.id} value={l.id}>{l.name || l.email}</option>)}
          </select>
          <select value={annualYear} onChange={(e) => setAnnualYear(Number(e.target.value))} className="rounded-lg border border-neutral-300 px-sm py-xs text-sm">
            {[0, 1, 2, 3].map((k) => { const y = new Date().getFullYear() - k; return <option key={y} value={y}>{y}/{String(y + 1).slice(2)}</option> })}
          </select>
          <button type="button" disabled={!annualLandlord} onClick={() => downloadPdf(`/api/admin/statements/annual?landlordId=${annualLandlord}&year=${annualYear}`, `Annual summary ${annualYear}.pdf`)} className="rounded-lg bg-neutral-900 px-md py-xs text-sm font-bold text-white disabled:bg-neutral-300">Download</button>
        </div>

        {/* Existing */}
        <h2 className="mt-2xl text-xl font-bold text-neutral-900">Statements on file</h2>
        {grouped.length === 0 && <p className="mt-sm text-sm text-neutral-500">No statements yet.</p>}
        {coverage && (
          <div className="mt-md rounded-2xl border border-neutral-200 bg-white">
            <p className="px-md pt-sm text-xs text-neutral-500">What each landlord was paid, month by month. A gap means no statement is on file — months before CROS took over rent are imported from your old system (<Link href="/admin/statements/import" className="font-semibold text-blue-700 hover:underline">Import</Link>).</p>
            <div className="overflow-x-auto">
              <table className="mt-xs w-full text-xs">
                <thead>
                  <tr className="border-b border-neutral-200">
                    <th className="sticky left-0 bg-white px-md py-xs text-left font-semibold text-neutral-500">House</th>
                    {coverage.months.map((m) => <th key={m} className="px-sm py-xs text-right font-semibold text-neutral-500 whitespace-nowrap">{new Date(m + '-01T12:00:00').toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {coverage.houses.map((h) => (
                    <tr key={h.id} className="border-b border-neutral-100 last:border-0">
                      <td className="sticky left-0 bg-white px-md py-xs font-semibold text-neutral-900 whitespace-nowrap">{h.name || h.address}</td>
                      {coverage.months.map((m) => {
                        const found = coverage.cell(h.id, m)
                        return (
                          <td key={m} className="px-sm py-xs text-right tabular-nums whitespace-nowrap">
                            {found.length ? found.map((st) => (
                              <button key={st.id} type="button" title={st.statement_reference}
                                onClick={() => { setExpandedStatementId(st.id); setTimeout(() => document.getElementById(`st-${st.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50) }}
                                className="block w-full text-right font-semibold text-green-800 hover:underline">£{Number(st.net_to_landlord).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</button>
                            )) : <span className="rounded bg-amber-50 px-xs text-amber-800" title="No statement on file for this month">missing</span>}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <div className="mt-md space-y-lg">
          {grouped.map(([pid, rowsFor]) => {
            const prop = rowsFor[0].properties
            return (
              <div key={pid} className="rounded-2xl border border-neutral-200 bg-white overflow-hidden">
                <div className="flex items-center justify-between gap-md px-md py-sm bg-neutral-50 border-b border-neutral-100">
                  <p className="font-bold text-neutral-900">{prop?.name || prop?.address || 'Property'}</p>
                  <span className="text-xs font-semibold text-neutral-500">{rowsFor.length} statement{rowsFor.length === 1 ? '' : 's'}</span>
                </div>
                <div className="divide-y divide-neutral-100">
                  {rowsFor.map((s) => {
                    const isExpanded = expandedStatementId === s.id
                    const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
                    const gbp = (n: number | null) => n != null ? `£${Number(n).toFixed(2)}` : '—'
                    const net = Number(s.net_to_landlord)
                    return (
                      <div key={s.id} id={`st-${s.id}`}>
                        <button
                          onClick={() => setExpandedStatementId(isExpanded ? null : s.id)}
                          className="w-full flex items-center justify-between gap-md px-md py-sm text-sm hover:bg-neutral-50 transition-colors text-left"
                        >
                          <span className="font-semibold text-neutral-900">{s.statement_reference}</span>
                          {s.period_start && s.period_end ? (
                            <span className="text-neutral-500 text-xs">{fmt(s.period_start)} – {fmt(s.period_end)}</span>
                          ) : (
                            <span className="text-neutral-500">{new Date(s.statement_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</span>
                          )}
                          <span className={`font-bold ${net < 0 ? 'text-amber-700' : 'text-green-700'}`}>
                            {net < 0 ? `Shortfall ${gbp(Math.abs(net))}` : gbp(net)}
                          </span>
                          <span className="text-neutral-400 text-xs">{isExpanded ? '▲' : '▼'}</span>
                        </button>

                        {isExpanded && (
                          <div className="px-md pb-lg bg-neutral-50 border-t border-neutral-100 text-sm">
                            {/* Period */}
                            {(s.period_start || s.period_end) && (
                              <p className="pt-sm text-xs text-neutral-500 font-semibold uppercase tracking-wide">
                                Period: {fmt(s.period_start)} – {fmt(s.period_end)}
                              </p>
                            )}

                            {/* Room breakdown */}
                            {s.rooms && s.rooms.length > 0 ? (
                              <div className="mt-sm">
                                <p className="text-xs font-bold text-neutral-500 uppercase tracking-wide mb-xs">Room rents</p>
                                <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
                                  <table className="w-full text-xs">
                                    <thead className="bg-neutral-100 text-neutral-500 font-semibold">
                                      <tr>
                                        <th className="px-sm py-xs text-left">Room</th>
                                        <th className="px-sm py-xs text-left">Tenant</th>
                                        <th className="px-sm py-xs text-right">Rent</th>
                                        <th className="px-sm py-xs text-right">Mgmt fee</th>
                                        <th className="px-sm py-xs text-right">Net</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-100">
                                      {s.rooms.map((r: any, i: number) => (
                                        <tr key={i} className="hover:bg-neutral-50">
                                          <td className="px-sm py-xs font-medium">Rm {r.room_number}</td>
                                          <td className="px-sm py-xs text-neutral-700">{r.tenant_name || '—'}</td>
                                          {/* saved as rent_income / management_fee / net_to_landlord (older rows: rent / fee / net) */}
                                          <td className="px-sm py-xs text-right">{(r.rent_income ?? r.rent) != null ? `£${Number(r.rent_income ?? r.rent).toFixed(2)}` : '—'}</td>
                                          <td className="px-sm py-xs text-right text-red-600">{(r.management_fee ?? r.fee) ? `−£${Number(r.management_fee ?? r.fee).toFixed(2)}` : '—'}</td>
                                          <td className="px-sm py-xs text-right text-green-700 font-semibold">{(r.net_to_landlord ?? r.net) != null ? `£${Number(r.net_to_landlord ?? r.net).toFixed(2)}` : '—'}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            ) : s.gross_rent != null ? (
                              <div className="mt-sm rounded-lg border border-neutral-200 bg-white px-md py-sm flex justify-between">
                                <span className="text-neutral-600">Gross rent (all rooms)</span>
                                <span className="font-semibold">{gbp(s.gross_rent)}</span>
                              </div>
                            ) : null}

                            {/* Expenses */}
                            {s.expenses && s.expenses.length > 0 && (
                              <div className="mt-sm">
                                <p className="text-xs font-bold text-neutral-500 uppercase tracking-wide mb-xs">Expenses charged</p>
                                <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
                                  <table className="w-full text-xs">
                                    <tbody className="divide-y divide-neutral-100">
                                      {s.expenses.map((e: any, i: number) => (
                                        <tr key={i}>
                                          <td className="px-sm py-xs text-neutral-700">{e.description || 'Expense'}</td>
                                          <td className="px-sm py-xs text-right text-red-600 font-semibold">−£{Number(e.amount || 0).toFixed(2)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}

                            {/* Summary totals */}
                            <div className="mt-sm rounded-lg border border-neutral-200 bg-white divide-y divide-neutral-100 text-xs">
                              {s.gross_rent != null && (
                                <div className="flex justify-between px-md py-xs">
                                  <span className="text-neutral-500">Gross rent</span>
                                  <span className="font-semibold">{gbp(s.gross_rent)}</span>
                                </div>
                              )}
                              {s.management_fees != null && (
                                <div className="flex justify-between px-md py-xs">
                                  <span className="text-neutral-500">Management fee {s.management_fee_pct ? `(${s.management_fee_pct}%)` : ''}</span>
                                  <span className="font-semibold text-red-600">−{gbp(s.management_fees)}</span>
                                </div>
                              )}
                              {s.property_charges != null && (
                                <div className="flex justify-between px-md py-xs">
                                  <span className="text-neutral-500">Property charges / expenses</span>
                                  <span className="font-semibold text-red-600">−{gbp(s.property_charges)}</span>
                                </div>
                              )}
                              <div className="flex justify-between px-md py-sm bg-neutral-50">
                                <span className="font-bold text-neutral-900">Landlord received</span>
                                <span className={`font-bold text-base ${net < 0 ? 'text-amber-700' : 'text-green-700'}`}>
                                  {net < 0 ? `Shortfall ${gbp(Math.abs(net))}` : gbp(net)}
                                </span>
                              </div>
                            </div>

                            <div className="mt-md">
                              <StatementSend statementId={s.id} label={`${s.statement_reference} ${prop?.name || ''}`.trim()} sentAt={s.sent_at} onSent={loadStatements} />
                            </div>

                            {s.paid_date && (
                              <p className="mt-sm text-xs text-neutral-500">
                                Paid {fmt(s.paid_date)}{s.amount_paid != null ? ` · ${gbp(s.amount_paid)}` : ''}
                              </p>
                            )}

                            {!s.rooms && !s.gross_rent && (
                              <p className="mt-sm text-xs text-neutral-400 italic">
                                Detailed breakdown not available for this statement — upload a new statement using the form above to capture room-by-room detail.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </main>
    </div>
  )
}

function Row({ k, v, red }: { k: string; v: string; red?: boolean }) {
  return (
    <div className="flex items-center justify-between py-xs text-sm">
      <span className="text-white/80">{k}</span>
      <span className={`font-bold ${red ? 'text-red-400' : ''}`}>{v}</span>
    </div>
  )
}
