/**
 * POST /api/tenant/notices/[id]/resolve
 * Marks a notice as resolved. Bearer token auth (cookie-based auth is broken in this Next.js version).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sb = serviceClient()
  const { data: { user }, error: authErr } = await sb.auth.getUser(token)
  if (authErr || !user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: person } = await sb
    .from('people')
    .select('id')
    .eq('email', user.email)
    .maybeSingle()

  if (!person) return NextResponse.json({ error: 'Person not found' }, { status: 404 })

  // Check notice exists and is still active
  const { data: existing } = await sb
    .from('communal_notices')
    .select('id, status')
    .eq('id', id)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: 'Notice not found' }, { status: 404 })
  if (existing.status === 'resolved') return NextResponse.json({ error: 'Already resolved' }, { status: 409 })

  const body = await req.json().catch(() => ({}))
  const { resolved_photo_url } = body

  const { data: notice, error } = await sb
    .from('communal_notices')
    .update({
      status: 'resolved',
      resolved_by: person.id,
      resolved_at: new Date().toISOString(),
      resolved_photo_url: resolved_photo_url || null,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('[notices resolve]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ notice })
}
