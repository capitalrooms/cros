import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'
import { openFields, sealFields, BANK_FIELDS } from '@/lib/crypto/fieldCrypt'
import { linkPropertyAccount } from '@/lib/banking/propertyAccount'

export const dynamic = 'force-dynamic'

// A property's landlord payee account (properties.bank_*). The numbers are stored encrypted (lib/crypto/fieldCrypt),
// so the office reads and saves them only through here — never straight from the browser (30 Oct 2026).
const COLS = 'id, bank_account_id, bank_account_name, bank_sort_code, bank_account_number, bank_iban, bank_swift, bank_payment_ref'
const EDITABLE = ['bank_account_name', 'bank_sort_code', 'bank_account_number', 'bank_iban', 'bank_swift', 'bank_payment_ref'] as const

// GET ?ids=a,b,c → { banks: { [propertyId]: {…} } }
export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ids = (req.nextUrl.searchParams.get('ids') ?? '').split(',').map(x => x.trim()).filter(x => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 500)
  if (!ids.length) return NextResponse.json({ banks: {} })
  let { data, error } = await createServiceClient().from('properties').select(COLS).in('id', ids)
  // before migration 250 the link column isn't there — still show the details
  if (error && /bank_account_id/.test(error.message)) ({ data, error } = await createServiceClient().from('properties').select(COLS.replace('bank_account_id, ', '')).in('id', ids) as any)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ banks: Object.fromEntries(((data ?? []) as any[]).map(r => [r.id, openFields(r, BANK_FIELDS.properties)])) })
}

// POST { id, bank_account_name, bank_sort_code, … } → saves (encrypted), returns the saved values
export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  if (!/^[0-9a-f-]{36}$/i.test(String(b.id ?? ''))) return NextResponse.json({ error: 'Which property?' }, { status: 400 })
  // { id, bank_account_id } → link the house to one of its landlord's accounts (copies the details across)
  if ('bank_account_id' in b) {
    try { await linkPropertyAccount(createServiceClient() as any, b.id, b.bank_account_id || null) }
    catch (e: any) { return NextResponse.json({ error: e?.message ?? 'Could not link the account' }, { status: 400 }) }
    const { data } = await createServiceClient().from('properties').select(COLS).eq('id', b.id)
    return NextResponse.json({ ok: true, bank: openFields((data ?? [])[0] as any, BANK_FIELDS.properties) })
  }
  const patch: Record<string, string | null> = {}
  for (const k of EDITABLE) if (k in b) patch[k] = String(b[k] ?? '').trim().slice(0, 120) || null
  const { data, error } = await createServiceClient().from('properties').update(sealFields(patch, BANK_FIELDS.properties)).eq('id', b.id).select(COLS)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Property not found' }, { status: 404 })
  return NextResponse.json({ ok: true, bank: openFields(data[0] as any, BANK_FIELDS.properties) })
}
