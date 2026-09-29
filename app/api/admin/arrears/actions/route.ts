// POST /api/admin/arrears/actions { tenancyId, action, note?, promisedAmount?, promisedDate? } — log an arrears contact.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/adminAuth'

export const dynamic = 'force-dynamic'
const ACTIONS = ['reminder', 'letter', 'call', 'text', 'promise', 'payment_plan', 'note', 'legal']

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  if (!b.tenancyId || !ACTIONS.includes(b.action)) return NextResponse.json({ error: 'Choose what happened.' }, { status: 400 })
  const amount = b.promisedAmount === '' || b.promisedAmount == null ? null : Number(String(b.promisedAmount).replace(/[£,\s]/g, ''))
  if (amount != null && !isFinite(amount)) return NextResponse.json({ error: 'The promised amount must be a number.' }, { status: 400 })
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { error } = await s.from('arrears_actions').insert({
    tenancy_id: b.tenancyId, action: b.action, note: String(b.note || '').trim() || null,
    promised_amount: amount, promised_date: /^\d{4}-\d{2}-\d{2}$/.test(b.promisedDate || '') ? b.promisedDate : null, created_by: admin.personId,
  })
  if (error) return NextResponse.json({ error: error.code === 'PGRST205' ? 'Run migration 189 in Supabase to switch on the contact log.' : error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
