// Initial monies for a let-only let (migration 231; 17 Oct 2026) — the money a tenant pays before moving in, through
// the client account: the holding deposit already held plus the balance (first rent + deposit − holding deposit), less
// the tenant-find fee (to the operations account), the rest paid to the landlord. Wording as Alto and Reapit use it.
//   expectedFor()  what should arrive and where it goes, from the move-in figures (lib/movein/pack) and the fee
//   bankMatches()  imported bank lines that look like the balance (amount, the tenant's name or payment reference)
//   receive() / pay() / transferFee() / voidRecord()  each step, numbered and logged; nothing is ever deleted
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadPackContext, moneySummary } from '@/lib/movein/pack'
import { logTenancyEvent } from '@/lib/lettings/incomingTenancy'
import { demoPropertyIds } from '@/lib/demoProperties'

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export interface InitialExpected {
  letOnly: boolean
  firstRent: number; deposit: number; holding: number; holdingId: string | null
  balanceDue: number; feeSuggested: number | null; feeBasis: string
  landlordId: string | null; propertyId: string | null; tenantName: string; paymentRef: string | null; startDate: string | null
}

export async function expectedFor(s: SupabaseClient, tenancyId: string): Promise<InitialExpected | { error: string }> {
  const { data: t } = await s.from('tenancies').select('id, property_id, start_date, rent_amount, deposit_amount, letting_fee_charged, payment_reference, people!person_id(first_name, last_name, full_name), properties(letting_type, landlord_id, letting_fee_pct, letting_fee_flat)').eq('id', tenancyId).maybeSingle() as { data: any }
  if (!t) return { error: 'Tenancy not found' }
  const ctx = await loadPackContext(s, tenancyId).catch(() => null)
  const m = ctx ? moneySummary(ctx) : null
  const { data: held } = await s.from('holding_deposits').select('id, amount, status').eq('tenancy_id', tenancyId).in('status', ['held', 'applied']).order('recorded_at').limit(1)
  const hold = (held ?? [])[0] as any
  const firstRent = r2(Number(m?.firstRent ?? t.rent_amount ?? 0))
  const deposit = r2(Number(m?.deposit ?? t.deposit_amount ?? 0))
  const holding = r2(Number(hold?.amount ?? m?.holdingDeposit ?? 0))
  const p = t.properties ?? {}
  // the tenant-find fee: what the tenancy already says, else the house's let-only fee (flat, or % of a month's rent)
  let feeSuggested: number | null = null, feeBasis = 'Not set — enter the agreed fee'
  if (t.letting_fee_charged != null) { feeSuggested = r2(Number(t.letting_fee_charged)); feeBasis = 'From the tenancy' }
  else if (p.letting_fee_flat != null) { feeSuggested = r2(Number(p.letting_fee_flat)); feeBasis = 'The house’s flat fee' }
  else if (p.letting_fee_pct != null && t.rent_amount) { feeSuggested = r2(Number(t.rent_amount) * Number(p.letting_fee_pct) / 100); feeBasis = `${p.letting_fee_pct}% of a month’s rent` }
  return {
    letOnly: p.letting_type === 'let_only',
    firstRent, deposit, holding, holdingId: hold?.id ?? null,
    balanceDue: r2(Math.max(0, firstRent + deposit - holding)),
    feeSuggested, feeBasis,
    landlordId: p.landlord_id ?? null, propertyId: t.property_id ?? null,
    tenantName: [t.people?.first_name, t.people?.last_name].filter(Boolean).join(' ') || t.people?.full_name || '',
    paymentRef: t.payment_reference ?? null, startDate: t.start_date ?? null,
  }
}

/** Unmatched bank lines that could be the balance: the right amount (to the penny, or within £1), or the tenant's
 *  name or payment reference in the description — within six weeks either side of the move-in date. Best first. */
