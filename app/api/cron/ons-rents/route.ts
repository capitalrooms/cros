// Weekly check for a new ONS rents release (lib/rents/ons) — ONS publishes monthly, mid-month; an unchanged release
// is skipped. Vercel cron (vercel.json), signed with CRON_SECRET.
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { refreshOnsRents } from '@/lib/rents/ons'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try { return NextResponse.json({ ok: true, result: await refreshOnsRents(createServiceClient() as any) }) }
  catch (e: any) { return NextResponse.json({ error: e?.message ?? 'Failed' }, { status: 500 }) }
}
