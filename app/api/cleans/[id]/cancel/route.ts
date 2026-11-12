// POST /api/cleans/<id>/cancel { reason, tellCleaner?, tellTenants? } — the office calls off a clean (12 Nov 2026,
// Harry: "how does cancelling work with … cleaners"). Kept, marked cancelled with the reason in the office note, and
// dropped from the lists. The cleaner gets a text and an app notice; the tenants get the usual "clean cancelled"
// message (lib/cleans/tenantUpdates — email or app, as set for the house). Office staff only.
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { tellTenantsAboutClean } from '@/lib/cleans/tenantUpdates'
import { insertNotifications } from '@/lib/serverNotify'
import { sendServerPush } from '@/lib/serverPush'
import { sendSms } from '@/lib/sms'
import { hiName } from '@/lib/people'

export const dynamic = 'force-dynamic'
const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await requireStaff(req)
  if (!me) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const { id } = await params
  const b = await req.json().catch(() => ({}))
  const reason = String(b.reason ?? '').trim().slice(0, 500)
  if (reason.length < 3) return NextResponse.json({ error: 'Say why — it’s kept on the record' }, { status: 400 })
  const s = createServiceClient()
  const { data: c } = await s.from('cleans').select('id, status, cleaner_id, clean_date, clean_time, admin_note, properties(name)').eq('id', id).maybeSingle() as { data: any }
  if (!c) return NextResponse.json({ error: 'Clean not found' }, { status: 404 })
  if (['completed', 'cancelled'].includes(c.status)) return NextResponse.json({ error: `It’s already ${c.status}` }, { status: 409 })
  const stamp = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'Europe/London' })
  const { error } = await s.from('cleans').update({ status: 'cancelled', admin_note: [c.admin_note, `[${stamp}] Cancelled: ${reason}`].filter(Boolean).join('\n') }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  const told: string[] = []
  // tenants first (the message reads the clean's date and house)
  if (b.tellTenants !== false) { const r: any = await tellTenantsAboutClean(s as any, id, 'cancelled', { note: undefined }, req).catch(() => null); if (r?.sent || r?.count || r?.emailCount) told.push('the tenants') }
  if (b.tellCleaner !== false && c.cleaner_id) {
    const house = String(c.properties?.name ?? 'the house').split('\n')[0]
    const body = `The clean at ${house} on ${day(c.clean_date)}${c.clean_time ? ` at ${String(c.clean_time).slice(0, 5)}` : ''} is cancelled — no need to go. ${reason}`
    await insertNotifications(s, [c.cleaner_id], { title: 'Clean cancelled', body, type: 'cleaning', link: '/cleaner' })
    await sendServerPush({ personId: c.cleaner_id, title: 'Clean cancelled', body, url: '/cleaner', tag: `clean-${id}` })
    const { data: p } = await s.from('people').select('first_name, full_name, phone').eq('id', c.cleaner_id).maybeSingle() as { data: any }
    if (p?.phone) await sendSms(p.phone, `Hi ${hiName(p)}, ${body.charAt(0).toLowerCase()}${body.slice(1)} -Capital Rooms`)
    told.push('the cleaner')
  }
  return NextResponse.json({ ok: true, told })
}
