// GET  /api/admin/quick-notify?property_id=…  — everything the Quick Notify window needs for one house: who lives
//      there now (and who has the app on their phone), its rooms, the HMO licence details for the licence messages,
//      the tenant guides, and whether messages you send are switched on.
// POST /api/admin/quick-notify — send to the tenants (or cleaners) you picked: an in-app message always, then push /
//      email / text as chosen. Sent by you, so it follows the "messages you send" switch, not the automatic pause.
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createClient } from '@supabase/supabase-js'
import { insertNotifications, activeTenantIds, dispatchChannels, type NotifyChannels } from '@/lib/serverNotify'
import { getElectedCommsLive } from '@/lib/comms'
import { displayName, dearName, isTestEmail } from '@/lib/people'
import { senderFor } from '@/lib/email/sender'
import { hmoNoticeDefaults } from '@/lib/letters/hmoNotice'
import { sendQuickNotify } from '@/lib/notify/quickSend'
import { houseCleanerIds } from '@/lib/cleaners/regular'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const svc = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const SIGN_IN_AGAIN = 'We couldn’t confirm it’s you — please sign out and sign in again (with your code, if you use two-step sign-in).'
const CHANNELS: NotifyChannels[] = ['push_email', 'push_only', 'push_email_sms']
const ukToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })

export async function GET(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: SIGN_IN_AGAIN }, { status: 401 })
  const propertyId = req.nextUrl.searchParams.get('property_id') ?? ''
  const s = svc()
  const { data: prop } = await s.from('properties').select('id, name, address, postcode, license_number, license_expiry').eq('id', propertyId).maybeSingle()
  if (!prop) return NextResponse.json({ error: 'That house isn’t in CROS any more.' }, { status: 404 })

  const today = ukToday()
  const [{ data: rooms }, { data: lets }, { data: guides }, { count: cleaners }, sendingOn, hmo] = await Promise.all([
    s.from('rooms').select('id, name').eq('property_id', propertyId),
    s.from('tenancies').select('room_id, person_id, co_tenant_id, rooms(name)').eq('property_id', propertyId).lte('start_date', today).or(`end_date.is.null,end_date.gte.${today}`),
    s.from('tenant_guides').select('id, slug, title, emoji, sort_order').eq('is_published', true).order('sort_order'),
    houseCleanerIds(s, propertyId).then(ids => ({ count: ids.length })),   // this house's cleaners, not every cleaner
    getElectedCommsLive(),
    hmoNoticeDefaults(s, propertyId, await senderFor(req)).catch(() => null),
  ])

  const ids = [...new Set(((lets ?? []) as any[]).flatMap(t => [t.person_id, t.co_tenant_id]).filter(Boolean))] as string[]
  const [{ data: people }, { data: subs }, { data: blocks }] = await Promise.all([
    ids.length ? s.from('people').select('id, salutation, first_name, last_name, full_name, email, phone').in('id', ids) : Promise.resolve({ data: [] as any[] }),
    ids.length ? s.from('push_subscriptions').select('person_id').in('person_id', ids) : Promise.resolve({ data: [] as any[] }),
    s.from('guide_blocks').select('guide_id'),
  ])
  const withApp = new Set(((subs ?? []) as any[]).map(x => x.person_id))
  const tenants = ((lets ?? []) as any[]).flatMap(t => [t.person_id, t.co_tenant_id].filter(Boolean).map((pid: string) => ({ pid, t })))
    .map(({ pid, t }) => {
      const p = ((people ?? []) as any[]).find(x => x.id === pid)
      return p && {
        personId: pid, name: displayName(p), dear: dearName(p), room: t.rooms?.name ?? '', roomId: t.room_id,
        hasApp: withApp.has(pid), hasEmail: !!p.email, hasMobile: !!p.phone, test: isTestEmail(p.email),
      }
    })
    .filter(Boolean)
    .filter((x: any, i: number, all: any[]) => all.findIndex(y => y.personId === x.personId) === i)
    .sort((a: any, b: any) => a.room.localeCompare(b.room, undefined, { numeric: true }))

  const blockCount = new Map<string, number>()
  for (const b of (blocks ?? []) as any[]) blockCount.set(b.guide_id, (blockCount.get(b.guide_id) ?? 0) + 1)
  const f = hmo?.fields
  return NextResponse.json({
    property: { id: prop.id, name: prop.name || String(prop.address ?? '').split(/\n|,/)[0], address: f?.propertyAddress ?? [prop.name, prop.address, prop.postcode].filter(Boolean).join(', ') },
    rooms: ((rooms ?? []) as any[]).sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true })),
    tenants,
    cleaners: cleaners ?? 0,
    guides: ((guides ?? []) as any[]).map(g => ({ slug: g.slug, title: g.title, emoji: g.emoji, sections: blockCount.get(g.id) ?? 0 })),
    hmo: {
      council_name: f?.council.name ?? '',
      council_contact: f ? [f.council.address, f.council.phone, f.council.email].filter(Boolean).join(' · ') : '',
      holder_name: f?.holder.name ?? '',
      submit_by: f?.submitBy ?? '',
      licence_number: prop.license_number ?? '',
      licence_expiry: prop.license_expiry ? String(prop.license_expiry).slice(0, 10) : '',
    },
    sendingOn,
  })
}

export async function POST(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: SIGN_IN_AGAIN }, { status: 401 })
  return sendQuickNotify(req, await req.json().catch(() => ({})))
}
