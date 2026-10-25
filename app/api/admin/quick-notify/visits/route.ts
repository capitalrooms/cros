// POST /api/admin/quick-notify/visits — Quick Notify for lettings staff without Comms (24 Oct 2026, Harry: "for
// viewings etc or visits only"): the same send, but only a ready-made Viewings & visits or Photography message (its
// wording can be changed), only to the house's tenants. In the Lettings and Diary areas (lib/access/areas).
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { sendQuickNotify } from '@/lib/notify/quickSend'
import { TENANT_MESSAGES, VISIT_PURPOSES } from '@/lib/notify/tenantMessages'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const msg = TENANT_MESSAGES.find(m => m.id === b.message_id)
  if (!msg || !VISIT_PURPOSES.includes(msg.purpose)) {
    return NextResponse.json({ error: 'You can send viewing and visit messages — other messages are part of Comms. Ask an administrator if you need it.' }, { status: 403 })
  }
  if (b.recipient_type === 'cleaners') return NextResponse.json({ error: 'Viewing and visit messages go to the tenants.' }, { status: 403 })
  return sendQuickNotify(req, b)
}
