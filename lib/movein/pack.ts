// Move-in pack: everything a new tenant receives after referencing, built from the tenancy record.
//   • the tenancy agreement and the check-in balance — generated from the SAME first-rent figure
//   • the property's gas safety certificate, EICR and EPC — the latest uploaded to that property
//   • the statutory and house guides — public/tenancy-pack/*
// The tenant gets one link (/pack/<token>) to view or download each, and confirms they've read them.
import type { SupabaseClient } from '@supabase/supabase-js'
import { firstRentPayment, parseTenancyDate, ukLongDate, type FirstRent } from '@/lib/tenancy/firstRent'
import { buildPaymentRef } from '@/lib/tenancy/paymentRef'
import { landlordFormalNames, formalName } from '@/lib/people'
import { fullAddress } from '@/lib/quotes/quoteRequest'
import { generateTenancyAgreement } from '@/lib/tenancyAgreement/generate'
import { generateCheckInBalancePDF } from '@/lib/checkInBalance/generatePDF'
import { fetchPDFBizSettings } from '@/lib/pdfLetterhead'

// Rent and deposits for managed tenancies go to the client account (Harry, 27 Sep 2026).
export const CLIENT_ACCOUNT = {
  name: 'Capital Rooms Ltd', bank: 'Barclays', sortCode: '20-18-93', accountNo: '4016 2574',
  iban: 'GB19 BUKB 2018 9340 1625 74', swift: 'BUKBGB22',
}

export type DocGroup = 'Your tenancy' | 'Safety certificates' | 'Your deposit' | 'Your rights' | 'Living in the house'
export interface PackDoc {
  key: string
  label: string
  group: DocGroup
  source: 'generated' | 'property' | 'static'
  url?: string              // property + static documents
  available: boolean        // false = not uploaded yet (shown to the tenant as "to follow")
  note?: string             // e.g. "Expires 12 March 2027"
  include: boolean          // ticked by default
}

const STATIC: Omit<PackDoc, 'available' | 'source'>[] = [
  { key: 'renters_rights', label: 'Renters’ Rights Act information sheet', group: 'Your rights', url: '/tenancy-pack/renters-rights-act-information-sheet-2026.pdf', include: true },
  { key: 'prescribed_info', label: 'Deposit prescribed information', group: 'Your deposit', url: '/tenancy-pack/deposit-prescribed-information.pdf', include: true },
  { key: 'deposit_guide', label: 'Deposit protection — a guide for tenants', group: 'Your deposit', url: '/tenancy-pack/deposit-protection-guide.pdf', include: true },
  { key: 'fire_doors', label: 'Fire door guide', group: 'Living in the house', url: '/tenancy-pack/fire-door-guide.pdf', include: true },
  { key: 'legionnaires', label: 'Legionnaires’ guide', group: 'Living in the house', url: '/tenancy-pack/legionnaires-guide.pdf', include: true },
  { key: 'mould', label: 'Mould & condensation guide', group: 'Living in the house', url: '/tenancy-pack/mould-and-condensation-guide.pdf', include: true },
  { key: 'jedi', label: 'Be a Jedi housemate', group: 'Living in the house', url: '/tenancy-pack/jedi-housemate-guide.pdf', include: true },
  { key: 'checking_out', label: 'Checking out guide', group: 'Living in the house', url: '/tenancy-pack/checking-out-guide.pdf', include: true },
  { key: 'guarantor_form', label: 'Guarantor form', group: 'Your tenancy', url: '/tenancy-pack/guarantor-form.pdf', include: false },
]

const CERTS: { key: string; label: string; types: string[] }[] = [
  { key: 'gas', label: 'Gas safety certificate', types: ['gas_safety_certificate'] },
  { key: 'eicr', label: 'Electrical safety report (EICR)', types: ['electrical_eicr', 'eicr', 'electrical_certificate'] },
  { key: 'epc', label: 'Energy performance certificate (EPC)', types: ['epc'] },
]
const CERT_EXPIRY_COL: Record<string, string> = { gas: 'gas_safe_cert_expiry', eicr: 'electrical_cert_expiry', epc: 'epc_expiry' }

