// GET /api/tenant/guides/[slug]
// Returns a single guide with its blocks and the tenant's acknowledgment status.
//
// Auth: reads Bearer token from Authorization header.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function getActiveTenancySR(personId: string) {
  if (!personId) return null
  const sb = serviceClient()
  const today = new Date().toISOString().split('T')[0]
  const { data } = await sb
    .from('tenancies')
    .select('id, property_id, room_id, start_date, end_date, notice_received_date')
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

  const { data: person } = await sb
    .from('people')
    .select('id, email, role')
    .eq('email', user.email)
    .maybeSingle()

  return person ?? null
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const person = await getPersonFromToken(req)
  if (!person) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tenancy = await getActiveTenancySR(person.id)
  const tenancyStage = tenancy?.notice_received_date ? 'on_notice' : 'active'

  const sb = serviceClient()

  const { data: guide, error } = await sb
    .from('tenant_guides')
    .select('id, slug, title, emoji, sort_order, visibility, trigger_stage, acknowledgment_required, hero_image_url, is_published')
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle()

  if (error || !guide) return NextResponse.json({ error: 'Guide not found' }, { status: 404 })

  // Check stage visibility
  if (guide.visibility === 'stage-triggered' && guide.trigger_stage !== tenancyStage) {
    return NextResponse.json({ error: 'Guide not available at your current tenancy stage' }, { status: 403 })
  }

  const { data: blocks } = await sb
    .from('guide_blocks')
    .select('id, sort_order, heading, body, inline_image_url')
    .eq('guide_id', guide.id)
    .order('sort_order')

  let acknowledged = false
  if (tenancy) {
    const { data: ack } = await sb
      .from('guide_acknowledgments')
      .select('id')
      .eq('guide_id', guide.id)
      .eq('tenancy_id', tenancy.id)
      .maybeSingle()
    acknowledged = !!ack
  }

  return NextResponse.json({
    guide,
    blocks: blocks || [],
    acknowledged,
    tenancyId: tenancy?.id ?? null,
  })
}
