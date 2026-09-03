import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Anon client — public form, no auth
const anon = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

// Service client for writes (avoids RLS complexity on public updates)
const svc = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

// ── GET /api/landlord-onboarding/form/[token] → fetch row for public form ─────
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const { data, error } = await anon()
    .from('landlord_onboarding')
    .select('id, full_name, first_name, last_name, email, phone, stage, entity_type, property_count, form_data')
    .eq('token', token)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ row: data })
}

// ── POST /api/landlord-onboarding/form/[token] → submit AML form ──────────────
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const body = await req.json()
  const { entity_type, property_count, form_data } = body

  if (!entity_type || !property_count) {
    return NextResponse.json({ error: 'entity_type and property_count are required' }, { status: 400 })
  }

  // Fetch to confirm token exists
  const { data: existing } = await anon()
    .from('landlord_onboarding')
    .select('id, stage')
    .eq('token', token)
    .single()

  if (!existing) return NextResponse.json({ error: 'Invalid link' }, { status: 404 })

  // Don't allow resubmission if already past stage 3
  if (existing.stage > 3) {
    return NextResponse.json({ error: 'Form already submitted' }, { status: 409 })
  }

  const { error } = await svc()
    .from('landlord_onboarding')
    .update({
      entity_type,
      property_count,
      form_data,
      stage: 3,
      docs_received_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('token', token)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
