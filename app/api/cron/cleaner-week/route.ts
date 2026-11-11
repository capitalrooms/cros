// Weekly cleaner email (11 Nov 2026, migration 276 — lib/cleans/weekPlan). Vercel runs this Sunday and Monday at
// 18:00 UTC (6pm in winter, 7pm in summer); it only sends on the day chosen on the Cleaning screen
// (system_settings 'cleaner_week_email': off · sunday · monday). Sunday's email is about the week starting the next
// day; Monday's is about the week that's just started. One email per cleaner per week, never twice.
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { londonToday, sendWeekEmails, weekEmailDay, weekForEmail } from '@/lib/cleans/weekPlan'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }
  const s = createServiceClient()
  const setting = await weekEmailDay(s)
  const today = londonToday()
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay()   // 0 Sunday, 1 Monday
  if (setting === 'off' || (setting === 'sunday' && weekday !== 0) || (setting === 'monday' && weekday !== 1)) {
    return NextResponse.json({ ok: true, skipped: `set to ${setting}; today is ${['Sunday', 'Monday'][weekday] ?? 'another day'}` })
  }
  const week = weekForEmail(today)
  const out = await sendWeekEmails(s, week)
  return NextResponse.json({ ok: true, week, ...out })
}
