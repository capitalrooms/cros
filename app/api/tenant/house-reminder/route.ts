/**
 * POST /api/tenant/house-reminder
 * Creates an anonymous house reminder on the communal Notice Board.
 * The reminder appears as type 'house_reminder' with no author attribution.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  const { text, category } = await req.json()
  if (!text?.trim()) return NextResponse.json({ error: 'text required' }, { status: 400 })

  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const service = serviceClient()
  const { data: authData } = await service.auth.getUser(token)
  if (!authData?.user?.email) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  // Get the tenant's property via active tenancy
  const { data: person } = await service
    .from('people')
    .select('id')
    .eq('email', authData.user.email)
    .single()
  if (!person) return NextResponse.json({ error: 'Person not found' }, { status: 404 })

  const today = new Date().toISOString().split('T')[0]
  const { data: tenancy } = await service
    .from('tenancies')
    .select('property_id')
    .eq('person_id', person.id)
    .lte('start_date', today)
    .or(`end_date.is.null,end_date.gte.${today}`)
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!tenancy?.property_id) {
    return NextResponse.json({ error: 'No active tenancy' }, { status: 404 })
  }

  // Insert anonymous notice — created_by stored in DB for self-delete only,
  // never displayed in the UI (shown as "Anonymous" to all housemates)
  const { error } = await service
    .from('communal_notices')
    .insert({
      property_id: tenancy.property_id,
      raw_text: text.trim(),
      notice_type: 'house_reminder',
      status: 'active',
      created_by: person.id,
    })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
