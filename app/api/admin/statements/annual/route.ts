// GET /api/admin/statements/annual?landlordId=…&year=2026 — the landlord's income & expenditure summary for
// the tax year starting 6 April of `year` (defaults to the tax year that has just ended / is running).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/adminAuth'
import { contentDisposition } from '@/lib/contentDisposition'
import { renderAnnualSummary, taxYear } from '@/lib/statements/annual'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const landlordId = req.nextUrl.searchParams.get('landlordId') || ''
  const now = new Date()
  const current = now.getMonth() > 3 || (now.getMonth() === 3 && now.getDate() >= 6) ? now.getFullYear() : now.getFullYear() - 1
  const year = Number(req.nextUrl.searchParams.get('year')) || current
  if (!landlordId) return NextResponse.json({ error: 'Choose a landlord.' }, { status: 400 })
  try {
    const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
    const { pdf } = await renderAnnualSummary(s, landlordId, year)
    return new NextResponse(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': contentDisposition(`Annual summary ${taxYear(year).label}.pdf`) } })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not build the summary' }, { status: 400 })
  }
}
