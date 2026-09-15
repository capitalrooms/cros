import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

const URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// GET /api/onboarding-steps?role=tenant
export async function GET(req: NextRequest) {
  const role = req.nextUrl.searchParams.get('role')
  if (!role) return NextResponse.json({ error: 'role required' }, { status: 400 })

  const supabase = createSupabaseClient(URL, ANON, { auth: { persistSession: false } })
  const { data, error } = await supabase
    .from('onboarding_steps')
    .select('id, sort_order, screen, title, body')
    .eq('role', role)
    .eq('active', true)
    .order('sort_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ steps: data ?? [] })
}

// PATCH /api/onboarding-steps  — admin update a single step
export async function PATCH(req: NextRequest) {
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SERVICE_KEY) return NextResponse.json({ error: 'server error' }, { status: 500 })

  const body = await req.json().catch(() => null)
  if (!body?.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const svc = createSupabaseClient(URL, SERVICE_KEY, { auth: { persistSession: false } })

  // Verify caller is admin via bearer token
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { data: ud, error: ue } = await svc.auth.getUser(token)
  if (ue || !ud.user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { data: person } = await svc.from('people').select('role').eq('email', ud.user.email).single()
  if (!['administrator', 'admin'].includes(person?.role ?? '')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id, title, body: bodyText, active, sort_order } = body
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (title     !== undefined) updates.title      = title
  if (bodyText  !== undefined) updates.body       = bodyText
  if (active    !== undefined) updates.active     = active
  if (sort_order !== undefined) updates.sort_order = sort_order

  const { error } = await svc.from('onboarding_steps').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
