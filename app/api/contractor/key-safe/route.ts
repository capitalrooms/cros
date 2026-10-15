// GET /api/contractor/key-safe?jobId= — the key safe code for a contractor's BOOKED job (shown on the job page).
// Codes are never read by the apps directly (lib/access/keySafe).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireSignedIn, isStaff } from '@/lib/portalAuth'
import { readKeySafe } from '@/lib/access/keySafe'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const c = await requireSignedIn(req)
  if (!c) return NextResponse.json({ error: 'Sign in first' }, { status: 401 })
  const jobId = req.nextUrl.searchParams.get('jobId') ?? ''
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: t } = await s.from('maintenance_tickets').select('property_id, contractor_id, booked_date, status').eq('id', jobId).maybeSingle()
  if (!t) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  const mine = isStaff(c) || (c.role === 'contractor' && (t as any).contractor_id === c.personId)
  const booked = !!(t as any).booked_date && !['completed', 'cancelled'].includes(String((t as any).status))
  if (!mine || !booked) return NextResponse.json({ keySafe: null })
  return NextResponse.json({ keySafe: await readKeySafe(s, (t as any).property_id) })
}
