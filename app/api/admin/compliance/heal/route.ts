// POST /api/admin/compliance/heal { propertyId? } — certificates on file whose dates aren't on the house yet get read
// and applied (lib/compliance/certFromDocument). Called when a property's compliance is opened, so certificates filed
// before 27 Oct 2026 through the general upload stop showing as missing. Office staff only.
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { healPropertyCerts } from '@/lib/compliance/certFromDocument'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const out = await healPropertyCerts(createServiceClient(), typeof b.propertyId === 'string' ? b.propertyId : null, b.propertyId ? 8 : 6)
  return NextResponse.json({ ok: true, updated: out.filter(o => o.result?.updated).length, results: out })
}
