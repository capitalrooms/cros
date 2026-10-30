// Which bank account a house's rent goes to (30 Oct 2026). Accounts belong to the landlord (landlord_bank_accounts);
// each house links to one (properties.bank_account_id). The house's bank_* columns are a copy kept in step from here,
// so everything that already reads them (statements, payouts, the agreement) sees the linked account.
// Order used when a document needs the account: the linked account → the house's own copy → the landlord's default.
import type { SupabaseClient } from '@supabase/supabase-js'
import { openFields, sealFields, BANK_FIELDS } from '@/lib/crypto/fieldCrypt'

export type PayeeAccount = { name: string; bank: string; sortCode: string; accountNo: string; iban?: string; swift?: string; source: 'linked' | 'house' | 'default' }

const copyOf = (a: any) => ({
  bank_account_id: a.id, bank_account_name: a.account_name || null, bank_sort_code: a.sort_code || null,
  bank_account_number: a.account_number || null, bank_iban: a.iban || null, bank_swift: a.swift || null,
})

/** Link a house to one of its landlord's accounts (or unlink with null) and copy the details onto the house. */
export async function linkPropertyAccount(s: SupabaseClient, propertyId: string, accountId: string | null) {
  if (!accountId) {
    const { error } = await s.from('properties').update({ bank_account_id: null }).eq('id', propertyId)
    if (error) throw new Error(error.message)
    return
  }
  const [{ data: acct }, { data: prop }] = await Promise.all([
    s.from('landlord_bank_accounts').select('*').eq('id', accountId).maybeSingle(),
    s.from('properties').select('id, landlord_id').eq('id', propertyId).maybeSingle(),
  ])
  if (!acct || !prop) throw new Error('Account or house not found')
  if ((acct as any).landlord_id !== (prop as any).landlord_id) throw new Error('That account belongs to a different landlord from this house.')
  const a = openFields(acct as any, BANK_FIELDS.landlord_bank_accounts)
  const { error } = await s.from('properties').update(sealFields(copyOf(a), BANK_FIELDS.properties)).eq('id', propertyId)
  if (error) throw new Error(error.message)
}

/** After an account is edited: refresh the copy on every house linked to it. Returns those houses' names. */
export async function syncLinkedProperties(s: SupabaseClient, accountId: string): Promise<string[]> {
  const { data: acct } = await s.from('landlord_bank_accounts').select('*').eq('id', accountId).maybeSingle()
  if (!acct) return []
  const { data: props } = await s.from('properties').select('id, name').eq('bank_account_id', accountId)
  if (!props?.length) return []
  const a = openFields(acct as any, BANK_FIELDS.landlord_bank_accounts)
  await s.from('properties').update(sealFields(copyOf(a), BANK_FIELDS.properties)).eq('bank_account_id', accountId)
  return (props as any[]).map(p => p.name).filter(Boolean)
}

/** The account a let-only house's tenants pay. `prop` is the house row with its bank_* columns already opened. */
export async function resolvePropertyAccount(s: SupabaseClient, prop: any): Promise<PayeeAccount | null> {
  const from = (a: any, source: PayeeAccount['source']): PayeeAccount => ({
    name: a.account_name || '', bank: a.bank_name || '', sortCode: a.sort_code || '', accountNo: a.account_number,
    iban: a.iban || undefined, swift: a.swift || undefined, source,
  })
  if (prop?.bank_account_id) {
    const { data } = await s.from('landlord_bank_accounts').select('*').eq('id', prop.bank_account_id).maybeSingle()
    const a = data ? openFields(data as any, BANK_FIELDS.landlord_bank_accounts) : null
    if (a?.account_number) return from(a, 'linked')
  }
  if (prop?.bank_account_number) return {
    name: prop.bank_account_name || '', bank: '', sortCode: prop.bank_sort_code || '', accountNo: prop.bank_account_number,
    iban: prop.bank_iban || undefined, swift: prop.bank_swift || undefined, source: 'house',
  }
  if (prop?.landlord_id) {
    const { data } = await s.from('landlord_bank_accounts').select('*').eq('landlord_id', prop.landlord_id).eq('is_default', true).maybeSingle()
    const a = data ? openFields(data as any, BANK_FIELDS.landlord_bank_accounts) : null
    if (a?.account_number) return from(a, 'default')
  }
  return null
}
