// POST /api/notify-job-update { ticketId, kind, line, whole? } — tell the tenants about their repair (lib/notify/jobUpdate):
// inbox entry named after the job, plus a phone notification where tenant messages are on. The office, or the
// contractor the job belongs to.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireSignedIn, isStaff } from '@/lib/portalAuth'
import { tellJobTenants } from '@/lib/notify/jobUpdate'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const c = await requireSignedIn(req)
  if (!c || c.viewingAsBy) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const id = String(b.ticketId ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Which job?' }, { status: 400 })
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: t } = await s.from('maintenance_tickets').select('contractor_id').eq('id', id).maybeSingle() as { data: any }
  if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!isStaff(c) && !(c.role === 'contractor' && t.contractor_id === c.personId)) return NextResponse.json({ error: 'Not your job' }, { status: 403 })
  const kind = ['approved', 'booked', 'arrived', 'done', 'note'].includes(b.kind) ? b.kind : 'note'
  const line = String(b.line ?? '').trim().slice(0, 300)
  if (!line) return NextResponse.json({ error: 'Say what to tell them.' }, { status: 400 })
  return NextResponse.json({ ok: true, ...(await tellJobTenants(s as any, id, { kind, line, whole: !!b.whole })) })
}
