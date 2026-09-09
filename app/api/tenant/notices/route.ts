import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

// GET /api/tenant/notices — fetch active+recent notices for the caller's property
export async function GET() {
  const supabase = createRouteHandlerClient({ cookies })

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Resolve the caller's current property
  const { data: person } = await supabase
    .from('people')
    .select('id, role')
    .eq('email', user.email)
    .single()

  if (!person) return NextResponse.json({ error: 'Person not found' }, { status: 404 })

  // For staff callers without a specific property, require ?property_id=
  // For tenant callers, resolve from active tenancy
  let propertyId: string | null = null

  if (['administrator', 'lettings', 'staff'].includes(person.role)) {
    // Staff can pass ?property_id= to scope to a property
    return NextResponse.json({ notices: [] })
  }

  // Tenant: find their current property via active tenancy
  const { data: tenancy } = await supabase
    .from('tenancies')
    .select('room_id, rooms!inner(property_id)')
    .eq('person_id', person.id)
    .or('end_date.is.null,end_date.gte.' + new Date().toISOString().split('T')[0])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (tenancy) {
    propertyId = (tenancy as any).rooms?.property_id ?? null
  }

  if (!propertyId) return NextResponse.json({ notices: [], propertyId: null })

  const { data: notices, error } = await supabase
    .from('communal_notices')
    .select(`
      id, notice_type, subtype, ai_text, raw_text, photo_url,
      status, resolved_by, resolved_at, resolved_photo_url, created_at,
      created_by_person:people!communal_notices_created_by_fkey(id, first_name, last_name),
      resolved_by_person:people!communal_notices_resolved_by_fkey(id, first_name, last_name)
    `)
    .eq('property_id', propertyId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('[notices GET]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ notices: notices ?? [], propertyId, personId: person.id })
}

// POST /api/tenant/notices — create a new notice
export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies })

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: person } = await supabase
    .from('people')
    .select('id, role')
    .eq('email', user.email)
    .single()

  if (!person) return NextResponse.json({ error: 'Person not found' }, { status: 404 })

  const body = await req.json()
  const { property_id, notice_type, subtype, raw_text, ai_text, photo_url } = body

  if (!property_id || !notice_type || !raw_text?.trim()) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const { data: notice, error } = await supabase
    .from('communal_notices')
    .insert({
      property_id,
      created_by: person.id,
      notice_type,
      subtype: subtype || null,
      raw_text: raw_text.trim(),
      ai_text: ai_text?.trim() || null,
      photo_url: photo_url || null,
      status: 'active',
    })
    .select()
    .single()

  if (error) {
    console.error('[notices POST]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ notice })
}
