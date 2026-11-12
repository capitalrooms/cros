// GET /api/admin/market/insight?style=&season= → { subject, html, styles } — the quarterly market insight preview
// (lib/rents/insight). Office staff.
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { londonInsight, insightHtml, STYLES, type InsightStyle, type Season } from '@/lib/rents/insight'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const style = (['editorial', 'ink', 'graphic'].includes(String(req.nextUrl.searchParams.get('style'))) ? req.nextUrl.searchParams.get('style') : 'editorial') as InsightStyle
  const seasonQ = req.nextUrl.searchParams.get('season')
  const i = await londonInsight(createServiceClient() as any)
  const season = (['winter', 'spring', 'summer', 'autumn'].includes(String(seasonQ)) ? seasonQ : i.quarter.season) as Season
  return NextResponse.json({ ...insightHtml(i, style, season), styles: STYLES, quarter: i.quarter })
}
