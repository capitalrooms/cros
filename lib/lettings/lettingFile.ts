// The letting file: everything about one tenancy, from let agreed to moved out, for /admin/lettings/<tenancy>.
// Read from the records that already hold it — tenancy, holding deposits (198), move-in pack (187), rent charges,
// the tenant's statement of account, generated documents, tenancy events (199) — so nothing is kept twice. Server-only (service client).

import { formalName } from '@/lib/people'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadPackContext, moneySummary } from '@/lib/movein/pack'
import { tenantAccount } from '@/lib/finance/tenantAccount'

export type LetStage = 'let_agreed' | 'live' | 'on_notice' | 'ended' | 'fell_through'
export const STAGE_LABEL: Record<LetStage, string> = {
  let_agreed: 'Let agreed', live: 'Live', on_notice: 'On notice', ended: 'Ended', fell_through: 'Fell through',
}

export type StepId = 'offer' | 'holding' | 'referencing' | 'right_to_rent' | 'agreement' | 'monies' | 'deposit' | 'keys' | 'move_in'
export interface Step { id: StepId; label: string; done: boolean; date: string | null; sub: string }

// The tenancy columns each tick-off step writes (migration 199, plus the existing deposit columns)
export const STEP_COLUMNS = {
  referencing_sent: 'referencing_sent_at',
  referencing_passed: 'referencing_passed_at',
  right_to_rent: 'right_to_rent_checked_at',
  agreement_sent: 'agreement_sent_at',
  agreement_signed: 'agreement_signed_at',
  monies: 'move_in_monies_received_at',
  deposit_protected: 'deposit_protected_at',
  prescribed_info: 'prescribed_info_served_at',
  keys: 'keys_handed_at',
} as const
export type StepKey = keyof typeof STEP_COLUMNS
export const STEP_NAMES: Record<StepKey, string> = {
  referencing_sent: 'Referencing sent to Homeppl', referencing_passed: 'Referencing passed',
  right_to_rent: 'Right to Rent checked', agreement_sent: 'Agreement sent for signing', agreement_signed: 'Agreement signed',
  monies: 'Move-in monies received', deposit_protected: 'Deposit protected', prescribed_info: 'Prescribed information served',
  keys: 'Keys handed over',
}

const todayIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const name = (p: any) => p ? ([p.first_name, p.last_name].filter(Boolean).join(' ') || p.full_name || p.company || p.email || '') : ''

export function stageOf(t: { let_cancelled_at?: string | null; start_date?: string | null; end_date?: string | null; notice_received_date?: string | null }, today = todayIso()): LetStage {
  if (t.let_cancelled_at) return 'fell_through'
  if (t.end_date && t.end_date < today) return 'ended'
  if (t.start_date && t.start_date > today) return 'let_agreed'
  if (t.notice_received_date) return 'on_notice'
  return 'live'
}

