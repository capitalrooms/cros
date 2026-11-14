// The daily bin-day job (14 Nov 2026, lib/bins/lookup): a few properties a day, so each is re-checked with the council
// about once a month, plus any with a fresh "the bins weren't collected" report.
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { refreshDue } from '@/lib/bins/lookup'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  return NextResponse.json({ ok: true, done: await refreshDue(createServiceClient()) })
}
