// Compares the management agreement as sent with what the landlord confirmed in their onboarding
// form, and builds the updated agreement from their confirmed details — names, company, addresses, properties
// and nominated account. Each difference can be accepted or refused by the office (Harry, 13 Oct 2026: "we would
// just need to be able to accept their adjustments"); refused ones keep what the agreement said. The keys refused
// are kept on the record (form_data.__agreement_reject) so the preview, the approval and the saved agreement on
// the Agreements page (formPatch — "and repopulate") all agree.
import type { ManagementAgreementData } from '@/lib/managementAgreement/generatePDF'

export interface AgreementDiff { key: string; field: string; inAgreement: string; fromLandlord: string; accepted: boolean }
export interface AgreementCheck {
  hasSnapshot: boolean
  diffs: AgreementDiff[]
  updated?: ManagementAgreementData
  /** the accepted changes in the shape the Agreements page saves (management_agreements.form) */
  formPatch?: Record<string, unknown>
}

type F = Record<string, unknown>
const s = (f: F, k: string) => (typeof f[k] === 'string' ? (f[k] as string).trim() : '')
const squash = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '')
const join = (parts: string[]) => parts.map(p => p.trim()).filter(Boolean).join(', ')
const addr = (line1: string, line2: string, town: string, postcode: string) => ({ line1, line2, town, county: '', postcode })

export function checkAgreement(f: F): AgreementCheck {
  const snap = f.__agreement as (ManagementAgreementData & { sent_at?: string; version?: number }) | undefined
  if (!snap) return { hasSnapshot: false, diffs: [] }
  const rejected = new Set(Array.isArray(f.__agreement_reject) ? (f.__agreement_reject as string[]) : [])
  const diffs: AgreementDiff[] = []
  const updated: ManagementAgreementData = { ...snap }
  const formPatch: Record<string, unknown> = {}
  /** Record a difference; returns true when the landlord's version should be used. */
  const change = (key: string, field: string, before: string, after: string): boolean => {
    if (!after || squash(before) === squash(after)) return false
    const accepted = !rejected.has(key)
    diffs.push({ key, field, inAgreement: before || '—', fromLandlord: after, accepted })
    return accepted
  }

  const company = s(f, 'entity_type') === 'company'
  if (company) {
    if (change('company_name', 'Company name', snap.companyName ?? '', s(f, 'company_name'))) { updated.companyName = s(f, 'company_name'); formPatch.companyName = updated.companyName }
    // a UK overseas entity number (OE…) was entered as the company number when the agreement was sent
    const sentReg = snap.companyReg ?? ''
    const reg = /^OE\d+$/i.test(sentReg.replace(/\s/g, '')) && s(f, 'overseas_entity_id') ? s(f, 'overseas_entity_id') : s(f, 'company_reg')
    if (change('company_reg', 'Company number', sentReg, reg)) { updated.companyReg = reg; formPatch.companyReg = reg }
    if (change('company_country', 'Registered in', snap.companyCountry ?? '', s(f, 'company_country'))) { updated.companyCountry = s(f, 'company_country'); formPatch.companyCountry = updated.companyCountry }
    const office = s(f, 'registered_office').split(/\n|,/).map(x => x.trim()).filter(Boolean)
    if (office.length && change('client_address', 'Registered office', join(snap.clientAddress ?? []), join(office))) {
      updated.clientAddress = office
      formPatch.clientAddrValue = addr(office[0] ?? '', office.length > 3 ? office.slice(1, -2).join(', ') : '', office.length > 2 ? office[office.length - 2] : office[1] ?? '', office.length > 1 ? office[office.length - 1] : '')
    }
  } else {
    const name1 = [s(f, 'salutation'), s(f, 'first_name'), s(f, 'last_name')].filter(Boolean).join(' ')
    const before1 = [snap.clientTitle, snap.clientFirstName, snap.clientLastName].filter(Boolean).join(' ')
    if (s(f, 'first_name') && change('client_name', 'Landlord name', before1, name1)) {
      Object.assign(updated, { clientTitle: s(f, 'salutation') || snap.clientTitle, clientFirstName: s(f, 'first_name'), clientLastName: s(f, 'last_name') })
      Object.assign(formPatch, { clientTitle: updated.clientTitle, clientFirst: updated.clientFirstName, clientLast: updated.clientLastName })
    }

    const joint = f.joint === 'yes'
    const before2 = [snap.client2Title, snap.client2FirstName, snap.client2LastName].filter(Boolean).join(' ')
    const after2 = joint ? [s(f, 'j_salutation'), s(f, 'j_first_name'), s(f, 'j_last_name')].filter(Boolean).join(' ') : ''
    if (joint ? change('joint_name', 'Joint landlord', before2, after2) : (before2 && f.joint === 'no' && change('joint_name', 'Joint landlord', before2, 'None — sole landlord'))) {
      Object.assign(updated, joint
        ? { client2Title: s(f, 'j_salutation') || snap.client2Title, client2FirstName: s(f, 'j_first_name'), client2LastName: s(f, 'j_last_name') }
        : { client2Title: undefined, client2FirstName: undefined, client2LastName: undefined })
      Object.assign(formPatch, joint
        ? { hasJointLandlord: true, client2Title: updated.client2Title, client2First: updated.client2FirstName, client2Last: updated.client2LastName }
        : { hasJointLandlord: false })
    }

    const home = [s(f, 'addr_line1'), s(f, 'addr_line2'), s(f, 'addr_town'), s(f, 'addr_postcode')].filter(Boolean)
    if (home.length && change('client_address', 'Client address', join(snap.clientAddress ?? []), join(home))) {
      updated.clientAddress = home
      formPatch.clientAddrValue = addr(s(f, 'addr_line1'), s(f, 'addr_line2'), s(f, 'addr_town'), s(f, 'addr_postcode'))
    }
  }

  const multiple = s(f, 'property_count') === 'multiple'
  const propRows = multiple
    ? ((f.properties as Array<Record<string, string>> | undefined) ?? []).filter(p => p.line1 || p.town)
    : [{ line1: s(f, 'prop_line1'), line2: s(f, 'prop_line2'), town: s(f, 'prop_town'), postcode: s(f, 'prop_postcode') }].filter(p => p.line1 || p.town)
  const props = propRows.map(p => join([p.line1, p.line2, p.town, p.postcode])).filter(Boolean)
  if (props.length && change('properties', props.length > 1 ? 'Properties' : 'Property', (snap.properties ?? []).map(p => p.replace(/\n/g, ', ')).join(' | '), props.join(' | '))) {
    updated.properties = props
    formPatch.propAddresses = propRows.map(p => addr(p.line1 ?? '', p.line2 ?? '', p.town ?? '', p.postcode ?? ''))
  }

  if (s(f, 'account_number') && s(f, 'sort_code')) {
    const acc = { accountName: s(f, 'account_holder'), bankName: s(f, 'bank_name'), sortCode: s(f, 'sort_code'), accountNumber: s(f, 'account_number') }
    const before = snap.nominatedAccount ? `${snap.nominatedAccount.sortCode} ${snap.nominatedAccount.accountNumber}` : ''
    if (change('nominated_account', 'Nominated bank account', before || 'Not stated', `${acc.accountName} · ${acc.bankName} · ${acc.sortCode} · ${acc.accountNumber}`)) updated.nominatedAccount = acc
  }

  updated.agreementDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  return { hasSnapshot: true, diffs, updated, formPatch }
}
