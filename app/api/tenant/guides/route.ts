// GET /api/tenant/guides
// Returns guides visible to the current tenant, filtered by their tenancy stage.
// Stage-triggered guides only appear at the appropriate tenancy stage.
//
// Auth: reads Bearer token from Authorization header (session lives in browser
// localStorage, not cookies, so auth-helpers cookie approach won't work in Next.js 16).
// Verifies the token via supabase.auth.getUser(token) with the service role client.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/** Look up the active tenancy using the service role client (bypasses RLS). */
async function getActiveTenancySR(personId: string) {
  if (!personId) return null
  const sb = serviceClient()
  const today = new Date().toISOString().split('T')[0]
  const { data } = await sb
    .from('tenancies')
    .select('id, property_id, room_id, start_date, end_date, notice_received_date, properties(name, address), rooms(name)')
    .eq('person_id', personId)
    .lte('start_date', today)
    .or(`end_date.is.null,end_date.gte.${today}`)
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ?? null
}

async function getPersonFromToken(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return null

  const sb = serviceClient()
  const { data: { user }, error } = await sb.auth.getUser(token)
  if (error || !user?.email) return null

  // Look up the person record by email (people.id ≠ auth.uid)
  const { data: person } = await sb
    .from('people')
    .select('id, email, role')
    .eq('email', user.email)
    .maybeSingle()

  return person ?? null
}

export async function GET(req: NextRequest) {
  const person = await getPersonFromToken(req)
  if (!person) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tenancy = await getActiveTenancySR(person.id)
  // Derive tenancy stage from notice_received_date (live DB has no status column)
  const tenancyStage = tenancy?.notice_received_date ? 'on_notice' : 'active'

  const sb = serviceClient()

  // Get property type + fire door setting for guide filtering
  let propertyType: string | null = null
  let showFireDoorGuide = false
  if (tenancy?.property_id) {
    const { data: prop } = await sb
      .from('properties')
      .select('property_type, show_fire_door_guide')
      .eq('id', tenancy.property_id)
      .maybeSingle()
    propertyType = prop?.property_type ?? null
    showFireDoorGuide = prop?.show_fire_door_guide ?? false
  }
  const isHmo = propertyType !== 'single_let'

  const { data: guides, error } = await sb
    .from('tenant_guides')
    .select('id, slug, title, emoji, sort_order, visibility, trigger_stage, acknowledgment_required, hero_image_url, property_type_filter')
    .eq('is_published', true)
    .order('sort_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Filter stage-triggered guides by tenant's current stage + property type
  const visible = (guides || []).filter(g => {
    // Stage filter
    if (g.visibility === 'stage-triggered') {
      if (g.trigger_stage !== tenancyStage) return false
    }
    // Property type filter
    const ptf = (g as any).property_type_filter || 'all'
    if (ptf === 'hmo' && !isHmo) return false
    if (ptf === 'single_let' && isHmo) return false
    if (ptf === 'fire_door' && !showFireDoorGuide) return false
    return true
  })

  // Fetch acknowledgments for this tenancy
  let ackSet: Set<string> = new Set()
  if (tenancy) {
    const { data: acks } = await sb
      .from('guide_acknowledgments')
      .select('guide_id')
      .eq('tenancy_id', tenancy.id)

    ackSet = new Set((acks || []).map(a => a.guide_id))
  }

  const result = visible.map(g => ({
    ...g,
    acknowledged: ackSet.has(g.id),
  }))

  return NextResponse.json({ guides: result, tenancyStage })
}
