import { NextRequest, NextResponse } from 'next/server'
import { requireAdministrator } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'
import { encryptionOn, isSealed, sealFields, BANK_FIELDS } from '@/lib/crypto/fieldCrypt'
import { isIdentityPath, isSealedBytes, sealStoredFile } from '@/lib/files/fileCrypt'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Lock (encrypt) the bank details already stored (30 Oct 2026). New ones are encrypted as they're saved; this does the
// ones saved before. Administrators only; does nothing until CROS_FIELD_KEY is set; safe to press again (a value
// already locked is left alone). GET → how many are locked / not yet.
const TABLES = [
  { table: 'landlord_bank_accounts', fields: BANK_FIELDS.landlord_bank_accounts },
  { table: 'properties', fields: BANK_FIELDS.properties },
  { table: 'supplier_profiles', fields: BANK_FIELDS.supplier_profiles, key: 'person_id' },
] as const

async function survey() {
  const s = createServiceClient()
  const out: { place: string; locked: number; open: number; rows: any[]; key: string; fields: readonly string[]; table: string }[] = []
  for (const t of TABLES) {
    const key = (t as any).key ?? 'id'
    const { data, error } = await s.from(t.table).select([key, ...t.fields].join(', '))
    if (error) { out.push({ place: t.table, locked: 0, open: 0, rows: [], key, fields: t.fields, table: t.table }); continue }
    const rows = (data ?? []) as any[]
    const withValues = rows.filter(r => t.fields.some(f => r[f]))
    const open = withValues.filter(r => t.fields.some(f => r[f] && !isSealed(r[f])))
    out.push({ place: t.table, locked: withValues.length - open.length, open: open.length, rows: open, key, fields: t.fields, table: t.table })
  }
  // landlord onboarding forms keep bank details inside form_data
  const { data: forms } = await s.from('landlord_onboarding').select('id, form_data')
  const f = BANK_FIELDS.landlord_onboarding_form
  const filled = ((forms ?? []) as any[]).filter(r => r.form_data && f.some(k => r.form_data[k]))
  const openForms = filled.filter(r => f.some(k => r.form_data[k] && !isSealed(r.form_data[k])))
  out.push({ place: 'landlord_onboarding', locked: filled.length - openForms.length, open: openForms.length, rows: openForms, key: 'id', fields: f, table: 'landlord_onboarding' })
  // identity documents (photo ID, proof of address, company papers) — files, encrypted where they sit
  const paths = [...new Set(((forms ?? []) as any[]).flatMap(r => Object.values((r.form_data?.documents ?? {}) as Record<string, string[]>).flat()).filter(p => typeof p === 'string' && isIdentityPath('landlord-docs', p)))]
  const openFiles: any[] = []
  let lockedFiles = 0
  for (const path of paths) {
    const { data } = await s.storage.from('landlord-docs').download(path)
    if (!data) continue
    if (isSealedBytes(Buffer.from(await data.arrayBuffer()))) lockedFiles++; else openFiles.push({ path })
  }
  out.push({ place: 'identity_documents', locked: lockedFiles, open: openFiles.length, rows: openFiles, key: 'path', fields: [], table: 'files' })
  return out
}

export async function GET(req: NextRequest) {
  if (!(await requireAdministrator(req))) return NextResponse.json({ error: 'Administrators only' }, { status: 403 })
  const sv = await survey()
  return NextResponse.json({ keySet: encryptionOn(), places: sv.map(({ place, locked, open }) => ({ place, locked, open })) })
}

export async function POST(req: NextRequest) {
  if (!(await requireAdministrator(req))) return NextResponse.json({ error: 'Administrators only' }, { status: 403 })
  if (!encryptionOn()) return NextResponse.json({ error: 'The encryption key isn’t set up yet (CROS_FIELD_KEY on Vercel) — nothing was changed.' }, { status: 400 })
  const s = createServiceClient()
  let done = 0, failed = 0
  for (const p of await survey()) {
    if (p.table === 'files') {
      for (const r of p.rows) { try { await sealStoredFile('landlord-docs', r.path); done++ } catch { failed++ } }
      continue
    }
    for (const r of p.rows) {
      const patch = p.table === 'landlord_onboarding'
        ? { form_data: sealFields(r.form_data, p.fields) }
        : sealFields(Object.fromEntries(p.fields.filter(f => r[f]).map(f => [f, r[f]])), p.fields)
      const { data, error } = await s.from(p.table).update(patch).eq(p.key, r[p.key]).select(p.key)
      if (error || !data?.length) failed++; else done++
    }
  }
  const after = await survey()
  return NextResponse.json({ ok: failed === 0, locked: done, failed, places: after.map(({ place, locked, open }) => ({ place, locked, open })) })
}
