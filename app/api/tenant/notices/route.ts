import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Auth: reads Bearer token from Authorization header (session lives in browser
// localStorage, not cookies, so cookie-based auth doesn't work here).

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Returns person + their current tenancy's property_id in 2 network calls total
// (1 auth.getUser + 1 combined people+tenancy query) instead of the old 3.
async function getPersonAndPropertyFromToken(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return null

  const sb = serviceClient()
  const { data: { user }, error } = await sb.auth.getUser(token)
  if (error || !user?.email) return null

  const today = new Date().toISOString().split('T')[0]

  // Single DB query: person + their active tenancy
  const { data: person } = await sb
    .from('people')
    .select(`
      id, email, role,
      tenancies!person_id(property_id, start_date, end_date, rooms!inner(property_id))
    `)
    .eq('email', user.email)
    .maybeSingle()

  if (!person) return null

  const activeTenancy = (person as any).tenancies?.find((t: any) =>
    t.start_date <= today && (t.end_date === null || t.end_date >= today)
  )
  const propertyId =
    (activeTenancy as any)?.property_id ??
    (activeTenancy as any)?.rooms?.property_id ??
    null

  return { id: person.id, email: person.email, role: person.role, propertyId }
}

// GET /api/tenant/notices — fetch active+recent notices for the caller's property
export async function GET(req: NextRequest) {
  const personAndProp = await getPersonAndPropertyFromToken(req)
  if (!personAndProp) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: personId, propertyId } = personAndProp
  const sb = serviceClient()

  if (!propertyId) return NextResponse.json({ notices: [], propertyId: null, personId })

  const { data: notices, error } = await sb
    .from('communal_notices')
    .select(`
      id, notice_type, subtype, ai_text, raw_text, photo_url,
      status, resolved_by, resolved_at, resolved_photo_url, deadline, created_at,
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

  return NextResponse.json({ notices: notices ?? [], propertyId, personId })
}

// POST /api/tenant/notices — create a new notice
export async function POST(req: NextRequest) {
  const personAndProp = await getPersonAndPropertyFromToken(req)
  if (!personAndProp) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const person = personAndProp
  const sb = serviceClient()

  const body = await req.json()
  const { property_id, notice_type, subtype, raw_text, ai_text, photo_url, deadline, auto_expire_hours } = body

  const VALID_TYPES = ['info', 'task', 'update', 'house_reminder']
  if (!property_id || !notice_type || !raw_text?.trim() || !VALID_TYPES.includes(notice_type)) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const insertData: any = {
    property_id,
    created_by: person.id,
    notice_type,
    subtype: subtype || null,
    raw_text: raw_text.trim(),
    ai_text: ai_text?.trim() || null,
    photo_url: photo_url || null,
    status: 'active',
  }

  // Deadline (tasks) or auto-expire date (updates like guest stays)
  if (notice_type === 'task' && deadline) {
    insertData.deadline = deadline
  } else if (notice_type === 'update' && auto_expire_hours) {
    const expiry = new Date(Date.now() + auto_expire_hours * 3600000)
    insertData.deadline = expiry.toISOString().split('T')[0]
  }

  const { data: notice, error } = await sb
    .from('communal_notices')
    .insert(insertData)
    .select(`
      id, notice_type, subtype, ai_text, raw_text, photo_url,
      status, resolved_by, resolved_at, resolved_photo_url, deadline, created_at,
      created_by_person:people!communal_notices_created_by_fkey(id, first_name, last_name),
      resolved_by_person:people!communal_notices_resolved_by_fkey(id, first_name, last_name)
    `)
    .single()

  if (error) {
    console.error('[notices POST]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ notice })
}
