// GET /api/admin/voids — void rate for the last 3, 6 and 12 months: overall, by landlord, by house and room by room (lib/voids).
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'
import { loadVoids } from '@/lib/voids'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try { return NextResponse.json(await loadVoids(createServiceClient())) }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not work out voids' }, { status: 500 }) }
}
