// Monthly cron (1st, 05:00 UTC): raise this month's rent charges for every running tenancy.
// Idempotent — rooms already charged for the month are skipped — so it's safe to re-run by hand.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateMonthCharges } from '@/lib/rentCharges/generate'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const now = new Date()
  const month = req.nextUrl.searchParams.get('month') || `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  try {
    const result = await generateMonthCharges(s, month)
    console.log('[cron generate-charges]', JSON.stringify(result))
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    console.error('[cron generate-charges] failed:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}
