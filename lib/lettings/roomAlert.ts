// Tell the lettings team a room is coming up: on notice (available from the move-out date) or available now.
// In-app notification + push to everyone with the lettings role. Staff only — never tenants or landlords.
// Called wherever a room is freed: notice recorded (office or tenant), the nightly room-status check, a let that
// fell through. Never throws — a missed alert mustn't stop the thing that triggered it.

import type { SupabaseClient } from '@supabase/supabase-js'
import { insertNotifications } from '@/lib/serverNotify'
import { sendServerPush } from '@/lib/serverPush'

const day = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

export async function alertLettingsRoomUp(s: SupabaseClient, roomId: string, opts: { availableFrom?: string | null; why: string }) {
  try {
    const { data: room } = await s.from('rooms').select('id, name, property_id, current_asking_rent, is_let_only, properties(name)').eq('id', roomId).maybeSingle() as { data: any }
    if (!room) return
    const { data: team } = await s.from('people').select('id').eq('role', 'lettings')
    const ids = ((team ?? []) as any[]).map(p => p.id)
    if (!ids.length) return
    const where = [room.name, String(room.properties?.name ?? '').split('\n')[0]].filter(Boolean).join(', ')
    const from = opts.availableFrom ? `available from ${day(opts.availableFrom)}` : 'available now'
    const title = opts.availableFrom ? '🔔 Room coming up' : '🔑 Room available'
    const body = `${where} — ${from}${room.current_asking_rent ? ` · £${Number(room.current_asking_rent).toLocaleString('en-GB')} pcm` : ''}. ${opts.why}`
    await insertNotifications(s, ids, { title, body, type: 'lettings', link: '/lettings?tab=available' }, { propertyId: room.property_id, roomId: room.id })
    await sendServerPush({ personIds: ids, title, body, url: '/lettings?tab=available', tag: `room-up-${room.id}` })
  } catch (e) {
    console.warn('lettings room alert not sent', e)
  }
}