export async function bankMatches(s: SupabaseClient, e: InitialExpected) {
  const around = e.startDate ?? new Date().toISOString().slice(0, 10)
  const shift = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
  const { data } = await s.from('bank_transactions').select('id, txn_no, transaction_date, amount, description, extracted_ref, status, is_practice')
    .in('status', ['unmatched', 'possible_duplicate']).gte('transaction_date', shift(around, -42)).lte('transaction_date', shift(around, 42)).gt('amount', 0)
  // a practice (demo) house's let only ever sees practice bank lines, and a real let only real ones
  const practice = (await demoPropertyIds(s)).has(e.propertyId ?? '')
  const rows = ((data ?? []) as any[]).filter(b => !!b.is_practice === practice)
  const surname = e.tenantName.split(' ').pop()?.toLowerCase() ?? ''
  const ref = (e.paymentRef ?? '').toLowerCase().replace(/\s/g, '')
  return rows.map(b => {
    const text = `${b.description ?? ''} ${b.extracted_ref ?? ''}`.toLowerCase()
    const exact = Math.abs(Number(b.amount) - e.balanceDue) < 0.005
    const near = !exact && Math.abs(Number(b.amount) - e.balanceDue) <= 1
    const named = (surname.length > 2 && text.includes(surname)) || (ref.length > 3 && text.replace(/\s/g, '').includes(ref))
    const score = (exact ? 3 : near ? 1 : 0) + (named ? 2 : 0)
    return { id: b.id, number: b.txn_no, date: b.transaction_date, amount: Number(b.amount), description: b.description ?? '', why: [exact ? 'exact amount' : near ? 'amount within £1' : '', named ? 'name or reference matches' : ''].filter(Boolean).join(' · '), score }
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score || a.date.localeCompare(b.date)).slice(0, 8)
}

export async function current(s: SupabaseClient, tenancyId: string) {
  const { data: rec } = await s.from('initial_monies').select('*, bank_transactions(txn_no, transaction_date, amount, description)').eq('tenancy_id', tenancyId).is('voided_at', null).maybeSingle()
  if (!rec) return null
  const { data: tr } = await s.from('office_transfers').select('id, txn_no, amount, transferred_on, reference').eq('initial_monies_id', (rec as any).id).is('voided_at', null).maybeSingle()
  return { ...(rec as any), feeTransfer: tr ?? null }
}

const isDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
const money = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n < 1e7 ? r2(n) : null }

export async function receive(s: SupabaseClient, tenancyId: string, b: any, by: { personId: string; email: string }) {
  const e = await expectedFor(s, tenancyId)
  if ('error' in e) return { error: e.error, status: 404 }
  const balance = money(b.balanceAmount), fee = money(b.fee)
  if (balance == null) return { error: 'Enter the balance received', status: 400 }
  if (fee == null) return { error: 'Enter the tenant-find fee (0 if none)', status: 400 }
  if (!isDate(b.receivedOn)) return { error: 'Enter the date the balance arrived', status: 400 }
  const toLandlord = r2(e.holding + balance - fee)
  if (toLandlord < 0) return { error: 'The fee is more than the money received', status: 400 }
  let bankId: string | null = null
  if (b.bankTransactionId) {
    const { data: bt } = await s.from('bank_transactions').select('id, status, amount, is_practice').eq('id', b.bankTransactionId).maybeSingle() as { data: any }
    if (!bt || !['unmatched', 'possible_duplicate'].includes(bt.status)) return { error: 'That bank line is already matched to something else', status: 409 }
    if (!!bt.is_practice !== (await demoPropertyIds(s)).has(e.propertyId ?? '')) return { error: bt.is_practice ? 'That’s a practice bank line — it can’t pay a real let' : 'That’s a real bank line — it can’t pay a practice let', status: 400 }
    bankId = bt.id
  }
  const { data: rec, error } = await s.from('initial_monies').insert({
    tenancy_id: tenancyId, property_id: e.propertyId, landlord_id: e.landlordId, holding_deposit_id: e.holdingId, holding_amount: e.holding,
    balance_amount: balance, received_on: b.receivedOn, bank_transaction_id: bankId, first_rent: e.firstRent, deposit: e.deposit,
    fee, to_landlord: toLandlord, notes: String(b.notes ?? '').slice(0, 500) || null, created_by: by.personId,
  }).select('id, txn_no').single()
  if (error) return { error: /one_per_tenancy/.test(error.message) ? 'Initial monies are already recorded for this tenancy' : /initial_monies/.test(error.message) && /does not exist|schema cache/.test(error.message) ? 'Run migration 231 in Supabase first' : error.message, status: 400 }
  // the bank line is now accounted for (no longer in suspense); the holding deposit is used up; the fee is the
  // tenancy's letting fee (numbered LETF); the move-in money step is done
  if (bankId) await s.from('bank_transactions').update({ status: 'matched', matched_at: new Date().toISOString(), matched_by: by.personId }).eq('id', bankId)
  if (e.holdingId) await s.from('holding_deposits').update({ status: 'applied', outcome_on: b.receivedOn, outcome_by: by.email, outcome_at: new Date().toISOString(), outcome_reason: `Part of initial monies ${(rec as any).txn_no}` }).eq('id', e.holdingId).eq('status', 'held')
  await s.from('tenancies').update({ letting_fee_charged: fee || null, move_in_monies_received_at: b.receivedOn }).eq('id', tenancyId)
  await logTenancyEvent(s, tenancyId, 'initial_monies', `Initial monies ${(rec as any).txn_no}: £${(e.holding + balance).toFixed(2)} received (holding £${e.holding.toFixed(2)} + balance £${balance.toFixed(2)}${bankId ? ', matched to the bank' : ''}) · tenant-find fee £${fee.toFixed(2)} · £${toLandlord.toFixed(2)} for the landlord`, by.email)
  return { ok: true, id: (rec as any).id, number: (rec as any).txn_no }
}

