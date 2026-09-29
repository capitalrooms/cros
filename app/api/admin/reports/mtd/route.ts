// GET /api/admin/reports/mtd?year=2026&landlordId= — Making Tax Digital quarterly figures per landlord (lib/finance/mtd)
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/adminAuth'
import { mtdFigures, mtdQuarters, HMRC_BOXES } from '@/lib/finance/mtd'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const now = new Date()
  const current = now.getMonth() > 3 || (now.getMonth() === 3 && now.getDate() >= 6) ? now.getFullYear() : now.getFullYear() - 1
  const year = Number(req.nextUrl.searchParams.get('year')) || current
  try {
    const rows = await mtdFigures(createServiceClient(), year, req.nextUrl.searchParams.get('landlordId'))
    return NextResponse.json({ year, quarters: mtdQuarters(year), boxes: HMRC_BOXES, rows })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not build the figures' }, { status: 500 })
  }
}
