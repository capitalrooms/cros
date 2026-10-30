// Move-in pack: everything a new tenant receives after referencing, built from the tenancy record.
//   • the tenancy agreement and the check-in balance — generated from the SAME first-rent figure
//   • the property's gas safety certificate, EICR and EPC — the latest uploaded to that property
//   • the statutory and house guides — public/tenancy-pack/*
// The tenant gets one link (/pack/<token>) to view or download each, and confirms they've read them.
import { healPropertyCerts } from '@/lib/compliance/certFromDocument'
import type { SupabaseClient } from '@supabase/supabase-js'
import { firstRentPayment, parseTenancyDate, ukLongDate, type FirstRent } from '@/lib/tenancy/firstRent'
import { buildPaymentRef } from '@/lib/tenancy/paymentRef'
import { landlordFormalNames, formalName, dearName } from '@/lib/people'
import { fullAddress } from '@/lib/quotes/quoteRequest'
import { oneLine, placeLabel, isWholeLet } from '@/lib/lettings/letWording'
import { generateTenancyAgreement } from '@/lib/tenancyAgreement/generate'
import { generateSingleLetAgreement } from '@/lib/tenancyAgreement/singleLet'
import { generateCheckInBalancePDF } from '@/lib/checkInBalance/generatePDF'
import { fetchPDFBizSettings } from '@/lib/pdfLetterhead'
import { resolvePropertyAccount, type PayeeAccount } from '@/lib/banking/propertyAccount'
import { open, openFields, openRows, seal, BANK_FIELDS } from '@/lib/crypto/fieldCrypt'

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
  { key: 'apt_guide', label: 'Assured periodic tenancies — a guide for tenants (GOV.UK)', group: 'Your rights', url: '/tenancy-pack/assured-periodic-tenancies-guide.pdf', include: true },
  // the DPS prescribed information form now goes in filled in for this tenancy — a generated document (lib/deposits/
  // dpsForm, 24 Oct 2026); it needs the DPS Terms and Conditions below with it (its note 1)
  { key: 'dps_terms', label: 'DPS Terms and Conditions', group: 'Your deposit', url: '/tenancy-pack/dps-terms-and-conditions.pdf', include: true },
  { key: 'deposit_guide', label: 'Deposit protection — a guide for tenants', group: 'Your deposit', url: '/tenancy-pack/deposit-protection-guide.pdf', include: true },
  { key: 'fire_doors', label: 'Fire door guide', group: 'Living in the house', url: '/tenancy-pack/fire-door-guide.pdf', include: true },
  { key: 'legionnaires', label: 'Legionnaires’ guide', group: 'Living in the house', url: '/tenancy-pack/legionnaires-guide.pdf', include: true },
  { key: 'mould', label: 'Mould & condensation guide', group: 'Living in the house', url: '/tenancy-pack/mould-and-condensation-guide.pdf', include: true },
  { key: 'jedi', label: 'Be a Jedi housemate', group: 'Living in the house', url: '/tenancy-pack/jedi-housemate-guide.pdf', include: true },
  { key: 'checking_out', label: 'Checking out guide', group: 'Living in the house', url: '/tenancy-pack/checking-out-guide.pdf', include: true },
  { key: 'guarantor_form', label: 'Guarantor form', group: 'Your tenancy', url: '/tenancy-pack/guarantor-form.pdf', include: false },
]

const CERTS: { key: string; label: string; types: string[] }[] = [
  { key: 'gas', label: 'Gas safety certificate', types: ['gas_safety_certificate', 'gas_safety'] },   // gas_safety: the upload drawer's old name
  { key: 'eicr', label: 'Electrical safety report (EICR)', types: ['electrical_eicr', 'eicr', 'electrical_certificate', 'electrical_cert'] },
  { key: 'epc', label: 'Energy performance certificate (EPC)', types: ['epc'] },
]
const CERT_EXPIRY_COL: Record<string, string> = { gas: 'gas_safe_cert_expiry', eicr: 'electrical_cert_expiry', epc: 'epc_expiry' }

