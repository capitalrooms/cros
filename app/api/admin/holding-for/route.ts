// GET /api/admin/holding-for?applicantId= | ?tenancyId= — the holding deposit that counts towards the move-in money,
// from the one source (lib/lettings/holdingFor): { amount, source, holds, problem }. Office and lettings staff.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'
import { holdingFor } from '@/lib/lettings/holdingFor'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const q = req.nextUrl.searchParams
  const id = (v: string | null) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : null)
  const tenancyId = id(q.get('tenancyId')), applicantId = id(q.get('applicantId'))
  if (!tenancyId && !applicantId) return NextResponse.json({ error: 'tenancyId or applicantId required' }, { status: 400 })
  return NextResponse.json(await holdingFor(createServiceClient(), { tenancyId, applicantId }))
}
