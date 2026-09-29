import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET /api/admin/notices?property_id=xxx — list notices for a property
export async function GET(req: NextRequest) {
  if (!(await requireStaff(req as any))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const propertyId = req.nextUrl.searchParams.get('property_id')
  if (!propertyId) return NextResponse.json({ error: 'property_id required' }, { status: 400 })

  const sb = serviceClient()
  const { data: notices, error } = await sb
    .from('communal_notices')
    .select(`
      id, notice_type, subtype, ai_text, raw_text, status, created_at,
      created_by_person:people!created_by(id, first_name, last_name)
    `)
    .eq('property_id', propertyId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ notices: notices ?? [] })
}

// POST /api/admin/notices — admin posts a notice to communal board
export async function POST(req: NextRequest) {
  if (!(await requireStaff(req as any))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { property_id, notice_type = 'info', subtype, raw_text, created_by_person_id } = body

  if (!property_id || !raw_text?.trim() || !created_by_person_id) {
    return NextResponse.json({ error: 'property_id, raw_text, and created_by_person_id required' }, { status: 400 })
  }

  const sb = serviceClient()

  const { data: notice, error } = await sb
    .from('communal_notices')
    .insert({
      property_id,
      notice_type: ['info', 'task'].includes(notice_type) ? notice_type : 'info',
      subtype: subtype || null,
      raw_text: raw_text.trim(),
      ai_text: raw_text.trim(),
      status: 'active',
      created_by: created_by_person_id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ notice })
}

// DELETE /api/admin/notices?id=xxx — delete a notice
export async function DELETE(req: NextRequest) {
  if (!(await requireStaff(req as any))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const sb = serviceClient()
  const { error } = await sb.from('communal_notices').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