export async function loadLettingFile(s: SupabaseClient, tenancyId: string) {
  const today = todayIso()
  const { data: t, error } = await s.from('tenancies')
    .select('*, people!person_id(id, salutation, first_name, middle_name, last_name, full_name, email, phone, occupation, right_to_rent_until, applicant_id), rooms(id, name, unit_code, status), properties(id, name, address, postcode, property_code, letting_type, landlord_id)')
    .eq('id', tenancyId).maybeSingle() as { data: any; error: any }
  if (error) return { error: error.message }
  if (!t) return { error: 'Tenancy not found' }

  const prop = t.properties ?? {}
  const room = t.rooms ?? {}
  const applicantId = t.applicant_id ?? t.people?.applicant_id ?? null

  // the move-in money is worked out alongside the other reads rather than after them
  const packCtxP = loadPackContext(s, tenancyId).catch(e => { console.warn('letting file: move-in money not worked out', e); return null })
  const [landlordQ, holdQ, applicantQ, roomTenQ, account, docsQ, propDocsQ, eventsQ, packsQ, returnsQ] = await Promise.all([
    prop.landlord_id ? s.from('people').select('id, salutation, first_name, last_name, full_name, company, email, phone').eq('id', prop.landlord_id).maybeSingle() : Promise.resolve({ data: null }),
    s.from('holding_deposits').select('*').or(`tenancy_id.eq.${tenancyId}${applicantId ? `,applicant_id.eq.${applicantId}` : ''}`).order('recorded_at'),
    applicantId ? s.from('applicants').select('*').eq('id', applicantId).maybeSingle() : Promise.resolve({ data: null }),
    t.room_id ? s.from('tenancies').select('id, start_date, end_date, notice_received_date, let_cancelled_at, people!person_id(id, first_name, last_name, full_name)').eq('room_id', t.room_id).neq('id', tenancyId) : Promise.resolve({ data: [] }),
    t.room_id && t.start_date ? tenantAccount(s, tenancyId).catch(() => null) : Promise.resolve(null),
    s.from('generated_documents').select('id, kind, number, title, recipient_name, total, created_at, emailed_at, emailed_to').eq('tenancy_id', tenancyId).is('deleted_at', null).order('created_at', { ascending: false }),
    s.from('property_documents').select('id, document_type, file_name, storage_url, uploaded_at, description').eq('tenancy_id', tenancyId).order('uploaded_at', { ascending: false }),
    s.from('tenancy_events').select('id, kind, note, at, by_email').eq('tenancy_id', tenancyId).order('at', { ascending: false }).limit(200),
    s.from('tenancy_packs').select('id, status, sent_at, first_viewed_at, confirmed_at, confirmed_name').eq('tenancy_id', tenancyId).order('sent_at', { ascending: false }),
    s.from('deposit_returns').select('id, txn_no, status, to_tenant, to_landlord, returned_on').eq('tenancy_id', tenancyId).maybeSingle(),
  ])

  const holds = ((holdQ as any).data ?? []) as any[]
  const liveHold = holds.find(h => h.status === 'held' || h.status === 'applied') ?? null
  const packs = ((packsQ as any).data ?? []) as any[]
  const pack = packs.find(p => p.status !== 'withdrawn') ?? null
  const otherTenancies = ((roomTenQ as any).data ?? []).filter((o: any) => !o.let_cancelled_at)
  const outgoing = otherTenancies.find((o: any) => o.start_date <= today && (!o.end_date || o.end_date >= today) && o.notice_received_date) ?? null
  const incomingNext = otherTenancies.find((o: any) => o.start_date > today) ?? null
  const applicant = (applicantQ as any).data

  let money: ReturnType<typeof moneySummary> | null = null
  let moneyWarnings: string[] = []
  try {
    const ctx = await packCtxP
    if (ctx) { money = moneySummary(ctx); moneyWarnings = ctx.warnings }
  } catch (e) { console.warn('letting file: move-in money not worked out', e) }

  // The deadline for agreement (Tenant Fees Act): 15 days after the holding deposit, unless agreed otherwise
  const deadline = liveHold ? addDays(liveHold.received_on, 15) : null

  const steps: Step[] = [
    { id: 'offer', label: 'Offer accepted', done: !!applicant || !!liveHold, date: applicant?.submitted_at?.slice(0, 10) ?? null, sub: applicant ? 'Application in' : '' },
    { id: 'holding', label: 'Holding deposit', done: !!liveHold, date: liveHold?.received_on ?? null, sub: liveHold ? `${liveHold.hold_no}` : 'Not recorded' },
    { id: 'referencing', label: 'Referencing', done: !!t.referencing_passed_at, date: t.referencing_passed_at ?? t.referencing_sent_at ?? null, sub: t.referencing_passed_at ? 'Passed' : t.referencing_sent_at ? 'With Homeppl' : 'Homeppl' },
    { id: 'right_to_rent', label: 'Right to Rent', done: !!t.right_to_rent_checked_at, date: t.right_to_rent_checked_at ?? null, sub: t.right_to_rent_checked_at ? 'Checked' : `Before ${t.start_date ?? 'move-in'}` },
    { id: 'agreement', label: 'Agreement', done: !!t.agreement_signed_at, date: t.agreement_signed_at ?? t.agreement_sent_at ?? null, sub: t.agreement_signed_at ? 'Signed' : t.agreement_sent_at ? 'Sent for signing' : deadline ? `Sign by ${deadline}` : 'Not sent' },
    { id: 'monies', label: 'Move-in monies', done: !!t.move_in_monies_received_at, date: t.move_in_monies_received_at ?? null, sub: t.move_in_monies_received_at ? 'Received' : money ? `£${money.amountDue.toFixed(2)} due` : 'Due by move-in' },
    { id: 'deposit', label: 'Deposit protected', done: !!t.deposit_protected_at || !!t.deposit_protection_assumed, date: t.deposit_protected_at ?? null, sub: t.deposit_protected_at ? (t.deposit_scheme || 'Protected') : 'Within 30 days' },
    { id: 'keys', label: 'Keys & check-in', done: !!t.keys_handed_at, date: t.keys_handed_at ?? null, sub: t.keys_handed_at ? 'Handed over' : 'Inventory, keys' },
    { id: 'move_in', label: 'Move in', done: !!t.start_date && t.start_date <= today, date: t.start_date ?? null, sub: t.start_date ?? 'Date to agree' },
  ]

  return {
    file: {
      tenancy: t,
      stage: stageOf(t, today),
      today,
      tenant: { id: t.people?.id ?? t.person_id, name: name(t.people), formalName: t.people ? formalName(t.people) : '', email: t.people?.email ?? null, phone: t.people?.phone ?? null, occupation: t.people?.occupation ?? null, rightToRentUntil: t.people?.right_to_rent_until ?? null },
      room: { id: room.id, name: room.name ?? '', unitCode: room.unit_code ?? null, status: room.status ?? null },
      property: { id: prop.id, name: prop.name ?? '', address: prop.address ?? '', postcode: prop.postcode ?? '', code: prop.property_code ?? null, lettingType: prop.letting_type ?? null },
      landlord: (landlordQ as any).data ? { id: (landlordQ as any).data.id, name: name((landlordQ as any).data), email: (landlordQ as any).data.email, phone: (landlordQ as any).data.phone } : null,
      applicant,
      holds,
      liveHold,
      deadline,
      pack,
      steps,
      currentStep: (steps.find(x => !x.done)?.id ?? 'move_in') as StepId,
      money,
      moneyWarnings,
      account: account ? { lines: account.lines, charged: account.charged, paid: account.paid, balance: account.balance } : null,
      documents: (docsQ as any).data ?? [],
      files: (propDocsQ as any).data ?? [],
      events: (eventsQ as any).data ?? [],
      eventsReady: !(eventsQ as any).error,
      outgoing: outgoing ? { id: outgoing.id, name: name(outgoing.people), personId: outgoing.people?.id, endDate: outgoing.end_date } : null,
      incoming: incomingNext ? { id: incomingNext.id, name: name(incomingNext.people), personId: incomingNext.people?.id, startDate: incomingNext.start_date } : null,
      depositReturn: (returnsQ as any).data ?? null,
    },
  }
}

export type LettingFile = NonNullable<Awaited<ReturnType<typeof loadLettingFile>>['file']>