export interface PackContext {
  tenancyId: string
  tenant: { id: string; name: string; formalName: string; firstName: string; email: string }
  room: { id: string; name: string }
  property: { id: string; name: string; address: string; propertyId: string }
  address: string                   // "Room 5, 208 Rotherhithe Street, London, SE16 7RB"
  landlordName: string
  startDate: string | null          // YYYY-MM-DD
  rentMonthly: number
  rentDueDay: number
  deposit: number
  holdingDeposit: number
  paymentRef: string
  paymentRefStored: boolean
  first: FirstRent | null
  amountDue: number
  payBy: string | null              // YYYY-MM-DD — cleared funds 24h before check-in
  warnings: string[]
  lettingType: string | null      // 'let_only' → the let-only agreement; otherwise the Capital Rooms one
  documents: PackDoc[]
}

const gbp = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const ordinal = (n: number) => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th')
const agreementDate = (d: Date) => `${ordinal(d.getDate())} ${d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`

export async function loadPackContext(s: SupabaseClient, tenancyId: string): Promise<PackContext | null> {
  const { data: t } = await s.from('tenancies')
    .select('id, start_date, rent_amount, rent_due_day, deposit_amount, holding_deposit_received, payment_reference, person_id, room_id, property_id, people!person_id(id, salutation, first_name, middle_name, last_name, full_name, email), rooms(id, name)')
    .eq('id', tenancyId).maybeSingle()
  if (!t) return null
  const { data: prop } = await s.from('properties').select('*').eq('id', (t as any).property_id).maybeSingle()
  const [{ data: landlord }, { data: docs }] = await Promise.all([
    prop?.landlord_id ? s.from('people').select('*').eq('id', prop.landlord_id).maybeSingle() : Promise.resolve({ data: null }),
    s.from('property_documents').select('document_type, storage_url, file_name, uploaded_at').eq('property_id', (t as any).property_id).order('uploaded_at', { ascending: false }),
  ])

  const p = (t as any).people ?? {}
  const room = (t as any).rooms ?? { id: (t as any).room_id, name: '' }
  const tenantName = [p.first_name, p.last_name].filter(Boolean).join(' ') || p.full_name || 'Tenant'
  const houseAddress = fullAddress(prop?.name, prop?.address, prop?.postcode)
  const rentMonthly = Number(t.rent_amount || 0)
  const rentDueDay = Number(t.rent_due_day || 1)
  const deposit = Number(t.deposit_amount || 0)
  const holdingDeposit = Number(t.holding_deposit_received || 0)
  const first = t.start_date ? firstRentPayment(t.start_date, rentMonthly, rentDueDay) : null
  const generatedRef = buildPaymentRef(prop?.name || prop?.address || '', room.name)
  const start = parseTenancyDate(t.start_date)
  const payBy = start ? iso(new Date(start.getTime() - 86_400_000)) : null

  const weekly = (rentMonthly * 12) / 52
  const warnings: string[] = []
  if (!t.start_date) warnings.push('Add the move-in date.')
  if (!rentMonthly) warnings.push('Add the monthly rent.')
  if (!p.email) warnings.push('The tenant has no email address.')
  if (!deposit) warnings.push('No deposit amount — check whether one is being taken.')
  if (deposit > Math.round(weekly * 5 * 100) / 100 + 0.01) warnings.push(`The deposit is more than 5 weeks’ rent (${gbp(weekly * 5)}) — the legal cap.`)
  if (holdingDeposit > Math.round(weekly * 100) / 100 + 0.01) warnings.push(`The holding deposit is more than 1 week’s rent (${gbp(weekly)}) — the legal cap.`)

  const certDocs: PackDoc[] = CERTS.map(c => {
    const doc = (docs ?? []).find((d: any) => c.types.includes(String(d.document_type)))
    const expiry = prop?.[CERT_EXPIRY_COL[c.key]] as string | null | undefined
    const expired = expiry && expiry < iso(new Date())
    if (expired) warnings.push(`The ${c.label.toLowerCase()} on file expired on ${ukLongDate(parseTenancyDate(expiry)!)}.`)
    return {
      key: c.key, label: c.label, group: 'Safety certificates', source: 'property',
      url: doc?.storage_url, available: !!doc?.storage_url, include: true,
      note: !doc ? 'Not uploaded yet — shown to the tenant as “to follow”' : expiry ? `${expired ? 'Expired' : 'Valid until'} ${ukLongDate(parseTenancyDate(expiry)!)}` : undefined,
    }
  })

  const documents: PackDoc[] = [
    { key: 'agreement', label: 'Tenancy agreement', group: 'Your tenancy', source: 'generated', available: true, include: true },
    { key: 'check_in', label: 'Check-in balance', group: 'Your tenancy', source: 'generated', available: true, include: true },
    ...certDocs,
    ...STATIC.map(d => ({ ...d, source: 'static' as const, available: true })),
  ]

  // formalName = title, first, middle and surname — it goes on the agreement
  return {
    tenancyId,
    tenant: { id: p.id, name: tenantName, formalName: formalName(p) !== '—' ? formalName(p) : tenantName, firstName: p.first_name || tenantName.split(' ')[0], email: p.email || '' },
    room: { id: room.id, name: room.name || '' },
    property: { id: prop?.id, name: prop?.name || '', address: houseAddress, propertyId: prop?.id },
    lettingType: (prop as any)?.letting_type ?? null,
    address: [room.name, houseAddress].filter(Boolean).join(', '),
    landlordName: landlord ? landlordFormalNames(landlord as any) : '',
    startDate: t.start_date, rentMonthly, rentDueDay, deposit, holdingDeposit,
    paymentRef: t.payment_reference || generatedRef,
    paymentRefStored: !!t.payment_reference,
    first,
    amountDue: Math.round(((first?.amount ?? 0) + deposit - holdingDeposit) * 100) / 100,
    payBy, warnings, documents,
  }
}

