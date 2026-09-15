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

async function getPersonFromToken(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return null

  const sb = serviceClient()
  const { data: { user }, error } = await sb.auth.getUser(token)
  if (error || !user?.email) return null

  const { data: person } = await sb
    .from('people')
    .select('id, email, role')
    .eq('email', user.email)
    .maybeSingle()

  return person ?? null
}

async function getPropertyIdForTenant(personId: string, sb: ReturnType<typeof serviceClient>) {
  const today = new Date().toISOString().split('T')[0]
  const { data: tenancy } = await sb
    .from('tenancies')
    .select('property_id, rooms!inner(property_id)')
    .eq('person_id', personId)
    .lte('start_date', today)
    .or(`end_date.is.null,end_date.gte.${today}`)
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Try direct property_id first, then via rooms join
  return (tenancy as any)?.property_id ?? (tenancy as any)?.rooms?.property_id ?? null
}

// GET /api/tenant/notices — fetch active+recent notices for the caller's property
export async function GET(req: NextRequest) {
  const person = await getPersonFromToken(req)
  if (!person) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sb = serviceClient()

  const propertyId = await getPropertyIdForTenant(person.id, sb)
  if (!propertyId) return NextResponse.json({ notices: [], propertyId: null, personId: person.id })

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

  return NextResponse.json({ notices: notices ?? [], propertyId, personId: person.id })
}

// POST /api/tenant/notices — create a new notice
export async function POST(req: NextRequest) {
  const person = await getPersonFromToken(req)
  if (!person) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
