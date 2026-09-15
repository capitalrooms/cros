/**
 * POST /api/tenant/notices/maintenance-post
 * Auto-posts a brief communal notice when a maintenance ticket is filed in a shared area.
 * Called internally by the maintenance report wizard — not tenant-visible in UI flow.
 * Notice type: 'maintenance' so admin/webhooks can auto-close when ticket is resolved.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Locations that warrant a communal notice
const COMMUNAL_LOCATIONS = new Set([
  'Kitchen',
  'Bathroom (ground floor)',
  'Bathroom (first floor)',
  'Living Room',
  'Hallway (ground floor)',
  'Hallway (first floor)',
  'Stairs',
  'Front entrance',
  'Back / garden',
  'Communal area',
  'Outside / exterior',
])

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sb = serviceClient()
  const { data: { user }, error: authErr } = await sb.auth.getUser(token)
  if (authErr || !user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { ticketId, location, category, description } = body

  // Only post for communal locations
  if (!COMMUNAL_LOCATIONS.has(location)) {
    return NextResponse.json({ skipped: true, reason: 'not a communal location' })
  }

  const { data: person } = await sb
    .from('people')
    .select('id')
    .eq('email', user.email)
    .maybeSingle()

  if (!person) return NextResponse.json({ error: 'Person not found' }, { status: 404 })

  // Find their property via active tenancy (date-based, matching notices route pattern)
  const today = new Date().toISOString().split('T')[0]
  const { data: tenancy } = await sb
    .from('tenancies')
    .select('property_id, rooms!inner(property_id)')
    .eq('person_id', person.id)
    .lte('start_date', today)
    .or(`end_date.is.null,end_date.gte.${today}`)
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  const propertyId = (tenancy as any)?.property_id ?? (tenancy as any)?.rooms?.property_id ?? null
  if (!propertyId) return NextResponse.json({ error: 'No active tenancy' }, { status: 404 })

  // Build a brief, friendly notice text
  const locationLabel = location.replace(' (ground floor)', '').replace(' (first floor)', '')
  const categoryLabel = category || 'Maintenance'
  const noticeText = `🔧 ${categoryLabel} issue reported in the ${locationLabel}. Our team has been notified and will arrange a visit — we'll update everyone when it's resolved. [ref:${ticketId}]`

  const { error: insertErr } = await sb.from('communal_notices').insert({
    property_id: propertyId,
    raw_text: noticeText,
    notice_type: 'info',          // DB enum — 'maintenance' not allowed; we identify these by [ref:] in raw_text
    status: 'active',
    created_by: person.id,
  })

  if (insertErr) {
    console.error('[maintenance-post notice]', insertErr)
    // Non-fatal — ticket already exists, notice failure shouldn't break the flow
    return NextResponse.json({ ok: false, error: insertErr.message }, { status: 200 })
  }

  return NextResponse.json({ ok: true })
}
