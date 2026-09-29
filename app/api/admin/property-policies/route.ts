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

export async function GET(req: NextRequest) {
  if (!(await requireStaff(req as any))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const propertyId = req.nextUrl.searchParams.get('property_id')
  if (!propertyId) return NextResponse.json({ error: 'property_id required' }, { status: 400 })
  const { data, error } = await sb().from('property_policies').select('*').eq('property_id', propertyId).order('policy_type')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ policies: data || [] })
}

export async function POST(req: NextRequest) {
  if (!(await requireStaff(req as any))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { property_id, policy_type, appliance_type, provider_name, policy_number, monthly_cost, renewal_date } = body
  if (!property_id || !provider_name || !policy_number) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  const { data, error } = await sb().from('property_policies').insert({
    property_id, policy_type: policy_type || 'appliance',
    appliance_type: appliance_type || null, provider_name, policy_number,
    monthly_cost: parseFloat(monthly_cost) || 0,
    renewal_date: renewal_date || null,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ policy: data })
}

export async function DELETE(req: NextRequest) {
  if (!(await requireStaff(req as any))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await sb().from('property_policies').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
