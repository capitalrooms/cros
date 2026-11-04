// The books (4 Nov 2026, Harry: "a full audit on the finance workings … a view to see all expenses, then all rents
// received, then all fees charged whether they are management or let fees, landlord payments … deposits received …
// HMRC watertight and ready for when we charge a management fee + VAT … easy to dump out for accountants … HMRC ready
// for landlords' end of year incomes and expenditures").
//
// ONE place every money report reads from — the Books screen, its CSVs, the landlord's annual summary and the tax-year
// report — so they can never disagree. Rules:
//
//   • Statements are the record. While CROS mirrors the old system (lib/finance/mode), the imported statements are
//     what happened: rent − management fee − letting fee − property charges = paid to the landlord, and every statement
//     reconciles that way (checked 4 Nov 2026, 85 of 85).
//   • Each statement's totals are broken down by room or by line when the detail adds up to the total; when it
//     doesn't (nine April 2026 statements were imported with their costs but not their rent or fee lines), the
//     statement total is used as one line, marked "per statement". Totals therefore always equal the statements.
//   • Rent and fees belong to the month the rent is for (lib/finance/statementMonth) — cash basis: the rent was
//     received by us in that month. Payments to landlords are dated when paid (the statement date if the old system
//     paid them). The tax year runs 6 April – 5 April.
//   • Expenses are what was spent on the property and charged back on a statement, plus costs logged in CROS (EXP…)
//     that aren't already one of those lines. Rent received and our fees are never expenses.
//   • Let-only lets (lib/finance/initialMonies): the first rent and deposit received, our tenant-find fee, and the
//     payment to the landlord — the deposit goes to the landlord, never held by us.
//   • VAT: our fees carry VAT once we're registered (system_settings 'vat_registration': { from, rate }). Fees on or
//     after that date are VAT-inclusive as charged — net and VAT are worked out of the gross; before it, VAT is nil.
//   • Practice (demo) houses are never in the books.
import type { SupabaseClient } from '@supabase/supabase-js'
import { statementMonth } from '@/lib/finance/statementMonth'
import { demoPropertyIds } from '@/lib/demoProperties'

export type BookKind = 'rent' | 'fee' | 'expense' | 'payout' | 'deposit'
export interface BookRow {
  kind: BookKind
  date: string                 // the date it counts on (YYYY-MM-DD)
  month: string | null         // the rent month it belongs to (YYYY-MM), for rent, fees and charged-back costs
  taxYear: string              // "2026/27"
  landlordId: string | null; landlord: string
  propertyId: string | null; property: string
  room: string | null; tenant: string | null
  description: string
  category: string             // rent | management fee | letting fee | <expense category> | paid to landlord | deposit …
  amount: number               // gross, £ — what was charged / received / paid
  net: number | null; vat: number | null   // fees only
  reference: string | null     // the statement (LS…), the expense (EXP…), the payout (PAY…), the deposit
  source: 'statement room' | 'statement line' | 'per statement' | 'CROS expense' | 'let-only monies' | 'tenancy' | 'holding deposit'
  note?: string                // anything to look at
}
export interface Books { from: string; to: string; vat: VatSetting | null; rows: BookRow[]; checks: string[] }
export interface VatSetting { from: string; rate: number }

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const first = (s: unknown) => String(s ?? '').split('\n')[0]
const FEES = new Set(['management_fee', 'letting_fee'])
const INCOME = new Set(['rent_income', 'income'])
const CATEGORY_LABEL = (c: string | null | undefined) => String(c || 'other').replace(/_/g, ' ')

/** "2026/27" for any date — the UK tax year starts on 6 April */
export function taxYearOf(iso: string): string {
  const y = Number(iso.slice(0, 4)), md = iso.slice(5, 10)
  const start = md >= '04-06' ? y : y - 1
  return `${start}/${String(start + 1).slice(2)}`
}
/** 6 April – 5 April for the tax year starting in `year` */
export const taxYearRange = (year: number) => ({ from: `${year}-04-06`, to: `${year + 1}-04-05`, label: `${year}/${String(year + 1).slice(2)}` })

export async function vatSetting(s: SupabaseClient): Promise<VatSetting | null> {
  const { data } = await s.from('system_settings').select('value').eq('key', 'vat_registration').maybeSingle()
  try { const v = typeof data?.value === 'string' ? JSON.parse(data.value) : data?.value; return v?.from && Number(v.rate) > 0 ? { from: String(v.from), rate: Number(v.rate) } : null } catch { return null }
}
function splitVat(gross: number, date: string, vat: VatSetting | null): { net: number; vat: number } {
  if (!vat || date < vat.from) return { net: r2(gross), vat: 0 }
  const v = r2(gross * vat.rate / (100 + vat.rate))
  return { net: r2(gross - v), vat: v }
}