export interface PackContext {
  tenancyId: string
  // a joint tenancy (co_tenant_id): both tenants are named on the agreement and greeted, and both get the pack
  tenant: { id: string; name: string; formalName: string; firstName: string; dear: string; email: string; names: string[]; formalNames: string[]; emails: string[] }
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
  houseLettingType: string | null // the house's own setting (Details), before any per-pack choice
  lettingType: string | null      // 'let_only' → the let-only agreement; otherwise the Capital Rooms one
  /** a whole house or flat → the single-let agreement (NRLA, lib/tenancyAgreement/singleLet); a room → the APT room agreement */
  wholeLet: boolean
  /** let-only: where the rent goes (the landlord's account saved on the property) and who the tenant contacts */
  landlordBank: PayeeAccount | null   // linked account → house's copy → landlord's default (lib/banking/propertyAccount)
  landlordContact: { address: string; email: string; phone: string } | null
  documents: PackDoc[]
}

const gbp = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const ordinal = (n: number) => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th')
const agreementDate = (d: Date) => `${ordinal(d.getDate())} ${d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`

export type AgreementChoice = 'managed' | 'let_only'
/** ?agreement= / body.agreement → a choice, or null to follow the house's own setting */
export const agreementChoice = (v: unknown): AgreementChoice | null => (v === 'managed' || v === 'let_only' ? v : null)

