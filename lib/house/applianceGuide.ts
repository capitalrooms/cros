// The approved care guide for one appliance, as text for the fault-reporting AI (6 Nov 2026 — migration 269).
// Only ever an approved guide; anything else (or no appliance) gives ''. Server-only.
import { createServiceClient } from '@/lib/supabase'
import { guideText } from '@/lib/house/careGuide'

export async function approvedGuide(applianceId: unknown): Promise<string> {
  if (typeof applianceId !== 'string' || !/^[0-9a-f-]{36}$/i.test(applianceId)) return ''
  const { data } = await createServiceClient().from('property_appliances').select('guide, guide_status').eq('id', applianceId).is('removed_at', null).maybeSingle() as { data: any }
  return data?.guide_status === 'approved' ? guideText(data.guide).slice(0, 4000) : ''
}