/** Every money row between two dates (inclusive), optionally for one landlord or property. */
export async function loadBooks(s: SupabaseClient, o: { from: string; to: string; landlordId?: string | null; propertyId?: string | null }): Promise<Books> {
  const demo = await demoPropertyIds(s)
  const vat = await vatSetting(s)
  const checks: string[] = []
  const rows: BookRow[] = []
  const inRange = (d: string | null | undefined) => !!d && d >= o.from && d <= o.to
  const wanted = (pid: string | null | undefined, lid: string | null | undefined) => !demo.has(pid ?? '') && (!o.propertyId || pid === o.propertyId) && (!o.landlordId || lid === o.landlordId)

  const [{ data: props }, { data: people }] = await Promise.all([
    s.from('properties').select('id, name, landlord_id'),
    s.from('people').select('id, salutation, first_name, last_name, full_name, company').in('role', ['landlord', 'tenant']),
  ])
  const prop = new Map(((props ?? []) as any[]).map(p => [p.id, p]))
  const who = (id: string | null | undefined) => { const p: any = ((people ?? []) as any[]).find(x => x.id === id); return p ? (p.company || [p.salutation, p.first_name, p.last_name].filter(Boolean).join(' ') || p.full_name || '') : '' }

  // ── statements (a margin either side: a statement counts by its rent month, which can sit outside its date) ──
  const pad = (d: string, days: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + days); return x.toISOString().slice(0, 10) }
  const { data: stmts } = await s.from('landlord_statements').select('*').gte('statement_date', pad(o.from, -62)).lte('statement_date', pad(o.to, 62))
  const ids = ((stmts ?? []) as any[]).map(x => x.id)
  const [{ data: lines }, { data: rooms }] = ids.length ? await Promise.all([
    s.from('statement_line_items').select('id, statement_id, description, amount, category, category_type, room_label, recharge_expense_id').in('statement_id', ids),
    s.from('landlord_statement_rooms').select('statement_id, room_id, tenant_id, rent_income, management_fee, rooms(name)').in('statement_id', ids),
  ]) : [{ data: [] }, { data: [] }] as any

  for (const st of (stmts ?? []) as any[]) {
    const p: any = prop.get(st.property_id)
    const landlordId = st.landlord_id ?? p?.landlord_id ?? null
    if (!wanted(st.property_id, landlordId)) continue
    const month = statementMonth(st)
    const rentDate = month ? `${month}-01` : String(st.statement_date)
    const base = { landlordId, landlord: who(landlordId), propertyId: st.property_id, property: first(p?.name), reference: st.statement_reference ?? null }
    const L = ((lines ?? []) as any[]).filter(l => l.statement_id === st.id)
    const R = ((rooms ?? []) as any[]).filter(r => r.statement_id === st.id)
    const J = Array.isArray(st.rooms) ? st.rooms as any[] : []
    const sum = (xs: any[], f: (x: any) => number) => r2(xs.reduce((t, x) => t + f(x), 0))
    const gross = r2(Number(st.gross_rent || 0)), mgmt = r2(Number(st.management_fees || 0)), letf = r2(Number(st.letting_fees || 0)), charges = r2(Number(st.property_charges || 0)), net = r2(Number(st.net_to_landlord || 0))
    if (Math.abs(r2(gross - mgmt - letf - charges - Number(st.float_retained || 0) + Number(st.float_used || 0) - net)) > 0.02) checks.push(`${st.statement_reference}: rent − fees − charges doesn’t equal the amount paid to the landlord`)

    if (inRange(rentDate)) {
      // rent: by room (statement rooms table), else the statement's own room list, else its rent lines, else the total
      const rentLines = L.filter(l => INCOME.has(String(l.category)) || l.category_type === 'income')
      const pick: { room: string | null; tenant: string | null; amount: number; source: BookRow['source'] }[] =
        R.length && Math.abs(sum(R, r => Number(r.rent_income || 0)) - gross) < 0.02 ? R.map(r => ({ room: r.rooms?.name ?? null, tenant: who(r.tenant_id) || null, amount: r2(Number(r.rent_income || 0)), source: 'statement room' as const }))
        : J.length && Math.abs(sum(J, r => Number(r.rent_income || 0)) - gross) < 0.02 ? J.map(r => ({ room: r.room_number != null ? `Room ${r.room_number}` : (r.room ?? null), tenant: r.tenant_name ?? null, amount: r2(Number(r.rent_income || 0)), source: 'statement room' as const }))
        : rentLines.length && Math.abs(sum(rentLines, l => Number(l.amount || 0)) - gross) < 0.02 ? rentLines.map(l => ({ room: l.room_label ?? null, tenant: null, amount: r2(Number(l.amount || 0)), source: 'statement line' as const, description: l.description }))
        : gross ? [{ room: null, tenant: null, amount: gross, source: 'per statement' as const }] : []
      for (const x of pick as any[]) if (x.amount) rows.push({ ...base, kind: 'rent', date: rentDate, month, taxYear: taxYearOf(rentDate), room: x.room, tenant: x.tenant, description: x.description ?? `Rent${x.room ? ` · ${x.room}` : ''}${x.tenant ? ` · ${x.tenant}` : ''}`, category: 'rent', amount: x.amount, net: null, vat: null, source: x.source })

      // fees: management by room or line, else the total; letting fees from their lines, else the total
      const mLines = L.filter(l => l.category === 'management_fee'), lLines = L.filter(l => l.category === 'letting_fee')
      const fee = (category: 'management fee' | 'letting fee', amount: number, extra: Partial<BookRow>) => {
        if (!amount) return
        const v = splitVat(amount, rentDate, vat)
        rows.push({ ...base, kind: 'fee', date: rentDate, month, taxYear: taxYearOf(rentDate), room: null, tenant: null, description: category === 'management fee' ? 'Management fee' : 'Letting fee', category, amount: r2(amount), net: v.net, vat: v.vat, source: 'per statement', ...extra })
      }
      if (R.length && Math.abs(sum(R, r => Number(r.management_fee || 0)) - mgmt) < 0.02) R.forEach(r => fee('management fee', Number(r.management_fee || 0), { room: r.rooms?.name ?? null, tenant: who(r.tenant_id) || null, source: 'statement room' }))
      else if (mLines.length && Math.abs(sum(mLines, l => Number(l.amount || 0)) - mgmt) < 0.02) mLines.forEach(l => fee('management fee', Number(l.amount || 0), { description: l.description, room: l.room_label ?? null, source: 'statement line' }))
      else if (mLines.length + lLines.length && Math.abs(sum([...mLines, ...lLines], l => Number(l.amount || 0)) - (mgmt + letf)) < 0.02 && !letf) [...mLines, ...lLines].forEach(l => fee(l.category === 'letting_fee' ? 'letting fee' : 'management fee', Number(l.amount || 0), { description: l.description, source: 'statement line' }))
      else fee('management fee', mgmt, {})
      if (letf) {
        if (lLines.length && Math.abs(sum(lLines, l => Number(l.amount || 0)) - letf) < 0.02) lLines.forEach(l => fee('letting fee', Number(l.amount || 0), { description: l.description, source: 'statement line' }))
        else if (mLines.length && !lLines.length && Math.abs(sum(mLines, l => Number(l.amount || 0)) - (mgmt + letf)) < 0.02) fee('letting fee', letf, {})   // the letting fee sat among the management lines
        else fee('letting fee', letf, {})
      }

      // costs charged back on the statement
      const eLines = L.filter(l => !FEES.has(String(l.category)) && !INCOME.has(String(l.category)) && l.category_type !== 'income')
      if (eLines.length && Math.abs(sum(eLines, l => Number(l.amount || 0)) - charges) < 0.02) eLines.forEach(l => rows.push({ ...base, kind: 'expense', date: rentDate, month, taxYear: taxYearOf(rentDate), room: l.room_label ?? null, tenant: null, description: l.description, category: CATEGORY_LABEL(l.category), amount: r2(Number(l.amount || 0)), net: null, vat: null, source: 'statement line' }))
      else if (charges) rows.push({ ...base, kind: 'expense', date: rentDate, month, taxYear: taxYearOf(rentDate), room: null, tenant: null, description: 'Property charges (per statement)', category: 'property charges', amount: charges, net: null, vat: null, source: 'per statement', note: eLines.length ? `The statement’s cost lines add up to ${r2(sum(eLines, l => Number(l.amount || 0)))}, not ${charges}` : undefined })
    }

    // paid to the landlord — when paid (the old system paid on the statement date)
    const paidOn = String(st.paid_date || st.statement_date)
    if (inRange(paidOn) && net !== 0) rows.push({ ...base, kind: 'payout', date: paidOn, month, taxYear: taxYearOf(paidOn), room: null, tenant: null, description: `Paid to ${who(landlordId) || 'the landlord'} — statement ${st.statement_reference ?? ''}`.trim(), category: 'paid to landlord', amount: net, net: null, vat: null, source: 'per statement', reference: st.payout_no || st.statement_reference || null, note: net < 0 ? 'The statement leaves the landlord owing — check it' : !st.paid_date ? 'Paid by the old system (statement date)' : undefined })
  }

  // ── costs logged in CROS (EXP…) that aren't already a statement line above ──
  const { data: exps } = await s.from('recharge_expenses').select('id, txn_no, property_id, expense_date, description, amount, category, supplier, voided_at, included_in_statement_id').gte('expense_date', o.from).lte('expense_date', o.to)
  const onLines = new Set(((lines ?? []) as any[]).map(l => l.recharge_expense_id).filter(Boolean))
  for (const e of (exps ?? []) as any[]) {
    if (e.voided_at || onLines.has(e.id)) continue
    const p: any = prop.get(e.property_id)
    if (!wanted(e.property_id, p?.landlord_id)) continue
    rows.push({ kind: 'expense', date: e.expense_date, month: String(e.expense_date).slice(0, 7), taxYear: taxYearOf(e.expense_date), landlordId: p?.landlord_id ?? null, landlord: who(p?.landlord_id), propertyId: e.property_id, property: first(p?.name), room: null, tenant: null, description: `${e.description}${e.supplier ? ` · ${e.supplier}` : ''}`, category: CATEGORY_LABEL(e.category), amount: r2(Number(e.amount || 0)), net: null, vat: null, reference: e.txn_no ?? null, source: 'CROS expense', note: e.included_in_statement_id ? undefined : 'Not on a statement yet' })
  }

  // ── let-only lets: first rent and deposit in, our fee, paid to the landlord ──
  const { data: ims } = await s.from('initial_monies').select('id, txn_no, tenancy_id, property_id, landlord_id, received_on, first_rent, deposit, fee, to_landlord, amount_paid, paid_on, payout_no, voided_at').is('voided_at', null)
  const tIds = ((ims ?? []) as any[]).map(m => m.tenancy_id)
  const { data: imT } = tIds.length ? await s.from('tenancies').select('id, people!person_id(salutation, first_name, last_name, full_name), rooms(name)').in('id', tIds) : { data: [] as any[] }
  const tName = (id: string) => { const t: any = ((imT ?? []) as any[]).find(x => x.id === id); const pp = t?.people; return { tenant: pp ? [pp.salutation, pp.first_name, pp.last_name].filter(Boolean).join(' ') || pp.full_name : null, room: t?.rooms?.name ?? null } }
  for (const m of (ims ?? []) as any[]) {
    const p: any = prop.get(m.property_id)
    const lid = m.landlord_id ?? p?.landlord_id ?? null
    if (!wanted(m.property_id, lid)) continue
    const base = { landlordId: lid, landlord: who(lid), propertyId: m.property_id, property: first(p?.name), ...tName(m.tenancy_id), reference: m.txn_no ?? null }
    if (inRange(m.received_on)) {
      if (Number(m.first_rent)) rows.push({ ...base, kind: 'rent', date: m.received_on, month: String(m.received_on).slice(0, 7), taxYear: taxYearOf(m.received_on), description: 'First rent (let only — paid on to the landlord)', category: 'rent', amount: r2(Number(m.first_rent)), net: null, vat: null, source: 'let-only monies' })
      if (Number(m.fee)) { const v = splitVat(Number(m.fee), m.received_on, vat); rows.push({ ...base, kind: 'fee', date: m.received_on, month: String(m.received_on).slice(0, 7), taxYear: taxYearOf(m.received_on), description: 'Letting fee (let only)', category: 'letting fee', amount: r2(Number(m.fee)), net: v.net, vat: v.vat, source: 'let-only monies' }) }
      if (Number(m.deposit)) rows.push({ ...base, kind: 'deposit', date: m.received_on, month: String(m.received_on).slice(0, 7), taxYear: taxYearOf(m.received_on), description: 'Deposit received — passed to the landlord (let only)', category: 'deposit to landlord', amount: r2(Number(m.deposit)), net: null, vat: null, source: 'let-only monies' })
    }
    if (m.paid_on && inRange(m.paid_on)) rows.push({ ...base, kind: 'payout', date: m.paid_on, month: String(m.paid_on).slice(0, 7), taxYear: taxYearOf(m.paid_on), description: 'Paid to the landlord — let-only move-in monies', category: 'paid to landlord', amount: r2(Number(m.amount_paid ?? m.to_landlord)), net: null, vat: null, source: 'let-only monies', reference: m.payout_no ?? m.txn_no ?? null })
  }

  // ── deposits on managed tenancies (held with the DPS) ──
  const { data: tens } = await s.from('tenancies').select('id, property_id, start_date, deposit_amount, deposit_received_on, deposit_received_amount, deposit_sent_on, deposit_sent_amount, deposit_scheme, deposit_scheme_ref, deposit_protected_at, let_cancelled_at, people!person_id(salutation, first_name, last_name, full_name), rooms(name)').gt('deposit_amount', 0).is('let_cancelled_at', null)
  const letOnlyT = new Set(tIds)
  for (const t of (tens ?? []) as any[]) {
    if (letOnlyT.has(t.id)) continue
    const p: any = prop.get(t.property_id)
    if (!wanted(t.property_id, p?.landlord_id)) continue
    const on = t.deposit_received_on || t.start_date
    if (!inRange(on)) continue
    const pp = t.people
    rows.push({ kind: 'deposit', date: on, month: String(on).slice(0, 7), taxYear: taxYearOf(on), landlordId: p?.landlord_id ?? null, landlord: who(p?.landlord_id), propertyId: t.property_id, property: first(p?.name), room: t.rooms?.name ?? null, tenant: pp ? [pp.salutation, pp.first_name, pp.last_name].filter(Boolean).join(' ') || pp.full_name : null, description: `Deposit${t.deposit_scheme ? ` · ${t.deposit_scheme}` : ''}${t.deposit_scheme_ref ? ` ${t.deposit_scheme_ref}` : ''}`, category: t.deposit_sent_on ? 'deposit — sent to the scheme' : t.deposit_protected_at ? 'deposit — protected' : 'deposit', amount: r2(Number(t.deposit_received_amount ?? t.deposit_amount)), net: null, vat: null, reference: t.deposit_scheme_ref ?? null, source: 'tenancy', note: t.deposit_received_on ? (t.deposit_sent_on || t.deposit_protected_at ? undefined : 'Received — not yet shown as protected') : 'Received date not recorded — counted from the tenancy start' })
  }

  rows.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.property ?? '').localeCompare(String(b.property ?? ''), undefined, { numeric: true }))
  return { from: o.from, to: o.to, vat, rows, checks }
}

