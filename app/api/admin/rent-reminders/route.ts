// GET  /api/admin/rent-reminders?month=YYYY-MM — this month's rent: on time, late (and by how many days), not yet paid
// POST /api/admin/rent-reminders { month, tenancyIds, channels } — a kind reminder to each chosen tenant (thanks for a
//      late payment, or a nudge about one not yet arrived), in their app and by email or push. Chosen by staff, so it
//      follows the "messages you send yourself" switch. Unpaid ones are logged in the arrears contact log.
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/adminAuth'
import { getElectedCommsLive } from '@/lib/comms'
import { insertNotifications, dispatchChannels, type NotifyChannels } from '@/lib/serverNotify'
import { rentTiming, reminderFor } from '@/lib/rent/timing'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const thisMonth = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }).slice(0, 7)
const okMonth = (m: string | null) => (m && /^\d{4}-\d{2}$/.test(m) ? m : thisMonth())

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const month = okMonth(req.nextUrl.searchParams.get('month'))
  const out = await rentTiming(createServiceClient(), month)
  return NextResponse.json({ month, ...out, previews: Object.fromEntries(out.rows.filter(r => r.state === 'late' || r.state === 'unpaid').map(r => [r.tenancyId, reminderFor(r)])) })
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  if (!(await getElectedCommsLive())) return NextResponse.json({ error: '“Messages you send yourself” is switched off in Settings.' }, { status: 409 })
  const b = await req.json().catch(() => ({}))
  const channels: NotifyChannels = b.channels === 'push_only' ? 'push_only' : 'push_email'
  const picked = new Set<string>(Array.isArray(b.tenancyIds) ? b.tenancyIds.map(String) : [])
  const s = createServiceClient()
  const { rows } = await rentTiming(s, okMonth(b.month))
  const send = rows.filter(r => picked.has(r.tenancyId) && (r.state === 'late' || r.state === 'unpaid'))
  if (!send.length) return NextResponse.json({ error: 'Tick at least one tenant who paid late or hasn’t paid.' }, { status: 400 })

  let sent = 0, pushes = 0, emails = 0
  for (const r of send) {
    const m = reminderFor(r)
    const { error } = await insertNotifications(s, [r.personId], { title: m.title, body: m.body, type: 'admin', link: '/tenant/inbox' }, { propertyId: r.propertyId })
    if (error) continue
    const d = await dispatchChannels(s, [r.personId], { title: m.title, body: m.body, link: '/tenant/inbox' }, channels, req, { elected: true })
    sent++; pushes += d.pushCount; emails += d.emailCount
    if (r.state === 'unpaid') await s.from('arrears_actions').insert({ tenancy_id: r.tenancyId, action: 'reminder', note: `Kind reminder sent (${channels === 'push_only' ? 'app' : 'app + email'})`, created_by: admin.personId })
  }
  return NextResponse.json({ ok: true, sent, pushes, emails })
}
