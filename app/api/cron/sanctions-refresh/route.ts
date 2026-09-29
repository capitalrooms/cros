import { NextRequest, NextResponse } from 'next/server'
import { refreshSanctionsIndex } from '@/lib/aml/sanctions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Daily: refresh the compact UK Sanctions List index used for landlord screening.
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    return NextResponse.json({ ok: true, ...(await refreshSanctionsIndex()) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Refresh failed' }, { status: 500 })
  }
}
