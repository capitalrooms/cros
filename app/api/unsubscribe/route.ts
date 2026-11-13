// Unsubscribe from Capital Rooms marketing (13 Nov 2026, PECR) — the signed link in every Publish email and text.
// POST { a, t } → that address is opted out of marketing on every channel (service messages — statements, repairs,
// your tenancy — still come). Public; the signature proves the link came from us.
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { unsubToken } from '@/lib/publish'
import { toE164 } from '@/lib/sms'

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}))
  const a = String(b.a ?? '').trim().toLowerCase(), t = String(b.t ?? '')
  if (!a || t !== unsubToken(a)) return NextResponse.json({ error: 'That link isn’t right — reply to the email and we’ll take you off.' }, { status: 400 })
  const s = createServiceClient()
  const row = a.includes('@') ? { email: a } : { phone: toE164(a) ?? a }
  const { data: who } = a.includes('@') ? await s.from('people').select('id').ilike('email', a).limit(1).maybeSingle() : { data: null }
  const { error } = await s.from('comms_optouts').insert({ ...row, person_id: (who as any)?.id ?? null, kind: 'marketing', source: 'unsubscribe link' })
  if (error && !/duplicate/i.test(error.message)) return NextResponse.json({ error: 'Something went wrong — reply to the email and we’ll take you off.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
