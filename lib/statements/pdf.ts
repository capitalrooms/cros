// A saved landlord statement as a PDF, in the modern statement layout (lib/statements/modernPdf, approved 29 Sep 2026).
import type { SupabaseClient } from '@supabase/supabase-js'
import { renderModernStatement } from '@/lib/statements/modernPdf'
import { landlordFormalNames } from '@/lib/people'
import { fullAddress } from '@/lib/quotes/quoteRequest'
import { open, openFields, openRows, seal, BANK_FIELDS } from '@/lib/crypto/fieldCrypt'

const ukDate = (iso: string) => new Date(iso + (iso.length === 10 ? 'T12:00:00Z' : '')).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

export interface StatementForPdf {
  statement: any
  property: { name: string | null; address: string | null; postcode?: string | null; property_code?: string | null; bank_account_name?: string | null; bank_account_number?: string | null } | null
  landlord: any
  extra?: { accountEnding: string | null; floatBalance: number; stillOwed: { room: string; tenant: string; amount: number }[]; sharedInvoices: Set<string>; importedRooms?: any[]; importedLines?: any[] }
}

export async function loadStatementForPdf(s: SupabaseClient, id: string): Promise<StatementForPdf | null> {
  const { data: statement } = await s.from('landlord_statements').select('*').eq('id', id).maybeSingle()
  if (!statement) return null
  const [{ data: property }, { data: landlord }, { data: banks }, { data: floats }, { data: exps }] = await Promise.all([
    s.from('properties').select('name, address, postcode, property_code, bank_account_name, bank_account_number').eq('id', statement.property_id).maybeSingle(),
    statement.landlord_id
      ? s.from('people').select('id, salutation, first_name, last_name, full_name, company, email, home_address, joint_salutation, joint_first_name, joint_last_name, joint_email').eq('id', statement.landlord_id).maybeSingle()
      : Promise.resolve({ data: null }),
    statement.landlord_id ? s.from('landlord_bank_accounts').select('account_number, is_default').eq('landlord_id', statement.landlord_id) : Promise.resolve({ data: [] as any[] }),
    s.from('landlord_statements').select('*').eq('property_id', statement.property_id).lte('statement_date', statement.statement_date),
    s.from('recharge_expenses').select('*').eq('included_in_statement_id', id),
  ])
  // a statement imported from the old system keeps its detail in rows and lines, not on the statement (4 Nov 2026:
  // those PDFs read £0.00 throughout) — load them so the PDF shows what the statement says
  const imported = !(Array.isArray(statement.rooms) && statement.rooms.length)
  const [{ data: sRooms }, { data: sLines }] = imported ? await Promise.all([
    s.from('landlord_statement_rooms').select('rent_income, management_fee, tenant_id, rooms(name), people:tenant_id(salutation, first_name, last_name, full_name)').eq('statement_id', id),
    s.from('statement_line_items').select('description, amount, category, category_type, room_label').eq('statement_id', id),
  ]) : [{ data: [] as any[] }, { data: [] as any[] }]
  // the account paid into: the property's own payee account, else the landlord's default
  const acct = open((property as any)?.bank_account_number) || open(((banks ?? []) as any[]).sort((a, b) => Number(b.is_default) - Number(a.is_default))[0]?.account_number)   // stored encrypted
  const floatBalance = Math.round(((floats ?? []) as any[]).reduce((t, x) => t + Number(x.float_retained || 0) - Number(x.float_used || 0), 0) * 100) / 100
  // tenants still owing for the statement's month (CROS rent charges only)
  const stillOwed: { room: string; tenant: string; amount: number }[] = []
  if (statement.period_start) {
    const month = String(statement.period_start).slice(0, 7) + '-01'
    const [{ data: owed }, { data: tens }] = await Promise.all([
      s.from('rent_charges').select('amount_due, amount_received, voided, rooms(name), room_id').eq('property_id', statement.property_id).eq('charge_month', month),
      s.from('tenancies').select('room_id, start_date, end_date, let_cancelled_at, people!person_id(salutation, first_name, last_name, full_name)').eq('property_id', statement.property_id).lte('start_date', String(statement.period_end || statement.period_start).slice(0, 10)).or(`end_date.is.null,end_date.gte.${month}`),
    ])
    // the tenant who was in the room that month (latest start), so the landlord sees who owes
    const tenantIn = (roomId: string) => { const t = ((tens ?? []) as any[]).filter(x => x.room_id === roomId && !x.let_cancelled_at).sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)))[0]; return t ? [t.people?.salutation, t.people?.first_name, t.people?.last_name].filter(Boolean).join(' ') || t.people?.full_name || '' : '' }
    for (const c of (owed ?? []) as any[]) {
      const left = Math.round((Number(c.amount_due) - Number(c.amount_received || 0)) * 100) / 100
      if (!c.voided && left > 0.004) stillOwed.push({ room: c.rooms?.name ?? 'Room', tenant: tenantIn(c.room_id), amount: left })
    }
  }
  const sharedInvoices = new Set(((exps ?? []) as any[]).filter(e => e.share_invoice && e.invoice_path).map(e => String(e.txn_no || e.reference || e.id)))
  return { statement, property, landlord, extra: { accountEnding: acct ? String(acct).replace(/\D/g, '').slice(-4) : null, floatBalance, stillOwed, sharedInvoices, importedRooms: (sRooms ?? []) as any[], importedLines: (sLines ?? []) as any[] } }
}