// The office can choose the agreement per pack (30 Oct 2026, Harry: be sure the right one goes out). The choice drives
// the agreement, whose bank account is printed, and which guides go in — the house's setting is only the default.
export async function loadPackContext(s: SupabaseClient, tenancyId: string, opts: { agreement?: AgreementChoice | null } = {}): Promise<PackContext | null> {
  const { data: t } = await s.from('tenancies')
    .select('id, start_date, rent_amount, rent_due_day, deposit_amount, holding_deposit_received, payment_reference, person_id, room_id, property_id, people!person_id(id, salutation, first_name, middle_name, last_name, full_name, email), co:people!co_tenant_id(id, salutation, first_name, middle_name, last_name, full_name, email), rooms(id, name)')
    .eq('id', tenancyId).maybeSingle()
  if (!t) return null
  // certificates on file whose dates aren't on the house yet are read first (lib/compliance/certFromDocument)
  await healPropertyCerts(s as any, (t as any).property_id, 4).catch(() => null)
  const { data: propRow } = await s.from('properties').select('*').eq('id', (t as any).property_id).maybeSingle()
  const prop = openFields(propRow as any, BANK_FIELDS.properties)   // bank numbers stored encrypted
  const houseLettingType: string | null = (prop as any)?.letting_type ?? null
  const lettingType: string | null = opts.agreement ?? houseLettingType
  const [{ data: landlord }, { data: docs }, landlordBank] = await Promise.all([
    prop?.landlord_id ? s.from('people').select('*').eq('id', prop.landlord_id).maybeSingle() : Promise.resolve({ data: null }),
    s.from('property_documents').select('document_type, storage_url, file_name, uploaded_at').eq('property_id', (t as any).property_id).order('uploaded_at', { ascending: false }),
    resolvePropertyAccount(s, prop).catch(() => null),
  ])

  const p = (t as any).people ?? {}
  const room = (t as any).rooms ?? { id: (t as any).room_id, name: '' }
  const tenantName = [p.salutation, p.first_name, p.last_name].filter(Boolean).join(' ') || p.full_name || 'Tenant'
  const co = (t as any).co ?? null
  const coName = co ? [co.salutation, co.first_name, co.last_name].filter(Boolean).join(' ') || co.full_name || '' : ''
  // one line, never doubled: some houses are named after their address ("75 Crownfield Road, E15 2AB") and some
  // addresses are saved on several lines (lib/lettings/letWording oneLine; fullAddress drops repeated parts)
  const houseAddress = fullAddress(null, oneLine([prop?.name, prop?.address].filter(Boolean).join('\n')), prop?.postcode)
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

  // no gas at the property → no gas safety certificate in the pack (properties.has_gas)
  const certDocs: PackDoc[] = CERTS.filter(c => !(c.key === 'gas' && (prop as any)?.has_gas === false)).map(c => {
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
    // the deposit's prescribed information on the DPS's own form, filled in — managed lets taking a deposit
    ...(deposit > 0 && lettingType !== 'let_only'
      ? [{ key: 'prescribed_info', label: 'Deposit prescribed information (DPS form) — to sign', group: 'Your deposit' as DocGroup, source: 'generated' as const, available: true, include: true }] : []),
    ...certDocs,
    // let-only (Nigel) tenants don't get the housemate and checking-out guides (Harry, 15 Oct 2026)
    ...STATIC.map(d => ({ ...d, source: 'static' as const, available: true, include: d.include && !(lettingType === 'let_only' && (d.key === 'jedi' || d.key === 'checking_out')) && !(isWholeLet((prop as any)?.property_type, room.name) && d.key === 'jedi') })),   // no housemates in a whole home
  ]

  // formalName = title, first, middle and surname — it goes on the agreement
  return {
    tenancyId,
    tenant: {
      id: p.id,
      name: [tenantName, coName].filter(Boolean).join(' and '),
      formalNames: [formalName(p) !== '—' ? formalName(p) : tenantName, co ? (formalName(co) !== '—' ? formalName(co) : coName) : ''].filter(Boolean),
      formalName: [formalName(p) !== '—' ? formalName(p) : tenantName, co ? (formalName(co) !== '—' ? formalName(co) : coName) : ''].filter(Boolean).join(' and '),
      firstName: [p.first_name || tenantName.split(' ')[0], co?.first_name].filter(Boolean).join(' and '),
      dear: [dearName(p), co ? dearName(co) : ''].filter(Boolean).join(' and '),
      email: p.email || '',
      names: [tenantName, coName].filter(Boolean),
      emails: [p.email, co?.email].filter(Boolean),
    },
    room: { id: room.id, name: room.name || '' },
    property: { id: prop?.id, name: prop?.name || '', address: houseAddress, propertyId: prop?.id },
    lettingType,
    houseLettingType,
    wholeLet: isWholeLet((prop as any)?.property_type, room.name),
    landlordBank,
    landlordContact: landlord ? { address: oneLine((landlord as any).home_address || ''), email: (landlord as any).email || '', phone: (landlord as any).phone || '' } : null,
    address: placeLabel(isWholeLet(prop?.property_type, room.name), room.name, houseAddress),   // a whole home: just the address, never "Whole Property, …"
    landlordName: landlord ? landlordFormalNames(landlord as any) : '',
    startDate: t.start_date, rentMonthly, rentDueDay, deposit, holdingDeposit,
    paymentRef: t.payment_reference || generatedRef,
    paymentRefStored: !!t.payment_reference,
    first,
    amountDue: Math.round(((first?.amount ?? 0) + deposit - holdingDeposit) * 100) / 100,
    payBy, warnings, documents,
  }
}

/** Who the tenant pays: on a let-only the landlord collects the first rent and deposit too (Harry, 30 Oct 2026),
 *  so it's the landlord's own account — never the Capital Rooms client account. */
export function payeeBank(ctx: PackContext): { name: string; bank: string; sortCode: string; accountNo: string; iban: string; swift: string } {
  if (ctx.lettingType !== 'let_only') return CLIENT_ACCOUNT
  const b = ctx.landlordBank
  if (!b?.accountNo) throw new Error('Add the landlord’s bank account to this property first (landlord’s page › Bank accounts, then link it to this house) — on a let-only the landlord collects the rent and deposit.')
  return { name: b.name, bank: b.bank, sortCode: b.sortCode, accountNo: b.accountNo, iban: b.iban ?? '', swift: b.swift ?? '' }
}

export function moneySummary(ctx: PackContext) {
  const f = ctx.first
  return {
    startDate: ctx.startDate, rentMonthly: ctx.rentMonthly, rentDueDay: ctx.rentDueDay,
    firstRent: f?.amount ?? null, firstFrom: f ? iso(f.from) : null, firstTo: f ? iso(f.to) : null, firstFull: f?.full ?? null,
    deposit: ctx.deposit, holdingDeposit: ctx.holdingDeposit, amountDue: ctx.amountDue, payBy: ctx.payBy,
    paymentRef: ctx.paymentRef, bank: (() => { try { return payeeBank(ctx) } catch { return null } })(),
  }
}

/** The two generated documents — built from the same context, so their figures always match. */
export async function renderAgreement(ctx: PackContext, opts: { parking?: boolean } = {}) {
  // a whole house or flat: the NRLA single-let agreement with our cover page (15 Oct 2026) — managed or let-only
  if (ctx.wholeLet) {
    const letOnly = ctx.lettingType === 'let_only'
    return generateSingleLetAgreement({
      tenantNames: ctx.tenant.formalNames,
      tenantEmails: ctx.tenant.emails,
      landlordName: ctx.landlordName || 'The Landlord',
      address: ctx.address,
      startDate: ctx.startDate!,
      rentMonthly: ctx.rentMonthly,
      rentDueDay: ctx.rentDueDay,
      deposit: ctx.deposit,
      paymentRef: ctx.paymentRef,
      managedBy: letOnly ? 'let_only' : 'managed',
      bank: letOnly
        ? (ctx.landlordBank ?? { name: '', bank: '', sortCode: '', accountNo: '' })
        : { name: CLIENT_ACCOUNT.name, bank: CLIENT_ACCOUNT.bank, sortCode: CLIENT_ACCOUNT.sortCode, accountNo: CLIENT_ACCOUNT.accountNo, iban: CLIENT_ACCOUNT.iban, swift: CLIENT_ACCOUNT.swift },
      landlordContact: ctx.landlordContact ?? undefined,
      biz: await fetchPDFBizSettings(),
    })
  }
  const start = parseTenancyDate(ctx.startDate)
  // let-only: the rent goes to the landlord's own account, never the Capital Rooms client account
  const letOnly = ctx.lettingType === 'let_only'
  if (letOnly && !ctx.landlordBank?.accountNo) throw new Error('Add the landlord’s bank account to this property first (landlord’s page › Bank accounts, then link it to this house) — the rent goes there on a let-only.')
  const bank = letOnly
    ? { name: ctx.landlordBank!.name, bank: ctx.landlordBank!.bank, sortCode: ctx.landlordBank!.sortCode, accountNo: ctx.landlordBank!.accountNo }
    : { name: CLIENT_ACCOUNT.name, bank: CLIENT_ACCOUNT.bank, sortCode: CLIENT_ACCOUNT.sortCode, accountNo: CLIENT_ACCOUNT.accountNo }
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
    tenant_email: ctx.tenant.emails.join(", "),   // both tenants on a joint tenancy
    bank_account_name: bank.name,
    bank_name: bank.bank,
    bank_sort_code: bank.sortCode,
    bank_account_number: bank.accountNo,
    payment_reference: ctx.paymentRef,
  })
}

