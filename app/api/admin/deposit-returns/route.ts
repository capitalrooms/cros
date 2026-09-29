// Deposit returns at the end of a tenancy (migration 195) — numbered DEPR, never deleted, every change audited.
// GET  ?tenancyId=                         the return for a tenancy (or null) and the deposit on record
// POST { tenancyId, deductions: [{ description, amount, evidence? }], status, disputeRef?, returnedOn?, notes? }
//      creates or updates it. to_landlord = the deductions, to_tenant = the rest of the deposit. When it is marked
//      returned, the tenancy's deposit shows as released. A returned deposit can't be changed.
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/adminAuth'

export const dynamic = 'force-dynamic'
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const STATUSES = ['proposed', 'agreed', 'disputed', 'returned']

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const tenancyId = req.nextUrl.searchParams.get('tenancyId')
  const s = createServiceClient()
  const [{ data: t }, { data: ret }] = await Promise.all([
    s.from('tenancies').select('id, deposit_amount, deposit_scheme, deposit_scheme_ref, deposit_no').eq('id', tenancyId ?? '').maybeSingle(),
    s.from('deposit_returns').select('*').eq('tenancy_id', tenancyId ?? '').maybeSingle(),
  ])
  if (!t) return NextResponse.json({ error: 'Tenancy not found' }, { status: 404 })
  return NextResponse.json({ tenancy: t, depositReturn: ret ?? null })
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const s = createServiceClient()
  const { data: t } = await s.from('tenancies').select('id, deposit_amount, deposit_scheme').eq('id', b.tenancyId ?? '').maybeSingle()
  if (!t) return NextResponse.json({ error: 'Tenancy not found' }, { status: 404 })
  const deposit = r2(Number(t.deposit_amount || 0))
  if (!(deposit > 0)) return NextResponse.json({ error: 'No deposit is recorded on this tenancy.' }, { status: 409 })
  const deductions = (Array.isArray(b.deductions) ? b.deductions : [])
    .map((d: any) => ({ description: String(d.description || '').trim(), amount: r2(Number(d.amount)), evidence: String(d.evidence || '').trim() || null }))
    .filter((d: any) => d.description || d.amount)
  if (deductions.some((d: any) => !d.description || !(d.amount > 0))) return NextResponse.json({ error: 'Each deduction needs a reason and an amount.' }, { status: 400 })
  const toLandlord = r2(deductions.reduce((x: number, d: any) => x + d.amount, 0))
  if (toLandlord > deposit) return NextResponse.json({ error: `Deductions (£${toLandlord.toFixed(2)}) are more than the deposit (£${deposit.toFixed(2)}). Anything more is claimed separately.` }, { status: 400 })
  const status = STATUSES.includes(b.status) ? b.status : 'proposed'
  if (status === 'returned' && !/^\d{4}-\d{2}-\d{2}$/.test(b.returnedOn || '')) return NextResponse.json({ error: 'Enter the date the deposit was returned.' }, { status: 400 })

  const { data: existing } = await s.from('deposit_returns').select('id, status').eq('tenancy_id', t.id).maybeSingle()
  if (existing?.status === 'returned') return NextResponse.json({ error: 'This deposit has been returned, so it can’t be changed.' }, { status: 409 })
  const row = {
    tenancy_id: t.id, deposit_amount: deposit, deductions, to_landlord: toLandlord, to_tenant: r2(deposit - toLandlord), status,
    scheme: t.deposit_scheme ?? null, dispute_ref: String(b.disputeRef || '').trim() || null, returned_on: status === 'returned' ? b.returnedOn : null,
    notes: String(b.notes || '').trim() || null, updated_at: new Date().toISOString(),
  }
  const res = existing
    ? await s.from('deposit_returns').update(row).eq('id', existing.id).select('txn_no').single()
    : await s.from('deposit_returns').insert({ ...row, created_by: admin.personId }).select('txn_no').single()
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 })
  await s.from('tenancies').update({
    deposit_release_status: status === 'returned' ? 'released' : toLandlord > 0 ? 'deductions' : 'clean',
    ...(status === 'returned' ? { deposit_released_at: new Date(b.returnedOn + 'T12:00:00Z').toISOString() } : {}),
  }).eq('id', t.id)
  return NextResponse.json({ ok: true, number: res.data.txn_no, message: `${res.data.txn_no}: £${r2(deposit - toLandlord).toFixed(2)} to the tenant, £${toLandlord.toFixed(2)} to the landlord — ${status}.` })
}
