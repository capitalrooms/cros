// Compares the management agreement as sent with what the landlord confirmed in their onboarding
// form, and builds the updated agreement (their confirmed names, addresses and nominated account).
import type { ManagementAgreementData } from '@/lib/managementAgreement/generatePDF'

export interface AgreementDiff { field: string; inAgreement: string; fromLandlord: string }
export interface AgreementCheck {
  hasSnapshot: boolean
  diffs: AgreementDiff[]
  updated?: ManagementAgreementData
}

type F = Record<string, unknown>
const s = (f: F, k: string) => (typeof f[k] === 'string' ? (f[k] as string).trim() : '')
const squash = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '')
const join = (parts: string[]) => parts.map(p => p.trim()).filter(Boolean).join(', ')

export function checkAgreement(f: F): AgreementCheck {
  const snap = f.__agreement as (ManagementAgreementData & { sent_at?: string; version?: number }) | undefined
  if (!snap) return { hasSnapshot: false, diffs: [] }
  const diffs: AgreementDiff[] = []
  const updated: ManagementAgreementData = { ...snap }
  const note = (field: string, before: string, after: string) => {
    if (squash(before) !== squash(after)) diffs.push({ field, inAgreement: before || '—', fromLandlord: after || '—' })
  }

  const company = s(f, 'entity_type') === 'company'
  if (company) {
    note('Company name', snap.companyName ?? '', s(f, 'company_name'))
    note('Company number', snap.companyReg ?? '', s(f, 'company_reg'))
    if (s(f, 'company_name')) updated.companyName = s(f, 'company_name')
    if (s(f, 'company_reg')) updated.companyReg = s(f, 'company_reg')
    const office = s(f, 'registered_office').split(/\n|,/).map(x => x.trim()).filter(Boolean)
    if (office.length) { note('Client address', join(snap.clientAddress ?? []), join(office)); updated.clientAddress = office }
  } else {
    const name1 = [s(f, 'salutation'), s(f, 'first_name'), s(f, 'last_name')]
    note('Landlord name', join([snap.clientTitle ?? '', snap.clientFirstName ?? '', snap.clientLastName ?? '']).replace(/,/g, ''), name1.filter(Boolean).join(' '))
    if (s(f, 'first_name')) Object.assign(updated, { clientTitle: s(f, 'salutation') || snap.clientTitle, clientFirstName: s(f, 'first_name'), clientLastName: s(f, 'last_name') })

    const joint = f.joint === 'yes'
    const before2 = [snap.client2Title, snap.client2FirstName, snap.client2LastName].filter(Boolean).join(' ')
    const after2 = joint ? [s(f, 'j_salutation'), s(f, 'j_first_name'), s(f, 'j_last_name')].filter(Boolean).join(' ') : ''
    note('Joint landlord', before2, after2)
    Object.assign(updated, joint
      ? { client2Title: s(f, 'j_salutation') || snap.client2Title, client2FirstName: s(f, 'j_first_name'), client2LastName: s(f, 'j_last_name') }
      : { client2Title: undefined, client2FirstName: undefined, client2LastName: undefined })

    const home = [s(f, 'addr_line1'), s(f, 'addr_line2'), s(f, 'addr_town'), s(f, 'addr_postcode')].filter(Boolean)
    if (home.length) { note('Client address', join(snap.clientAddress ?? []), join(home)); updated.clientAddress = home }
  }

  const props = s(f, 'property_count') === 'multiple'
    ? ((f.properties as Array<Record<string, string>> | undefined) ?? []).map(p => join([p.line1, p.line2, p.town, p.postcode])).filter(Boolean)
    : [join([s(f, 'prop_line1'), s(f, 'prop_line2'), s(f, 'prop_town'), s(f, 'prop_postcode')])].filter(Boolean)
  if (props.length) {
    note('Property', (snap.properties ?? []).map(p => p.replace(/\n/g, ', ')).join(' | '), props.join(' | '))
    updated.properties = props
  }

  if (s(f, 'account_number') && s(f, 'sort_code')) {
    const acc = { accountName: s(f, 'account_holder'), bankName: s(f, 'bank_name'), sortCode: s(f, 'sort_code'), accountNumber: s(f, 'account_number') }
    const before = snap.nominatedAccount ? `${snap.nominatedAccount.sortCode} ${snap.nominatedAccount.accountNumber}` : ''
    note('Nominated bank account', before || 'Not stated', `${acc.accountName} · ${acc.bankName} · ${acc.sortCode} · ${acc.accountNumber}`)
    updated.nominatedAccount = acc
  }

  updated.agreementDate = new Date().toISOString().slice(0, 10)
  return { hasSnapshot: true, diffs, updated }
}
