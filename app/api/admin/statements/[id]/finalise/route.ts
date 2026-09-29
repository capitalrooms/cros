// POST /api/admin/statements/[id]/finalise { charges: [{ id, amount }], expenseIds: string[] }
// After a generated statement is saved: record that this rent and these expenses are now on a statement,
// so the next statement doesn't count them again.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/adminAuth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const charges: { id: string; amount: number }[] = Array.isArray(body.charges) ? body.charges : []
  const expenseIds: string[] = Array.isArray(body.expenseIds) ? body.expenseIds.filter(Boolean) : []
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

  const { data: st } = await s.from('landlord_statements').select('id, property_id').eq('id', id).maybeSingle()
  if (!st) return NextResponse.json({ error: 'Statement not found' }, { status: 404 })

  const problems: string[] = []
  for (const c of charges) {
    const { error } = await s.from('rent_charges').update({ remitted_amount: Number(c.amount), remitted_statement_id: id })
      .eq('id', c.id).eq('property_id', st.property_id)
    if (error) { problems.push(error.code === '42703' ? 'Run migration 185 so paid-over rent is tracked.' : error.message); break }
  }
  if (expenseIds.length) {
    const { error } = await s.from('recharge_expenses').update({ included_in_statement_id: id })
      .in('id', expenseIds).eq('property_id', st.property_id).is('included_in_statement_id', null)
    if (error) problems.push(error.message)
  }
  return NextResponse.json({ ok: problems.length === 0, warning: problems[0] ?? null })
}