export function moneySummary(ctx: PackContext) {
  const f = ctx.first
  return {
    startDate: ctx.startDate, rentMonthly: ctx.rentMonthly, rentDueDay: ctx.rentDueDay,
    firstRent: f?.amount ?? null, firstFrom: f ? iso(f.from) : null, firstTo: f ? iso(f.to) : null, firstFull: f?.full ?? null,
    deposit: ctx.deposit, holdingDeposit: ctx.holdingDeposit, amountDue: ctx.amountDue, payBy: ctx.payBy,
    paymentRef: ctx.paymentRef, bank: CLIENT_ACCOUNT,
  }
}

/** The two generated documents — built from the same context, so their figures always match. */
export async function renderAgreement(ctx: PackContext, opts: { parking?: boolean } = {}) {
  const start = parseTenancyDate(ctx.startDate)
  return generateTenancyAgreement({
    // managed tenancies get the Capital Rooms agreement; a let-only (landlord-managed) property gets the let-only one
    template: ctx.lettingType === 'let_only' ? (opts.parking ? 'apt-ns' : 'apt-base') : 'apt-cr',
    tenant_name: ctx.tenant.formalName,
    property_address: ctx.address,
    landlord_name: ctx.landlordName || 'The Landlord',
    start_date: start ? agreementDate(start) : '',
    start_iso: ctx.startDate ?? undefined,
    rent_amount: gbp(ctx.rentMonthly),
    rent_monthly: ctx.rentMonthly,
    rent_due_day: ctx.rentDueDay,
    when_rent_due: ordinal(ctx.rentDueDay),
    deposit: gbp(ctx.deposit),
    tenant_email: ctx.tenant.email,
    bank_account_name: CLIENT_ACCOUNT.name,
    bank_name: CLIENT_ACCOUNT.bank,
    bank_sort_code: CLIENT_ACCOUNT.sortCode,
    bank_account_number: CLIENT_ACCOUNT.accountNo,
    payment_reference: ctx.paymentRef,
  })
}

export async function renderCheckIn(ctx: PackContext) {
  return generateCheckInBalancePDF({
    tenantNames: [ctx.tenant.name],
    propertyAddress: ctx.address,
    rentMonthly: ctx.rentMonthly,
    depositAmount: ctx.deposit,
    holdingDeposit: ctx.holdingDeposit,
    startDate: ctx.startDate || iso(new Date()),
    rentMode: 'prorata',
    rentDueDay: ctx.rentDueDay,
    paymentRef: ctx.paymentRef,
    bankName: CLIENT_ACCOUNT.name,
    sortCode: CLIENT_ACCOUNT.sortCode,
    accountNo: CLIENT_ACCOUNT.accountNo,
    iban: CLIENT_ACCOUNT.iban,
    swift: CLIENT_ACCOUNT.swift,
    bizSettings: await fetchPDFBizSettings(),
  })
}

export const packFileName = (ctx: PackContext, key: 'agreement' | 'check_in') =>
  `${key === 'agreement' ? 'Tenancy Agreement' : 'Check-in Balance'} - ${ctx.address}.pdf`.replace(/[\\/:*?"<>|]/g, '')
