// Hourly, 8am–8pm: normal repair jobs keep moving when nobody presses anything (lib/jobs/watch). Vercel cron.
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { watchJobs } from '@/lib/jobs/watch'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const hour = Number(new Date().toLocaleString('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Europe/London' }))
  if (hour < 8 || hour >= 20) return NextResponse.json({ ok: true, skipped: 'outside 8am–8pm' })   // nobody is chased at night
  const done = await watchJobs(createServiceClient() as any)
  return NextResponse.json({ ok: true, done })
}
