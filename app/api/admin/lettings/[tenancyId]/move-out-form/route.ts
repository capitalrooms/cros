// GET /api/admin/lettings/<tenancy>/move-out-form — the tenant's online move-out form answers (migration 262) and
// their link to it, for the letting file's Notice tab (4 Nov 2026).
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { moveOutUrl } from '@/lib/checkout/moveOutLink'

export async function GET(req: NextRequest, { params }: { params: Promise<{ tenancyId: string }> }) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { tenancyId } = await params
  const { data, error } = await createServiceClient().from('move_out_forms').select('answers, cleaner_hours, cleaner_rate, cleaner_agreed_at, submitted_at, updated_at').eq('tenancy_id', tenancyId).maybeSingle()
  if (error && /move_out_forms/.test(error.message)) return NextResponse.json({ setupNeeded: true, link: moveOutUrl(tenancyId) })
  return NextResponse.json({ form: data ?? null, link: moveOutUrl(tenancyId) })
}