/** The landlord statement PDF — the modern layout (lib/statements/modernPdf), from a saved statement. */
export async function renderStatementPdf({ statement: st, property, landlord, extra }: StatementForPdf): Promise<Buffer> {
  let rooms: any[] = Array.isArray(st.rooms) ? st.rooms : []
  let expenses: any[] = Array.isArray(st.expenses) ? st.expenses : []
  // imported from the old system: rooms and costs from its rows and lines when they add up to the statement, otherwise
  // the statement's own totals — the same rule as Finance › Transactions, so the PDF always equals the statement
  if (!rooms.length) {
    const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
    const sum = (xs: any[], f: (x: any) => number) => r2(xs.reduce((t, x) => t + f(x), 0))
    const gross = r2(Number(st.gross_rent || 0)), fees = r2(Number(st.management_fees || 0) + Number(st.letting_fees || 0)), charges = r2(Number(st.property_charges || 0))
    const R = extra?.importedRooms ?? [], L = extra?.importedLines ?? []
    const nm = (p: any) => p ? [p.salutation, p.first_name, p.last_name].filter(Boolean).join(' ') || p.full_name || '' : ''
    const rentLines = L.filter(l => ['rent_income', 'income'].includes(String(l.category)) || l.category_type === 'income')
    rooms = R.length && Math.abs(sum(R, x => Number(x.rent_income || 0)) - gross) < 0.02
      ? R.map(x => ({ room_number: x.rooms?.name ?? 'Room', tenant_name: nm(x.people), rent_income: Number(x.rent_income || 0), management_fee: Number(x.management_fee || 0) }))
      : rentLines.length && Math.abs(sum(rentLines, l => Number(l.amount || 0)) - gross) < 0.02
        ? rentLines.map(l => ({ room_number: l.room_label || 'Rent', tenant_name: l.description ?? '', rent_income: Number(l.amount || 0), management_fee: 0 }))
        : gross ? [{ room_number: 'All rooms', tenant_name: 'Rent received (statement total)', rent_income: gross, management_fee: 0 }] : []
    const feeOnRows = sum(rooms, x => Number(x.management_fee || 0))
    const rest = r2(fees - feeOnRows), letf = r2(Number(st.letting_fees || 0))
    // what the rows don't carry: the letting fee when that's what it is, otherwise the fees the statement shows in total
    if (Math.abs(rest) > 0.004) rooms.push(Math.abs(rest - letf) < 0.02
      ? { room_number: '', tenant_name: 'Letting fee', rent_income: 0, management_fee: 0, letting_fee: rest, _last: true }
      : { room_number: '', tenant_name: 'Fees (statement total)', rent_income: 0, management_fee: rest, _last: true })
    if (!expenses.length && charges) {
      const costLines = L.filter(l => !['rent_income', 'income', 'management_fee', 'letting_fee'].includes(String(l.category)) && l.category_type !== 'income')
      expenses = costLines.length && Math.abs(sum(costLines, l => Number(l.amount || 0)) - charges) < 0.02
        ? costLines.map(l => ({ description: l.description, amount: Number(l.amount || 0) }))
        : [{ description: 'Property charges (statement total)', amount: charges }]
    }
  }
  const pct = st.management_fee_pct != null ? Number(st.management_fee_pct) : null
  const month = st.period_start ? new Date(String(st.period_start).slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' }) : ''
  const periodLabel = st.period_start ? new Date(String(st.period_start).slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : (st.statement_reference || '')
  const addressLines = String(landlord?.home_address || '').split(/\n|,\s*/).map((l: string) => l.trim()).filter(Boolean)
  return renderModernStatement({
    reference: st.statement_reference, statementDate: st.statement_date ? ukDate(st.statement_date) : ukDate(new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })),
    periodLabel, paymentNo: st.payout_no ?? null, feeNo: st.fee_no ?? null,
    landlordName: (landlord ? (landlord.company || landlordFormalNames(landlord)) : '') || 'Landlord', landlordAddress: addressLines,
    property: fullAddress(property?.name, property?.address, property?.postcode) || String(property?.name || ''), propertyCode: property?.property_code ?? null,
    roomsCount: rooms.filter(r => Number(r.rent_income) > 0).length || undefined,
    paidOn: st.paid_date ? ukDate(st.paid_date) : null, accountEnding: extra?.accountEnding ?? null, paymentRef: `CR ${st.statement_reference}`,
    rooms: rooms.slice().sort((a, b) => Number(!!a._last) - Number(!!b._last) || String(a.room_number ?? '').localeCompare(String(b.room_number ?? ''), undefined, { numeric: true })).map(r => ({
      room: /^\d+$/.test(String(r.room_number ?? '')) ? `Room ${r.room_number}` : String(r.room_number ?? 'Room'),
      tenant: r.tenant_name || '', forPeriod: month, rent: Number(r.rent_income || 0), fee: Number(r.management_fee || 0),
      feeLabel: String(r.note || '').match(/fee: ([^;]+)/)?.[1] ?? (pct != null ? `${pct}%` : ''), lettingFee: Number(r.letting_fee || 0) || undefined,
      note: String(r.note || '').split(';').map((x: string) => x.trim()).filter((x: string) => x && !x.startsWith('fee:') && !x.startsWith('letting fee')).join('; ') || undefined,
    })),
    expenses: expenses.map(e => ({
      number: e.number ?? null, date: e.date ? ukDate(String(e.date)) : '', description: String(e.description || 'Expense').replace(/\s*\((X?EXP\d+|EXP-[^)]+)\)$/, ''),
      supplier: e.supplier ?? null, amount: Number(e.amount || 0), invoiceAttached: !!(e.number && extra?.sharedInvoices.has(String(e.number))),
    })),
    floatRetained: Number(st.float_retained || 0), floatUsed: Number(st.float_used || 0), floatBalance: extra?.floatBalance,
    stillOwed: extra?.stillOwed.length ? extra.stillOwed : undefined,
    practice: /^X/.test(String(st.statement_reference || '')),
  })
}
