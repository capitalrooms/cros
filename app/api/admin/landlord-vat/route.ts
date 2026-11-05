/**
 * /api/admin/landlord-vat — a landlord's VAT position and how we handle VAT on costs we pay for them (migration 263).
 *   GET  ?landlordId=          → { registered, number, treatment, ours: { from, rate } | null, ready }
 *   POST { landlordId, registered, number, treatment } → saved
 * 'recharge' can only be chosen once Capital Rooms' VAT registration date is set (Finance › Transactions).
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'
import { vatSetting } from '@/lib/finance/books'

export const dynamic = 'force-dynamic'
const missing = (e: { message?: string } | null) => !!e && /vat_registered|vat_number|expense_vat_treatment|column|schema cache/i.test(e.message ?? '')

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const one = req.nextUrl.searchParams.get('landlordId')
  // ?landlordIds=a,b — several at once (Quick add): { ours, ready, byId: { id: { name, registered, number, treatment } } }
  const many = (req.nextUrl.searchParams.get('landlordIds') ?? '').split(',').filter(x => /^[0-9a-f-]{36}$/i.test(x))
  if (!one && !many.length) return NextResponse.json({ error: 'landlordId required' }, { status: 400 })
  const s = createServiceClient()
  const ids = one ? [one] : many
  const [{ data, error }, ours] = await Promise.all([
    s.from('people').select('id, salutation, first_name, last_name, full_name, company, vat_registered, vat_number, expense_vat_treatment').in('id', ids),
    vatSetting(s),
  ])
  let rows = (data ?? []) as any[], ready = true
  if (missing(error)) {
    ready = false
    rows = ((await s.from('people').select('id, salutation, first_name, last_name, full_name, company').in('id', ids)).data ?? []) as any[]
  } else if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const view = (p: any) => ({ name: p.company || [p.salutation, p.first_name, p.last_name].filter(Boolean).join(' ') || p.full_name || 'Landlord', registered: !!p.vat_registered, number: p.vat_number ?? null, treatment: p.expense_vat_treatment === 'recharge' ? 'recharge' : 'disbursement' })
  if (one) { const p = rows[0]; return NextResponse.json({ ready, ours, ...(p ? view(p) : { registered: false, number: null, treatment: 'disbursement' }) }) }
  return NextResponse.json({ ready, ours, byId: Object.fromEntries(rows.map(p => [p.id, view(p)])) })
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  if (!b.landlordId) return NextResponse.json({ error: 'landlordId required' }, { status: 400 })
  const s = createServiceClient()
  const treatment = b.treatment === 'recharge' ? 'recharge' : 'disbursement'
  if (treatment === 'recharge' && !(await vatSetting(s))) return NextResponse.json({ error: 'Recharging with VAT starts once Capital Rooms is VAT registered — set the date in Finance › Transactions first' }, { status: 400 })
  const number = String(b.number ?? '').replace(/\s+/g, ' ').trim().toUpperCase() || null
  if (b.registered && number && !/^(GB)?\s?\d{3}\s?\d{4}\s?\d{2}(\s?\d{3})?$/.test(number)) return NextResponse.json({ error: 'A UK VAT number is 9 digits, e.g. GB 123 4567 89' }, { status: 400 })
  const { error } = await s.from('people').update({ vat_registered: !!b.registered, vat_number: b.registered ? number : null, expense_vat_treatment: treatment }).eq('id', b.landlordId)
  if (missing(error)) return NextResponse.json({ error: 'Run migration 263 in Supabase first (VAT on expenses)' }, { status: 409 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