export async function pay(s: SupabaseClient, tenancyId: string, b: any, by: { email: string }) {
  const rec = await current(s, tenancyId)
  if (!rec) return { error: 'Record the initial monies first', status: 400 }
  if (rec.paid_on) return { error: 'The landlord is already recorded as paid', status: 409 }
  if (!isDate(b.paidOn)) return { error: 'Enter the date the payment went', status: 400 }
  const { data, error } = await s.from('initial_monies').update({ amount_paid: rec.to_landlord, paid_on: b.paidOn, paid_reference: String(b.reference ?? '').slice(0, 120) || null }).eq('id', rec.id).select('payout_no').single()
  if (error) return { error: error.message, status: 400 }
  await logTenancyEvent(s, tenancyId, 'initial_monies_paid', `Landlord paid £${Number(rec.to_landlord).toFixed(2)} on ${b.paidOn} · ${(data as any).payout_no}${b.reference ? ` · ref ${b.reference}` : ''}`, by.email)
  return { ok: true, number: (data as any).payout_no }
}

export async function transferFee(s: SupabaseClient, tenancyId: string, b: any, by: { personId: string; email: string }) {
  const rec = await current(s, tenancyId)
  if (!rec) return { error: 'Record the initial monies first', status: 400 }
  if (!(Number(rec.fee) > 0)) return { error: 'There’s no fee to transfer', status: 400 }
  if (rec.feeTransfer) return { error: 'The fee transfer is already recorded', status: 409 }
  if (!isDate(b.transferredOn)) return { error: 'Enter the date of the transfer', status: 400 }
  // a practice let's transfer must take a practice number (XTRF) — migration 232 teaches the numbering that
  if ((await demoPropertyIds(s)).has(rec.property_id ?? '')) {
    const { data: ready } = await s.rpc('cros_is_practice', { j: { initial_monies_id: rec.id } })
    if (ready !== true) return { error: 'Run migration 232 in Supabase first — until then this practice transfer would take a real TRF number', status: 400 }
  }
  const { data, error } = await s.from('office_transfers').insert({ initial_monies_id: rec.id, kind: 'fees', amount: Number(rec.fee), transferred_on: b.transferredOn, reference: String(b.reference ?? '').slice(0, 120) || null, created_by: by.personId }).select('txn_no').single()
  if (error) return { error: error.message, status: 400 }
  await logTenancyEvent(s, tenancyId, 'initial_monies_fee', `Tenant-find fee £${Number(rec.fee).toFixed(2)} moved to the operations account on ${b.transferredOn} · ${(data as any).txn_no}${b.reference ? ` · ref ${b.reference}` : ''}`, by.email)
  return { ok: true, number: (data as any).txn_no }
}

export async function voidRecord(s: SupabaseClient, tenancyId: string, b: any, by: { personId: string; email: string }) {
  const rec = await current(s, tenancyId)
  if (!rec) return { error: 'Nothing to void', status: 400 }
  const reason = String(b.reason ?? '').trim()
  if (!reason) return { error: 'Say why it’s being voided — it stays on record', status: 400 }
  const now = new Date().toISOString()
  if (rec.feeTransfer) await s.from('office_transfers').update({ voided_at: now, voided_by: by.personId, void_reason: reason }).eq('id', rec.feeTransfer.id)
  await s.from('initial_monies').update({ voided_at: now, voided_by: by.personId, void_reason: reason }).eq('id', rec.id)
  if (rec.bank_transaction_id) await s.from('bank_transactions').update({ status: 'unmatched', matched_at: null, matched_by: null }).eq('id', rec.bank_transaction_id)
  if (rec.holding_deposit_id) await s.from('holding_deposits').update({ status: 'held', outcome_on: null, outcome_by: null, outcome_at: null, outcome_reason: null }).eq('id', rec.holding_deposit_id).eq('status', 'applied')
  await logTenancyEvent(s, tenancyId, 'initial_monies_void', `Initial monies ${rec.txn_no} voided: ${reason}`, by.email)
  return { ok: true }
}
