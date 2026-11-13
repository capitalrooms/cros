// Publish's hourly job (13 Nov 2026):
//  • sends anything scheduled whose time has come (and carries on a mail-out that's part-way), in batches
//  • the monthly market update: when the ONS publishes a new month of rents, a draft is made (London figures, a
//    commentary, all landlords each with their own areas) and the office is told it's ready to check — never sent on its own
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { createPublication, runSend, type Pub } from '@/lib/publish'
import { insertNotifications } from '@/lib/serverNotify'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const s = createServiceClient()
  const out: string[] = []
  // 1. due sends
  const { data: due, error } = await s.from('publications').select('*').or(`and(status.eq.scheduled,scheduled_for.lte.${new Date().toISOString()}),status.eq.sending`).limit(3)
  if (error) return NextResponse.json({ skipped: 'migration 285 not run' })
  for (const p of (due ?? []) as Pub[]) { const r = await runSend(s, p, 200_000); out.push(`${p.title}: ${r.sent} sent, ${r.failed} failed, ${r.remaining} to go`) }
  // 2. the monthly draft, once per ONS month
  const { data: latest } = await s.from('ons_rents').select('period').order('period', { ascending: false }).limit(1).maybeSingle() as { data: any }
  const period = latest?.period ? String(latest.period).slice(0, 7) : null
  if (period) {
    const { data: have } = await s.from('publications').select('id').eq('kind', 'market_update').eq('period', period).limit(1)
    if (!have?.length) {
      const id = await createPublication(s, { kind: 'market_update', by: 'CROS (monthly)', auto: true }).catch(() => null)
      if (id) {
        const { data: admins } = await s.from('people').select('id').eq('role', 'administrator')
        await insertNotifications(s, ((admins ?? []) as any[]).map(a => a.id), { title: 'Monthly market update ready to check', body: 'New rents figures are out — the landlord update is drafted for you to read, test and send.', type: 'admin', link: `/admin/publish/${id}` } as any).catch(() => null)
        out.push(`Drafted the ${period} market update`)
      }
    }
  }
  return NextResponse.json({ ok: true, done: out })
}