/** A landlord's income and expenditure for their tax return, from the same rows. */
export function landlordYear(b: Books) {
  const k = (kind: BookKind) => b.rows.filter(r => r.kind === kind)
  const total = (xs: BookRow[]) => r2(xs.reduce((t, r) => t + r.amount, 0))
  const byCat = (xs: BookRow[]) => Object.entries(xs.reduce((m: Record<string, number>, r) => (m[r.category] = r2((m[r.category] ?? 0) + r.amount), m), {})).sort((a, b) => b[1] - a[1])
  const rent = total(k('rent')), fees = k('fee'), exps = k('expense')
  return {
    rent, managementFees: total(fees.filter(f => f.category === 'management fee')), lettingFees: total(fees.filter(f => f.category === 'letting fee')),
    feesVat: r2(fees.reduce((t, f) => t + (f.vat ?? 0), 0)), expenses: total(exps), expensesByCategory: byCat(exps),
    paidToLandlord: total(k('payout')), profit: r2(rent - total(fees) - total(exps)),
  }
}

/** CSV for an accountant: one row per entry, the columns they ask for. */
export function booksCsv(rows: BookRow[]): string {
  const head = ['Date', 'Tax year', 'Rent month', 'Type', 'Category', 'Landlord', 'Property', 'Room', 'Tenant', 'Description', 'Amount', 'Net', 'VAT', 'Reference', 'Source', 'Note']
  const cell = (v: unknown) => { const t = v == null ? '' : String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t }
  const KIND: Record<BookKind, string> = { rent: 'Rent received', fee: 'Fee', expense: 'Expense', payout: 'Paid to landlord', deposit: 'Deposit' }
  return [head, ...rows.map(r => [r.date, r.taxYear, r.month ?? '', KIND[r.kind], r.category, r.landlord, r.property, r.room ?? '', r.tenant ?? '', r.description, r.amount.toFixed(2), r.net != null ? r.net.toFixed(2) : '', r.vat != null ? r.vat.toFixed(2) : '', r.reference ?? '', r.source, r.note ?? ''])].map(r => r.map(cell).join(',')).join('\n')
}
