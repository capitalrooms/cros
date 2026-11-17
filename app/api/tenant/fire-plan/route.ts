// GET /api/tenant/fire-plan — the fire evacuation plan for the tenant's home (migration 292), for the simple in-app card.
import { NextRequest, NextResponse } from 'next/server'
import { requireSignedIn } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export async function GET(req: NextRequest) {
  const me = await requireSignedIn(req)
  if (!me) return NextResponse.json({ error: 'Please sign in again' }, { status: 401 })
  const s = createServiceClient()
  const today = new Date().toISOString().slice(0, 10)
  const { data: t } = await s.from('tenancies').select('property_id').or(`person_id.eq.${me.personId},co_tenant_id.eq.${me.personId}`).is('let_cancelled_at', null).lte('start_date', today).or(`end_date.is.null,end_date.gte.${today}`).limit(1).maybeSingle() as { data: any }
  if (!t) return NextResponse.json({ plan: null })
  const { data: p } = await s.from('properties').select('fire_plan').eq('id', t.property_id).maybeSingle() as { data: any }
  return NextResponse.json({ plan: p?.fire_plan ?? null })
}