export async function renderCheckIn(ctx: PackContext) {
  const payee = payeeBank(ctx)
  return generateCheckInBalancePDF({
    tenantNames: ctx.tenant.names,
    propertyAddress: ctx.address,
    rentMonthly: ctx.rentMonthly,
    depositAmount: ctx.deposit,
    holdingDeposit: ctx.holdingDeposit,
    startDate: ctx.startDate || iso(new Date()),
    rentMode: 'prorata',
    rentDueDay: ctx.rentDueDay,
    paymentRef: ctx.paymentRef,
    bankName: payee.name,
    sortCode: payee.sortCode,
    accountNo: payee.accountNo,
    iban: payee.iban,
    swift: payee.swift,
    bizSettings: await fetchPDFBizSettings(),
  })
}

/** The documents CROS makes for the pack (the rest are fixed files or the property's certificates). */
export type GeneratedKey = 'agreement' | 'check_in' | 'prescribed_info'
export const GENERATED_KEYS: GeneratedKey[] = ['agreement', 'check_in', 'prescribed_info']
/** The ones that are signed — what "Download for signing" gives you for Adobe Sign. */
export const TO_SIGN: string[] = ['agreement', 'prescribed_info', 'guarantor_form']

// The order the documents go into Adobe Sign (Harry, 30 Oct 2026): 1 agreement, 2 guides, 3 prescribed information,
// 4 deposit info leaflet, 5 Renters' Rights guides, 6 certificates at the property. The guarantor form and check-in
// balance sit with the agreement; the DPS Terms and Conditions sit with the leaflet, straight after the prescribed
// information they belong to. Anything not listed goes last.
export const SIGNING_ORDER: string[][] = [
  ['agreement', 'guarantor_form', 'check_in'],
  ['fire_doors', 'legionnaires', 'mould', 'jedi', 'checking_out'],
  ['prescribed_info'],
  ['dps_terms', 'deposit_guide'],
  ['renters_rights', 'apt_guide'],
  ['gas', 'eicr', 'epc'],
]
const SIGNING_RANK = new Map(SIGNING_ORDER.flat().map((k, i) => [k, i]))
export const signingRank = (key: string) => SIGNING_RANK.get(key) ?? SIGNING_RANK.size
const GENERATED_NAME: Record<GeneratedKey, string> = { agreement: 'Tenancy Agreement', check_in: 'Check-in Balance', prescribed_info: 'Deposit Prescribed Information (DPS)' }
export const packFileName = (ctx: PackContext, key: GeneratedKey) =>
  `${GENERATED_NAME[key]} - ${ctx.address}.pdf`.replace(/[\\/:*?"<>|]/g, '')
