// POST /api/tenant/guides/[slug]/acknowledge
// Records that the tenant has read and acknowledged a guide.
// Idempotent — safe to call multiple times.
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
    .select('id, person_id, notice_received_date')
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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const person = await getPersonFromToken(req)
  if (!person) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tenancy = await getActiveTenancySR(person.id)
  if (!tenancy) return NextResponse.json({ error: 'No active tenancy' }, { status: 400 })

  const sb = serviceClient()

  const { data: guide } = await sb
    .from('tenant_guides')
    .select('id, acknowledgment_required')
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle()

  if (!guide) return NextResponse.json({ error: 'Guide not found' }, { status: 404 })

  // Upsert acknowledgment (ON CONFLICT DO NOTHING via unique constraint)
  const { error } = await sb
    .from('guide_acknowledgments')
    .upsert(
      {
        guide_id: guide.id,
        tenancy_id: tenancy.id,
        person_id: person.id,
        acknowledged_at: new Date().toISOString(),
      },
      { onConflict: 'guide_id,tenancy_id', ignoreDuplicates: false }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ acknowledged: true, acknowledgedAt: new Date().toISOString() })
}
