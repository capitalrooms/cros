// A saved landlord statement as a PDF, in the modern statement layout (lib/statements/modernPdf, approved 29 Sep 2026).
import type { SupabaseClient } from '@supabase/supabase-js'
import { renderModernStatement } from '@/lib/statements/modernPdf'
import { landlordFormalNames } from '@/lib/people'
import { fullAddress } from '@/lib/quotes/quoteRequest'

const ukDate = (iso: string) => new Date(iso + (iso.length === 10 ? 'T12:00:00Z' : '')).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

export interface StatementForPdf {
  statement: any
  property: { name: string | null; address: string | null; postcode?: string | null; property_code?: string | null; bank_account_name?: string | null; bank_account_number?: string | null } | null
  landlord: any
  extra?: { accountEnding: string | null; floatBalance: number; stillOwed: { room: string; tenant: string; amount: number }[]; sharedInvoices: Set<string> }
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
  // the account paid into: the property's own payee account, else the landlord's default
  const acct = (property as any)?.bank_account_number || ((banks ?? []) as any[]).sort((a, b) => Number(b.is_default) - Number(a.is_default))[0]?.account_number
  const floatBalance = Math.round(((floats ?? []) as any[]).reduce((t, x) => t + Number(x.float_retained || 0) - Number(x.float_used || 0), 0) * 100) / 100
  // tenants still owing for the statement's month (CROS rent charges only)
  const stillOwed: { room: string; tenant: string; amount: number }[] = []
  if (statement.period_start) {
    const { data: owed } = await s.from('rent_charges').select('amount_due, amount_received, voided, rooms(name), room_id').eq('property_id', statement.property_id).eq('charge_month', String(statement.period_start).slice(0, 7) + '-01')
    for (const c of (owed ?? []) as any[]) {
      const left = Math.round((Number(c.amount_due) - Number(c.amount_received || 0)) * 100) / 100
      if (!c.voided && left > 0.004) stillOwed.push({ room: c.rooms?.name ?? 'Room', tenant: '', amount: left })
    }
  }
  const sharedInvoices = new Set(((exps ?? []) as any[]).filter(e => e.share_invoice && e.invoice_path).map(e => String(e.txn_no || e.reference || e.id)))
  return { statement, property, landlord, extra: { accountEnding: acct ? String(acct).replace(/\D/g, '').slice(-4) : null, floatBalance, stillOwed, sharedInvoices } }
}

/** The landlord statement PDF — the modern layout (lib/statements/modernPdf), from a saved statement. */
export async function renderStatementPdf({ statement: st, property, landlord, extra }: StatementForPdf): Promise<Buffer> {
  const rooms: any[] = Array.isArray(st.rooms) ? st.rooms : []
  const expenses: any[] = Array.isArray(st.expenses) ? st.expenses : []
  const pct = st.management_fee_pct != null ? Number(st.management_fee_pct) : null
  const month = st.period_start ? new Date(String(st.period_start).slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' }) : ''
  const periodLabel = st.period_start ? new Date(String(st.period_start).slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : (st.statement_reference || '')
  const addressLines = String(landlord?.home_address || '').split(/\n|,\s*/).map((l: string) => l.trim()).filter(Boolean)
  return renderModernStatement({
    reference: st.statement_reference, statementDate: st.statement_date ? ukDate(st.statement_date) : ukDate(new Date().toISOString().slice(0, 10)),
    periodLabel, paymentNo: st.payout_no ?? null, feeNo: st.fee_no ?? null,
    landlordName: (landlord ? (landlord.company || landlordFormalNames(landlord)) : '') || 'Landlord', landlordAddress: addressLines,
    property: fullAddress(property?.name, property?.address, property?.postcode) || String(property?.name || ''), propertyCode: property?.property_code ?? null,
    roomsCount: rooms.filter(r => Number(r.rent_income) > 0).length || undefined,
    paidOn: st.paid_date ? ukDate(st.paid_date) : null, accountEnding: extra?.accountEnding ?? null, paymentRef: `CR ${st.statement_reference}`,
    rooms: rooms.slice().sort((a, b) => String(a.room_number ?? '').localeCompare(String(b.room_number ?? ''), undefined, { numeric: true })).map(r => ({
      room: /^\d+$/.test(String(r.room_number ?? '')) ? `Room ${r.room_number}` : String(r.room_number ?? 'Room'),
      tenant: r.tenant_name || '', forPeriod: month, rent: Number(r.rent_income || 0), fee: Number(r.management_fee || 0),
      feeLabel: String(r.note || '').match(/fee: ([^;]+)/)?.[1] ?? (pct != null ? `${pct}%` : ''), lettingFee: Number(r.letting_fee || 0) || undefined,
      note: String(r.note || '').split(';').map((x: string) => x.trim()).filter((x: string) => x && !x.startsWith('fee:') && !x.startsWith('letting fee')).join('; ') || undefined,
    })),
    expenses: expenses.map(e => ({
      number: e.number ?? null, date: e.date ? ukDate(String(e.date)) : '', description: String(e.description || 'Expense').replace(/\s*\((EXP\d+|EXP-[^)]+)\)$/, ''),
      supplier: e.supplier ?? null, amount: Number(e.amount || 0), invoiceAttached: !!(e.number && extra?.sharedInvoices.has(String(e.number))),
    })),
    floatRetained: Number(st.float_retained || 0), floatUsed: Number(st.float_used || 0), floatBalance: extra?.floatBalance,
    stillOwed: extra?.stillOwed.length ? extra.stillOwed : undefined,
  })
}
