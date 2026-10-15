// GET  /api/visits — the properties (and, for the office, rooms) the signed-in person may pop by
// POST /api/visits { propertyId, roomId?, date, from, to, reason, tenantAgreed? } — tell the tenants, log it, and
//      return the key safe code. Contractors: shared areas only. See lib/access/visits.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireSignedIn, isStaff } from '@/lib/portalAuth'
import { visitOptions, createVisit, VISIT_DAYS_AHEAD } from '@/lib/access/visits'

export const dynamic = 'force-dynamic'
const svc = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

export async function GET(req: NextRequest) {
  const c = await requireSignedIn(req)
  if (!c) return NextResponse.json({ error: 'Sign in first' }, { status: 401 })
  if (!isStaff(c) && c.role !== 'contractor') return NextResponse.json({ error: 'Not available' }, { status: 403 })
  return NextResponse.json({ properties: await visitOptions(svc(), c), canChooseRoom: isStaff(c), daysAhead: VISIT_DAYS_AHEAD })
}

export async function POST(req: NextRequest) {
  const c = await requireSignedIn(req)
  if (!c) return NextResponse.json({ error: 'Sign in first' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const r = await createVisit(svc(), c, {
    propertyId: String(b.propertyId ?? ''), roomId: b.roomId ? String(b.roomId) : null, date: String(b.date ?? ''),
    from: String(b.from ?? ''), to: String(b.to ?? ''), reason: String(b.reason ?? ''), tenantAgreed: b.tenantAgreed === true,
  }, req)
  return NextResponse.json(r.body, { status: r.status })
}
