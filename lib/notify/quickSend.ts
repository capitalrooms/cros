// Quick Notify's send (moved out of /api/admin/quick-notify, 24 Oct 2026, so the visits-only route for lettings staff
// sends exactly the same way): an in-app message always, then push / email / text as chosen. Sent by a person, so it
// follows the "messages you send" switch, not the automatic pause. The caller checks who is sending.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { insertNotifications, activeTenantIds, dispatchChannels, type NotifyChannels } from '@/lib/serverNotify'
import { getElectedCommsLive } from '@/lib/comms'
import { houseCleanerIds } from '@/lib/cleaners/regular'

const svc = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const CHANNELS: NotifyChannels[] = ['push_email', 'push_only', 'push_email_sms']

export async function sendQuickNotify(req: NextRequest, b: any): Promise<NextResponse> {
  if (!(await getElectedCommsLive())) return NextResponse.json({ error: '“Messages you send yourself” is switched off in Settings — switch it on to send this.' }, { status: 409 })

  const { property_id, recipient_type, room_id } = b
  const subject = String(b.subject ?? '').trim().slice(0, 200)
  const message = String(b.message ?? '').trim().slice(0, 5000)
  const channels: NotifyChannels = CHANNELS.includes(b.channels) ? b.channels : 'push_email'
  // where the message opens in the tenant app — only ever a tenant screen
  const link = typeof b.link === 'string' && /^\/tenant(\/[a-z0-9\-/]*)?$/.test(b.link) ? b.link : '/tenant/inbox'
  if (!property_id || !subject || !message || !recipient_type) return NextResponse.json({ error: 'Add a subject and a message first.' }, { status: 400 })
  if (/\{[a-z_]+\}/.test(subject + message)) return NextResponse.json({ error: 'Some details are still in {curly brackets} — fill them in before sending.' }, { status: 400 })

  const s = svc()
  try {
    let recipientIds: string[] = []
    if (recipient_type === 'cleaners') {
      // the cleaners who work at this house (its regular cleaner and whoever has its cleans) — it used to go to every
      // cleaner in CROS
      recipientIds = await houseCleanerIds(s, property_id)
    } else {
      // only ever people living at this house now
      const living = await activeTenantIds(s, property_id, recipient_type === 'room' ? room_id : null)
      if (recipient_type === 'people') {
        const picked = new Set<string>(Array.isArray(b.person_ids) ? b.person_ids.map(String) : [])
        recipientIds = living.filter(id => picked.has(id))
      } else if (recipient_type === 'individual' && b.person_id) {
        recipientIds = living.filter(id => id === b.person_id)
      } else recipientIds = living
    }
    if (recipientIds.length === 0) return NextResponse.json({ error: recipient_type === 'cleaners' ? 'No cleaner works at this house yet — choose its regular cleaner on Cleaning.' : 'No one picked lives at this house now, so there’s no one to send to.' }, { status: 400 })

    const { count, error } = await insertNotifications(s, recipientIds, { title: subject, body: message, type: 'admin', link }, { propertyId: property_id, roomId: room_id || null })
    if (error) return NextResponse.json({ error: `The message couldn’t be saved: ${error}` }, { status: 500 })

    const { pushCount, emailCount, smsCount, smsFailed } = await dispatchChannels(s, recipientIds, { title: subject, body: message, link }, channels, req, { elected: true })
    return NextResponse.json({ ok: true, recipientCount: count, pushCount, emailCount, smsCount: smsCount ?? 0, smsFailed: smsFailed ?? [] })
  } catch (e: any) {
    console.error('Quick notify error:', e)
    return NextResponse.json({ error: `Sending failed: ${e?.message ?? 'unknown error'}` }, { status: 500 })
  }
}
