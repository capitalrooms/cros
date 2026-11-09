'use client'

// The room's own tools, on the room page (4 Nov 2026): they used to sit only in a second room view inside the house's
// Units tab ("Manage"), so a room had two screens. Confirm the tenant has left · mark a room let outside CROS / make it
// available again · delete a room that has never had a tenancy. Same writes as that view did.
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { RoomOverview } from '@/lib/rooms/roomOverview'

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
const btn = 'inline-flex min-h-[36px] items-center justify-center rounded-lg border border-neutral-300 bg-white px-md text-sm font-semibold text-neutral-900 hover:bg-neutral-50 disabled:opacity-40'

export default function RoomTools({ o, propertyId, onDone }: { o: RoomOverview; propertyId: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const supabase = createClient() as any   // untyped tables, as in the house's Units tab
  const cur = o.current
  const where = o.whole ? 'the property' : o.room.name
  const leaving = !!cur && (o.stage === 'on_notice' || (!!cur.end && cur.end <= o.today))
  const neverLet = !o.whole && !cur && !o.incoming && o.expired.length === 0   // a single let's one unit is never deleted from here

  async function run(f: () => Promise<string>) {
    setBusy(true); setMsg('')
    try { setMsg(await f()); onDone() } catch (e: any) { setMsg(e?.message ?? 'That didn’t work — try again') } finally { setBusy(false) }
  }
  const confirmLeft = () => run(async () => {
    const d = window.prompt('The day they left (YYYY-MM-DD)', cur?.end && cur.end <= today() ? cur.end : today())
    if (d === null) return ''
    const on = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : today()
    const { error: e1 } = await supabase.from('tenancies').update({ end_date: on }).eq('id', cur!.id)
    if (e1) throw e1
    const { error: e2 } = await supabase.from('rooms').update({ status: o.incoming ? 'occupied' : 'available' }).eq('id', o.room.id)
    if (e2) throw e2
    return `Tenancy closed — ${where} is ${o.incoming ? 'ready for the incoming tenancy' : 'now available'}`
  })
  const setAvailability = (status: 'occupied' | 'available') => run(async () => {
    let available_date: string | undefined
    if (status === 'available') {
      const d = window.prompt('Available from (YYYY-MM-DD)', today())
      if (d === null) return ''
      available_date = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : today()
    }
    const { error } = await supabase.from('rooms').update({ status, ...(available_date ? { available_date } : {}) }).eq('id', o.room.id)
    if (error) throw error
    return status === 'available' ? `${where} is available again — back on Availability` : `${where} marked as let`
  })
  const remove = () => run(async () => {
    if (!window.confirm(`Delete ${o.room.name}? It has never had a tenancy. This cannot be undone.`)) return ''
    const { error } = await supabase.from('rooms').delete().eq('id', o.room.id)
    if (error) throw error
    window.location.href = `/admin/properties/${propertyId}`
    return 'Deleted'
  })

  if (!leaving && cur) return null
  return (
    <div className="flex flex-wrap items-center gap-sm border-t border-neutral-100 pt-sm">
      {leaving && <button type="button" disabled={busy} onClick={confirmLeft} className={btn}>Confirm the tenant has left</button>}
      {!cur && !o.incoming && (o.room.status === 'available'
        ? <button type="button" disabled={busy} onClick={() => setAvailability('occupied')} className={btn} title="Let outside CROS, or by the landlord">Mark as let</button>
        : <button type="button" disabled={busy} onClick={() => setAvailability('available')} className={btn}>Make available again</button>)}
      {neverLet && <button type="button" disabled={busy} onClick={remove} className="text-sm font-semibold text-red-700 hover:underline disabled:opacity-40">Delete room</button>}
      {msg && <p className="w-full text-sm text-neutral-700">{msg}</p>}
    </div>
  )
}
