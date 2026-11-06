// GET /api/tenant/appliances — the appliances in the signed-in tenant's house that the office shows to tenants
// (migration 268). Used by the house information page and by fault reporting ("by dishwasher, do you mean the Bosch
// SMS2ITW08G?"). Only their own house, only what's marked for tenants.
import { NextRequest, NextResponse } from 'next/server'
import { requireSignedIn } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { APPLIANCE_KINDS } from '@/lib/house/snap'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const who = await requireSignedIn(req)
  if (!who) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const s = createServiceClient()
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  const { data: t } = await s.from('tenancies').select('property_id').or(`person_id.eq.${who.personId},co_tenant_id.eq.${who.personId}`)
    .is('let_cancelled_at', null).or(`end_date.is.null,end_date.gte.${today}`).order('start_date', { ascending: false }).limit(1).maybeSingle()
  if (!t) return NextResponse.json({ appliances: [] })
  const { data } = await s.from('property_appliances').select('id, kind, brand, model, location, bought_on').eq('property_id', (t as any).property_id).eq('visible_to_tenants', true).is('removed_at', null).order('kind')
  return NextResponse.json({ appliances: ((data ?? []) as any[]).map(a => ({ ...a, label: APPLIANCE_KINDS[a.kind] ?? 'Appliance' })) })
}
