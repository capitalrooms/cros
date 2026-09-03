'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'

interface Property { id: string; name: string; address: string; management_fee_pct: number | null }
interface Landlord { id: string; name: string | null; email: string; property_id: string | null }
interface StatementRow {
  id: string
  statement_reference: string
  statement_date: string
  net_to_landlord: number
  property_id: string
  landlord_id: string
  properties?: { name: string; address: string }
}

interface RoomLine { room_number: string; tenant_name: string; rent: string; fee: string; net: string }
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

  async function loadStatements() {
    const supabase = createClient()
    const { data } = await supabase
      .from('landlord_statements')
      .select('id, statement_reference, statement_date, net_to_landlord, property_id, landlord_id, properties(name, address)')
      .order('statement_date', { ascending: false })
    setStatements((data as any) || [])
  }

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      const role = data?.assignment?.role
      if (!data || (role !== 'administrator' && role !== 'admin')) { router.push('/login'); return }
      const supabase = createClient()
      const [{ data: props }, { data: lls }] = await Promise.all([
        supabase.from('properties').select('id, name, address, management_fee_pct').order('name'),
        supabase.from('people').select('id, full_name, first_name, last_name, email, property_id').eq('role', 'landlord').order('full_name'),
      ])
      setProperties((props as any) || [])
      setLandlords((lls as any) || [])
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
    setPropertyId(pid)
    setLandlordId(resolveLandlord(pid) || landlordId)
    const p = properties.find((x) => x.id === pid)
    const pct = p?.management_fee_pct != null ? String(p.management_fee_pct) : '12'
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
    setAiBusy(true); setError(''); setNotice(''); setMatchNote('')
    try {
      const body = new FormData(); body.append('file', file)
      const res = await fetch('/api/ai/extract-statement', { method: 'POST', body })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Could not read the statement')
      const r = json.result
      const matched = matchProperty(r.property_address || '', properties)
      const pid = matched?.id || ''
      if (pid) onSelectProperty(pid)
      const pct = r.management_fee_pct ? String(r.management_fee_pct) : (matched?.management_fee_pct != null ? String(matched.management_fee_pct) : '12')
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
    try {
      const supabase = createClient()
      const dt = (v: string) => (v ? v : null)
      const roomsJson = filledRooms.map((r) => ({
        room_number: r.room_number ? parseInt(r.room_number, 10) : null,
        tenant_name: r.tenant_name.trim() || null,
        rent_income: num(r.rent),
        management_fee: num(r.fee),
        net_to_landlord: num(r.net),
      }))
      const expensesJson = expenses
        .filter((x) => x.description.trim() !== '' || x.amount !== '')
        .map((x) => ({ description: x.description.trim() || 'Expense', amount: num(x.amount) }))
      // Core totals always save (these columns exist). The breakdown columns
      // (management_fee_pct / rooms / expenses) are added by migration 044 — until
      // that's run we fall back to totals-only so the statement still saves.
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

      // Remember this property's fee rate for next time (best-effort; ignore if column absent).
      supabase.from('properties').update({ management_fee_pct: num(feePct) }).eq('id', propertyId).then(() => {})

      // Fire-and-forget: AI-categorise expense lines into statement_line_items.
      // Fetch the statement ID we just upserted, then POST to the categorise endpoint.
      supabase
        .from('landlord_statements')
        .select('id')
        .eq('landlord_id', landlordId)
        .eq('property_id', propertyId)
        .eq('statement_reference', reference.trim())
        .single()
        .then(({ data: s }) => {
          if (s?.id) {
            fetch(`/api/admin/statements/${s.id}/categorise`, { method: 'POST' }).catch(() => {})
          }
        })

      const prop = properties.find((p) => p.id === propertyId)
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
    setExpenses([blankExpense()]); setRooms([blankRoom(1)]); setMatchNote('')
  }

  const grouped = useMemo(() => {
    const map = new Map<string, StatementRow[]>()
    for (const s of statements) { if (!map.has(s.property_id)) map.set(s.property_id, []); map.get(s.property_id)!.push(s) }
    return Array.from(map.entries())
  }, [statements])

  if (loading) {
    return <div className="min-h-screen bg-neutral-100"><AppBar left={<BackButton />} /><p className="p-xl text-sm text-neutral-400">Loading…</p></div>
  }

  const field = 'mt-xs w-full rounded-xl border border-neutral-300 bg-white px-md py-sm text-sm text-neutral-900 focus:border-neutral-900 focus:outline-none'
  const cell = 'w-full rounded-lg border border-neutral-300 bg-white px-sm py-xs text-sm text-neutral-900 focus:border-neutral-900 focus:outline-none'
  const label = 'text-xs font-bold uppercase tracking-wide text-neutral-500'

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin" />} />
      <main className="mx-auto max-w-3xl px-lg py-lg">
        <h1 className="text-3xl font-bold text-neutral-900">Landlord statements</h1>
        <p className="mt-sm text-sm text-neutral-600">
          Enter a statement room by room — rent per room, the fee at that property, and any expenses. The totals roll up
          automatically and populate that property's landlord page. Upload a PDF to auto-fill it all.
        </p>

        {error && <div className="mt-lg rounded-xl border-2 border-neutral-900 bg-white p-md text-sm text-neutral-900">{error}</div>}
        {notice && <div className="mt-lg rounded-xl bg-green-600 p-md text-sm font-semibold text-white">✅ {notice}</div>}

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

        {/* Existing */}
        <h2 className="mt-2xl text-xl font-bold text-neutral-900">Statements on file</h2>
        {grouped.length === 0 && <p className="mt-sm text-sm text-neutral-500">No statements yet.</p>}
        <div className="mt-md space-y-lg">
          {grouped.map(([pid, rowsFor]) => {
            const prop = rowsFor[0].properties
            return (
              <div key={pid} className="rounded-2xl border border-neutral-200 bg-white p-md">
                <div className="flex items-center justify-between gap-md">
                  <p className="font-bold text-neutral-900">{prop?.name || prop?.address || 'Property'}</p>
                  <span className="text-xs font-semibold text-neutral-500">{rowsFor.length} statement{rowsFor.length === 1 ? '' : 's'}</span>
                </div>
                <div className="mt-sm divide-y divide-neutral-100">
                  {rowsFor.map((s) => (
                    <div key={s.id} className="flex items-center justify-between gap-md py-sm text-sm">
                      <span className="font-semibold text-neutral-900">{s.statement_reference}</span>
                      <span className="text-neutral-500">{new Date(s.statement_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</span>
                      <span className="font-bold text-green-700">£{Number(s.net_to_landlord).toFixed(2)}</span>
                    </div>
                  ))}
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
