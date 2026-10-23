// POST /api/applicants/[id]/accept-offer — the reserve email to one applicant (lib/lettings/reserveEmail, the one
// version every screen sends).
//   { preview: true, rent? } → { to, subject, html, sms, rent, deposit, pinned, asking, earlier } — nothing sent
//   { rent }                 → sends it, pins that rent on their offer, moves them to "offer sent"
// With no rent on file and none typed: 409 { needRent } so the screen asks.
import { createClient } from '@supabase/supabase-js'
import { deliverEmail } from '@/lib/sendEmail'
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { draftReserve, pinReserve } from '@/lib/lettings/reserveEmail'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireStaff(request))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const d = await draftReserve(supabase, id, body?.rent, request)
  if ('error' in d) return NextResponse.json({ error: d.error }, { status: d.status })
  if (body?.preview) return NextResponse.json(d)
  if (!d.rent) return NextResponse.json({ error: 'What monthly rent has been agreed?', needRent: true }, { status: 409 })
  if (!process.env.RESEND_API_KEY) return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 })
  const sent = await deliverEmail({ to: [d.to], subject: d.subject, html: d.html }, { req: request })
  if (!sent.ok) return NextResponse.json({ error: `The email didn’t send: ${await sent.text().catch(() => 'unknown error')}` }, { status: 502 })
  await pinReserve(supabase, id, d.rent)
  return NextResponse.json({ success: true, emailSent: d.to, reserveUrl: d.reserveUrl, rent: d.rent })
}
