// GET /api/admin/upkeep?propertyId= — what's been spent on each part of the house, and when it was last decorated
// (lib/property/upkeep). Office only.
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { upkeepFor } from '@/lib/property/upkeep'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('propertyId') ?? ''
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Which house?' }, { status: 400 })
  return NextResponse.json(await upkeepFor(createServiceClient() as any, id))
}
