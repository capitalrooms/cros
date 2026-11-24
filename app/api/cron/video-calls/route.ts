// Scheduled every 30 minutes: 6-hour reminder, office follow-up after two working days, and the post-call question.
import { runCallReminders } from '@/lib/calls/server'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  return Response.json({ ok: true, sent: await runCallReminders() })
}
