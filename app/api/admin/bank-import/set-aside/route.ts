/**
 * POST /api/admin/bank-import/set-aside
 * A bank line that isn't rent (a holding deposit, a landlord's top-up, a refund…) leaves the matching queue,
 * or comes back to it. Nothing is paid or unpaid: only the line's status changes ('ignored' ⇄ 'unmatched',
 * migration 168), with who and when.
 *
 * Body: { transaction_id: string, action: 'set_aside' | 'restore' }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/serverAuth'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { data: person } = await supabase
    .from('people').select('id, role').eq('email', session.user.email).single()
  if (!person || !['administrator', 'admin', 'lettings'].includes(person.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { transaction_id, action } = await req.json().catch(() => ({}))
  if (!transaction_id || !['set_aside', 'restore'].includes(action))
    return NextResponse.json({ error: 'transaction_id and action (set_aside or restore) are required' }, { status: 400 })

  const [from, to] = action === 'set_aside' ? ['unmatched', 'ignored'] : ['ignored', 'unmatched']
  const { data, error } = await supabase.from('bank_transactions')
    .update(action === 'set_aside'
      ? { status: to, matched_at: new Date().toISOString(), matched_by: person.id }
      : { status: to, matched_at: null, matched_by: null })
    .eq('id', transaction_id).eq('status', from).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: action === 'set_aside' ? 'That line has already been matched or set aside' : 'That line isn’t set aside' }, { status: 409 })
  return NextResponse.json({ ok: true })
}
