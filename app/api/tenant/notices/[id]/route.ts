/**
 * DELETE /api/tenant/notices/[id]
 * Withdraws (deletes) a notice. Only the original poster can delete their own notice.
 * House reminders store created_by in the DB (hidden from UI for anonymity) —
 * so the original poster can still withdraw them.
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

export async function DELETE(
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

  // Verify the notice belongs to this person before deleting
  const { data: notice } = await sb
    .from('communal_notices')
    .select('id, created_by, notice_type')
    .eq('id', id)
    .maybeSingle()

  if (!notice) return NextResponse.json({ error: 'Notice not found' }, { status: 404 })
  if (notice.created_by !== person.id) {
    return NextResponse.json({ error: 'You can only withdraw your own notices' }, { status: 403 })
  }

  const { error } = await sb
    .from('communal_notices')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('[notices DELETE]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
