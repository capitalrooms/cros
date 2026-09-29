// PATCH /api/admin/tenancies/:id/fee  { type: 'property' | 'pct_received' | 'pct_charged' | 'fixed', pct?, fixed? }
// Sets this tenancy's own management fee, or 'property' to go back to the property's default.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/adminAuth'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const { id } = await params
  const b = await req.json().catch(() => ({}))
  const type = String(b.type || '')
  let update: Record<string, unknown>
  if (type === 'property') update = { management_fee_type: null, management_fee_pct: null, management_fee_fixed: null }
  else if (type === 'fixed') {
    const fixed = Number(b.fixed)
    if (!(fixed >= 0)) return NextResponse.json({ error: 'Enter the fixed monthly fee in £.' }, { status: 400 })
    update = { management_fee_type: 'fixed', management_fee_pct: null, management_fee_fixed: Math.round(fixed * 100) / 100 }
  } else if (type === 'pct_received' || type === 'pct_charged') {
    const pct = Number(b.pct)
    if (!(pct >= 0 && pct <= 100)) return NextResponse.json({ error: 'Enter a percentage between 0 and 100.' }, { status: 400 })
    update = { management_fee_type: type, management_fee_pct: pct, management_fee_fixed: null }
  } else return NextResponse.json({ error: 'Choose a fee type.' }, { status: 400 })
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { error } = await s.from('tenancies').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
