// Field-level encryption for the most sensitive details (29 Oct 2026 — a developer's advice to Harry: if someone got a
// copy of the database, it shouldn't hand them anything usable). Bank sort codes, account numbers and IBANs are stored
// as "enc:v1:<base64(iv | auth tag | ciphertext)>" — AES-256-GCM — and the key lives only in the app's environment on
// Vercel (CROS_FIELD_KEY, 32 bytes base64), never in the database. So the database alone is not enough, and neither
// is the app's code alone.
//
// Safe by design:
//  - no key set → values are stored as they are today (nothing breaks); /api/health reports encryption as off
//  - reading a value that isn't encrypted returns it unchanged, so old and new rows live side by side
//  - CROS_FIELD_KEY_PREVIOUS is tried when the current key doesn't fit, so the key can be changed without a migration
// Server-only. Keep a copy of the key somewhere safe (a password manager): without it encrypted values can't be read.
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const PREFIX = 'enc:v1:'
type Row = Record<string, unknown>

function keyFrom(v?: string): Buffer | null {
  if (!v) return null
  const k = Buffer.from(v.trim(), 'base64')
  if (k.length !== 32) throw new Error('CROS_FIELD_KEY must be 32 random bytes, base64-encoded')
  return k
}
const currentKey = () => keyFrom(process.env.CROS_FIELD_KEY)
const keys = () => [currentKey(), keyFrom(process.env.CROS_FIELD_KEY_PREVIOUS)].filter(Boolean) as Buffer[]

export const encryptionOn = () => !!process.env.CROS_FIELD_KEY
export const isSealed = (v: unknown): v is string => typeof v === 'string' && v.startsWith(PREFIX)

/** Encrypt one value (no key, empty, or already encrypted → returned as it is). */
export function seal<T>(v: T): T | string {
  if (v == null || v === '' || isSealed(v)) return v
  const k = currentKey()
  if (!k) return v
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', k, iv)
  const ct = Buffer.concat([c.update(String(v), 'utf8'), c.final()])
  return PREFIX + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64')
}

/** Decrypt one value (not encrypted → returned as it is). If no key opens it, '[locked]' — never the scrambled text. */
export function open<T>(v: T): T | string {
  if (!isSealed(v)) return v
  const raw = Buffer.from(v.slice(PREFIX.length), 'base64')
  const iv = raw.subarray(0, 12), tag = raw.subarray(12, 28), ct = raw.subarray(28)
  for (const k of keys()) {
    try {
      const d = createDecipheriv('aes-256-gcm', k, iv)
      d.setAuthTag(tag)
      return Buffer.concat([d.update(ct), d.final()]).toString('utf8')
    } catch { /* try the next key */ }
  }
  console.error('[fieldCrypt] a stored value could not be decrypted — is CROS_FIELD_KEY set to the key it was saved with?')
  return '[locked]'
}

/** The sensitive columns, per place they're kept. */
export const BANK_FIELDS = {
  landlord_bank_accounts: ['sort_code', 'account_number', 'iban'],
  properties: ['bank_sort_code', 'bank_account_number', 'bank_iban'],
  supplier_profiles: ['bank_sort_code', 'bank_account_no'],
  landlord_onboarding_form: ['sort_code', 'account_number', 'iban'],   // inside landlord_onboarding.form_data
} as const

export function sealFields<R extends Row | null | undefined>(row: R, fields: readonly string[]): R {
  if (!row) return row
  const out: Row = { ...row }
  for (const f of fields) if (f in out) out[f] = seal(out[f])
  return out as R
}
export function openFields<R extends Row | null | undefined>(row: R, fields: readonly string[]): R {
  if (!row) return row
  const out: Row = { ...row }
  for (const f of fields) if (f in out) out[f] = open(out[f])
  return out as R
}
export const openRows = <R extends Row>(rows: R[] | null | undefined, fields: readonly string[]): R[] => (rows ?? []).map(r => openFields(r, fields))
