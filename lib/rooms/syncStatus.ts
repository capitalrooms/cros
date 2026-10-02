// Keep every managed room's status in step with its tenancies (run daily, and from Health Check):
//   • a current tenancy with notice recorded      → on notice
//   • a current tenancy, no notice                → occupied
//   • no current tenancy after a notice (room on notice, or notice recorded) → available
// Let-only rooms are skipped: the landlord manages who lives there, so CROS may not hold the tenancy.
import type { SupabaseClient } from '@supabase/supabase-js'

export interface RoomStatusChange { roomId: string; room: string; property: string; from: string; to: string }

export async function syncRoomStatuses(s: SupabaseClient, opts: { apply: boolean }): Promise<RoomStatusChange[]> {
  const today = new Date().toISOString().slice(0, 10)
  const [{ data: rooms, error }, { data: lets, error: tErr }, { data: ended }, { data: incoming }] = await Promise.all([
    s.from('rooms').select('id, name, status, is_let_only, available_date, properties(name, letting_type)'),
    s.from('tenancies').select('room_id, start_date, end_date, notice_received_date')
      .lte('start_date', today).or(`end_date.is.null,end_date.gte.${today}`),
    s.from('tenancies').select('room_id').lt('end_date', today).not('notice_received_date', 'is', null),
    // let agreed: someone is moving in later (a let that fell through has an end date before its start)
    s.from('tenancies').select('room_id').gt('start_date', today).or(`end_date.is.null,end_date.gte.${today}`),
  ])
  const letAgreed = new Set(((incoming ?? []) as any[]).map(t => t.room_id))
  // A room is freed only after a real move-out: the room was on notice, or the ended tenancy had notice recorded.
  // An end date with no notice is usually a fixed-term end — the tenant carries on (periodic), so the room stays let
  // and Health Check asks a person to confirm. A room marked occupied with no tenancy at all is also left for a person.
  const leftWithNotice = new Set(((ended ?? []) as any[]).map(t => t.room_id))
  if (error || tErr) throw new Error((error || tErr)!.message)
  const current = new Map<string, any[]>()
  for (const t of (lets ?? []) as any[]) if (t.room_id) current.set(t.room_id, [...(current.get(t.room_id) ?? []), t])

  const changes: RoomStatusChange[] = []
  for (const r of (rooms ?? []) as any[]) {
    if (r.is_let_only || r.properties?.letting_type === 'let_only') continue
    const ts = current.get(r.id) ?? []
    let want: string
    if (letAgreed.has(r.id)) want = 'occupied'   // let agreed: off the market, even while the outgoing tenant is still there
    else if (!ts.length) {
      if (r.status === 'occupied' && !leftWithNotice.has(r.id)) continue
      want = 'available'
    }
    else if (ts.some(t => t.notice_received_date && t.end_date)) want = 'on_notice'
    else if (r.status === 'on_notice' && ts.some(t => t.end_date)) want = 'on_notice'   // notices recorded before the received date was saved
    else want = 'occupied'
    if (want === r.status) continue
    changes.push({ roomId: r.id, room: r.name, property: String(r.properties?.name || '').split('\n')[0], from: r.status, to: want })
    if (opts.apply) {
      await s.from('rooms').update({
        status: want,
        // newly vacant: available from today unless a later date is already set
        ...(want === 'available' && (!r.available_date || r.available_date < today) ? { available_date: today } : {}),
      }).eq('id', r.id)
    }
  }
  return changes
}
