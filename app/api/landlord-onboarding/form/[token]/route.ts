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
// Uses service role to bypass RLS — the UUID token is the access credential.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const { data, error } = await svc()
    .from('landlord_onboarding')
    .select('id, full_name, email, phone, stage, entity_type, property_count, form_data')
    .eq('token', token)
    .single()

  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Not found', code: error?.code }, { status: 404 })
  return NextResponse.json({ row: data })
}

// ── PATCH /api/landlord-onboarding/form/[token] → save one section (resumable) ─
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const body = await req.json()
  // body.section: 'type' | 'identity' | 'ownership' | 'bank' | 'declaration'
  // body.form_data: partial or full FormData object for this section
  // body.entity_type / body.property_count: top-level fields from the 'type' section

  const { data: existing } = await svc()
    .from('landlord_onboarding')
    .select('id, stage, form_data, entity_type, property_count')
    .eq('token', token)
    .single()

  if (!existing) return NextResponse.json({ error: 'Invalid link' }, { status: 404 })
  if (existing.stage >= 3) return NextResponse.json({ error: 'Already submitted' }, { status: 409 })

  // Merge the new partial data into any existing saved data
  const merged = { ...(existing.form_data ?? {}), ...(body.form_data ?? {}) }

  // Track which sections have been saved (stored only inside form_data — no separate column)
  const sectionsSaved = Array.from(new Set([
    ...((existing.form_data as any)?.__sections_saved ?? []),
    body.section,
  ]))
  merged.__sections_saved = sectionsSaved

  const updates: Record<string, unknown> = {
    form_data: merged,
  }
  // Persist top-level fields from the 'type' section
  if (body.entity_type)    updates.entity_type    = body.entity_type
  if (body.property_count) updates.property_count = body.property_count

  const { data, error } = await svc()
    .from('landlord_onboarding')
    .update(updates)
    .eq('token', token)
    .select('form_data, entity_type, property_count')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, sections_saved: sectionsSaved, form_data: data?.form_data })
}

// ── POST /api/landlord-onboarding/form/[token] → final submit ─────────────────
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const body = await req.json()
  const { entity_type, property_count, form_data } = body

  if (!entity_type || !property_count) {
    return NextResponse.json({ error: 'entity_type and property_count are required' }, { status: 400 })
  }

  // Fetch to confirm token exists
  const { data: existing } = await svc()
    .from('landlord_onboarding')
    .select('id, stage')
    .eq('token', token)
    .single()

  if (!existing) return NextResponse.json({ error: 'Invalid link' }, { status: 404 })

  // Don't allow resubmission once already submitted (stage 3+)
  if (existing.stage >= 3) {
    return NextResponse.json({ error: 'Form already submitted' }, { status: 409 })
  }

  const { error } = await svc()
    .from('landlord_onboarding')
    .update({
      entity_type,
      property_count,
      form_data: { ...form_data, __sections_saved: ['type','identity','ownership','bank','declaration'] },
      stage: 3,
      docs_received_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('token', token)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
