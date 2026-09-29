import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET /api/admin/compliance-history?property_id=...&type=cert|hmo&cert_type=gas_safe
export async function GET(req: NextRequest) {
  if (!(await requireStaff(req as any))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = req.nextUrl
  const propertyId = searchParams.get('property_id')
  const type = searchParams.get('type') // 'cert' | 'hmo'
  if (!propertyId || !type) return NextResponse.json({ error: 'property_id and type required' }, { status: 400 })

  if (type === 'hmo') {
    const { data, error } = await sb()
      .from('hmo_licence_history')
      .select('licence_number, issue_date, expiry_date, notes, created_at, recorded_by_person:people!recorded_by(first_name, last_name)')
      .eq('property_id', propertyId)
      .order('created_at', { ascending: false })
      .limit(20)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ history: data || [] })
  }

  // type === 'cert'
  const certType = searchParams.get('cert_type')
  if (!certType) return NextResponse.json({ error: 'cert_type required for type=cert' }, { status: 400 })
  const { data, error } = await sb()
    .from('compliance_cert_history')
    .select('issue_date, expiry_date, provider, notes, created_at, recorded_by_person:people!recorded_by(first_name, last_name)')
    .eq('property_id', propertyId)
    .eq('cert_type', certType)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ history: data || [] })
}

// POST /api/admin/compliance-history
// body: { type: 'cert' | 'hmo', property_id, ...fields }
export async function POST(req: NextRequest) {
  if (!(await requireStaff(req as any))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { type, property_id } = body
  if (!type || !property_id) return NextResponse.json({ error: 'type and property_id required' }, { status: 400 })

  if (type === 'hmo') {
    const { licence_number, expiry_date, recorded_by } = body
    const { error } = await sb().from('hmo_licence_history').insert({
      property_id,
      licence_number: licence_number || null,
      expiry_date: expiry_date || null,
      recorded_by: recorded_by || null,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // type === 'cert' — batch insert
  const { inserts } = body
  if (!inserts?.length) return NextResponse.json({ error: 'inserts array required' }, { status: 400 })
  const { error } = await sb().from('compliance_cert_history').insert(inserts)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
