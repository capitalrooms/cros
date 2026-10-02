import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentUser } from '@/lib/serverAuth'
import { createIncomingTenancy } from '@/lib/lettings/incomingTenancy'

/**
 * POST /api/applicants/[id]/convert
 *
 * Converts an applicant into a tenant: links or creates their person record and creates the incoming tenancy
 * (lib/lettings/incomingTenancy — the same step the holding deposit takes). Body: optional tenancy overrides.
 */
export async function POST(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['lettings','administrator','admin'].includes(user.assignment?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const body = await req.json().catch(() => ({}))
  const r = await createIncomingTenancy(sb, params.id, body, user.email ?? null)
  if (r.alreadyConverted) return NextResponse.json({ error: 'Already converted', personId: r.personId, tenancyId: r.tenancyId }, { status: 409 })
  if (r.error) return NextResponse.json({ error: r.error, personId: r.personId }, { status: r.status ?? 500 })

  return NextResponse.json({
    success: true,
    personId: r.personId,
    tenancyId: r.tenancyId,
    message: 'Converted to tenant',
  })
}
