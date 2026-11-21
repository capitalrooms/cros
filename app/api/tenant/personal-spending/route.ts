// Private to the tenant (21 Nov 2026). GET → your own purchases. POST → add one. Housemates never see these.
import { NextRequest, NextResponse } from 'next/server'
import { requireSignedIn } from '@/lib/portalAuth'
import { getActiveTenancy } from '@/lib/tenancy'
import { createServiceClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

async function tenantCaller(req: NextRequest) {
  const c = await requireSignedIn(req)
  return c && c.role === 'tenant' ? c : null
}

export async function GET(req: NextRequest) {
  const c = await tenantCaller(req)
  if (!c) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const s = createServiceClient() as any
  const { data } = await s.from('personal_spending').select('id, description, amount_gbp, bought_on').eq('person_id', c.personId).order('bought_on', { ascending: false }).limit(200)
  return NextResponse.json({ rows: data ?? [] })
}

export async function POST(req: NextRequest) {
  const c = await tenantCaller(req)
  if (!c) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const t = await getActiveTenancy(c.personId)
  const b = await req.json().catch(() => ({})) as { description?: string; amount?: string | number; boughtOn?: string }
  const description = String(b.description ?? '').trim().slice(0, 200)
  if (description.length < 2) return NextResponse.json({ error: 'Say what you bought.' }, { status: 400 })
  const amount = b.amount === '' || b.amount == null ? null : Math.round(Math.max(0, Number(b.amount)) * 100) / 100
  const boughtOn = /^\d{4}-\d{2}-\d{2}$/.test(String(b.boughtOn ?? '')) ? b.boughtOn! : new Date().toISOString().slice(0, 10)
  const s = createServiceClient() as any
  const { error } = await s.from('personal_spending').insert({ person_id: c.personId, property_id: t?.property_id ?? null, description, amount_gbp: amount, bought_on: boughtOn })
  if (error) return NextResponse.json({ error: 'That didn’t save. Please try again.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
