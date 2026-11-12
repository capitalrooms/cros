'use client'

// Tap a viewing in the lettings diary: see the details, move it (optionally telling the house, the applicant and
// any let-only contacts), or jump to Quick Notify for it.

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

export interface SheetViewing {
  id: string
  viewing_date: string
  viewing_slot: string | null
  visitor_name: string | null
  visitor_email: string | null
  visitor_phone: string | null
  property_id: string | null
  room_id: string | null
  property_name: string
  room_name: string
}

interface Props {
  viewing: SheetViewing
  senderName: string
  onClose: () => void
  onChanged: (summary: string) => void
  onQuickNotify: (mode: 'tenants' | 'applicant') => void
}

const hhmm = (slot: string | null) => (slot ? slot.slice(0, 5) : '')
const niceDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

/** Texts and emails everyone living in a let-only house (the landlord's reply, let_only_occupants) about a viewing —
 *  by first name, the person whose room it is told it's theirs (12 Nov 2026: was email-only, and only to the room being
 *  viewed, so the housemates were never told). Best-effort. A booking the agent chose to tell them about follows
 *  "Messages you send yourself"; a move stays automatic. */
export async function notifyLetOnlyContacts(roomId: string | null, event: 'booked' | 'rescheduled' | 'cancelled', date: string, time: string, _roomName: string, _senderName: string, elected = true): Promise<boolean> {
  if (!roomId) return false
  const res = await fetch('/api/let-only/heads-up', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomId, event, date, time: time || '09:00', elected }) }).catch(() => null)
  const j = res?.ok ? await res.json().catch(() => ({})) : null
  return !!j && Number(j.texted ?? 0) + Number(j.emailed ?? 0) > 0
}

export default function ViewingSheet({ viewing, senderName, onClose, onChanged, onQuickNotify }: Props) {
  const [moving, setMoving] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [date, setDate] = useState(viewing.viewing_date)
  const [time, setTime] = useState(hhmm(viewing.viewing_slot))
  const [tellTenants, setTellTenants] = useState(true)
  const [tellApplicant, setTellApplicant] = useState(!!(viewing.visitor_phone || viewing.visitor_email))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const changed = date !== viewing.viewing_date || time !== hhmm(viewing.viewing_slot)

  async function saveMove() {
    if (!date) { setError('Choose a date'); return }
    setSaving(true); setError('')
    try {
      const { error: dbError } = await (createClient().from('viewings') as any)
        .update({ viewing_date: date, viewing_slot: time ? `${time}:00` : null }).eq('id', viewing.id)
      if (dbError) throw new Error(dbError.message)

      const told: string[] = []
      const notTold: string[] = []
      if (tellTenants && viewing.property_id) {
        const res = await fetch('/api/admin/quick-notify-lettings', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            property_id: viewing.property_id,
            subject: 'A viewing at your home has moved',
            message: `Quick heads-up — a viewing at ${viewing.property_name || 'your property'} has moved to ${niceDate(date)}${time ? ` at ${time}` : ''}. We will use a management set of keys. Thank you for your hospitality.`,
          }),
        }).catch(() => null)
        const d = await res?.json().catch(() => ({}))
        if (res?.ok && d?.success !== false) told.push(d?.recipientCount ? `${d.recipientCount} tenant${d.recipientCount === 1 ? '' : 's'}` : 'the house (no current tenants)')
        else notTold.push(`tenants${d?.error || d?.message ? ` (${d.error || d.message})` : ''}`)
      }
      if (tellApplicant) {
        const res = await fetch('/api/lettings/notify-applicant', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            viewing_id: viewing.id,
            message: `your viewing at ${viewing.property_name || 'the property'} has moved to ${niceDate(date)}${time ? ` at ${time}` : ''}. Please let me know if that doesn't suit.`,
          }),
        }).catch(() => null)
        const d = await res?.json().catch(() => ({}))
        if (d?.smsSent || d?.emailSent) told.push(viewing.visitor_name || 'the applicant')
        else notTold.push(`applicant${d?.error || d?.smsError ? ` (${d.error || d.smsError})` : ''}`)
      }
      // a move lettings makes with "tell the tenants" ticked is their own message (12 Nov 2026: it was held by the automatic pause)
      if (tellTenants && await notifyLetOnlyContacts(viewing.room_id, 'rescheduled', date, time, viewing.room_name, senderName)) told.push('the household')

      onChanged(`Viewing moved to ${niceDate(date)}${time ? ` at ${time}` : ''}${told.length ? ` — told ${told.join(', ')}` : ''}${notTold.length ? ` · not sent: ${notTold.join(', ')}` : ''}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not move the viewing')
    } finally {
      setSaving(false)
    }
  }

  // Cancel (12 Nov 2026, Harry: "this viewing has been cancelled sends auto text"): marked cancelled (kept, hidden from
  // the lists), and the people living there told straight away — a let-only house by text and email to everyone
  // (lib/letOnly), a managed house through the tenants' usual channels — plus the applicant if ticked.
  async function cancelViewing() {
    setSaving(true); setError('')
    try {
      const { error: dbError } = await (createClient().from('viewings') as any).update({ viewing_status: 'cancelled' }).eq('id', viewing.id)
      if (dbError) throw new Error(/check|violates/i.test(dbError.message) ? 'The viewings table doesn’t accept “cancelled” yet — tell Claude.' : dbError.message)
      const when = `${niceDate(viewing.viewing_date)}${viewing.viewing_slot ? ` at ${hhmm(viewing.viewing_slot)}` : ''}`
      const told: string[] = [], notTold: string[] = []
      const letOnly = await notifyLetOnlyContacts(viewing.room_id, 'cancelled', viewing.viewing_date, hhmm(viewing.viewing_slot), viewing.room_name, senderName)
      if (letOnly) told.push('the household')
      else if (tellTenants && viewing.property_id) {
        const res = await fetch('/api/admin/quick-notify-lettings', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ property_id: viewing.property_id, subject: 'A viewing at your home is cancelled',
            message: `Quick heads-up — the viewing at ${viewing.property_name || 'your home'} on ${when} is cancelled, so nobody will be coming round. Sorry for any bother.` }),
        }).catch(() => null)
        const d = await res?.json().catch(() => ({}))
        if (res?.ok && d?.success !== false && d?.recipientCount) told.push(`${d.recipientCount} tenant${d.recipientCount === 1 ? '' : 's'}`)
        else if (!res?.ok) notTold.push('tenants')
      }
      if (tellApplicant && (viewing.visitor_phone || viewing.visitor_email)) {
        const res = await fetch('/api/lettings/notify-applicant', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ viewing_id: viewing.id, message: `your viewing at ${viewing.property_name || 'the property'} on ${when} is cancelled. Reply if you’d like another time.` }),
        }).catch(() => null)
        const d = await res?.json().catch(() => ({}))
        if (d?.smsSent || d?.emailSent) told.push(viewing.visitor_name || 'the applicant'); else notTold.push('applicant')
      }
      onChanged(`Viewing cancelled${told.length ? ` — told ${told.join(', ')}` : ''}${notTold.length ? ` · not sent: ${notTold.join(', ')}` : ''}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not cancel the viewing')
    } finally { setSaving(false) }
  }

  const btn = 'w-full rounded-xl border border-neutral-300 bg-white py-md text-sm font-semibold text-neutral-800 hover:bg-neutral-50 transition-colors'
  const field = 'w-full rounded-xl border border-neutral-300 px-md py-sm text-sm text-neutral-900 bg-white'

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-lg" onClick={() => !saving && onClose()}>
      <div className="w-full max-w-md rounded-2xl bg-white p-lg shadow-2xl max-h-[90dvh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-md mb-md">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-neutral-900 truncate">{viewing.visitor_name || 'Viewing'}</h2>
            <p className="text-sm text-neutral-600">{[viewing.room_name, viewing.property_name].filter(Boolean).join(' · ')}</p>
            <p className="text-sm text-neutral-600">{niceDate(viewing.viewing_date)}{viewing.viewing_slot ? ` · ${hhmm(viewing.viewing_slot)}` : ''}</p>
            {(viewing.visitor_phone || viewing.visitor_email) && (
              <p className="text-xs text-neutral-500 mt-xs">{[viewing.visitor_phone, viewing.visitor_email].filter(Boolean).join(' · ')}</p>
            )}
          </div>
          <button onClick={onClose} className="text-2xl leading-none text-neutral-400 hover:text-neutral-900">×</button>
        </div>

        {error && <div className="mb-md rounded-xl border border-red-200 bg-red-50 px-md py-sm text-sm text-red-800">{error}</div>}

        {!moving ? (
          <div className="space-y-sm">
            <button className={btn} onClick={() => setMoving(true)}>Change date or time</button>
            <button className={btn} onClick={() => onQuickNotify('applicant')} disabled={!viewing.visitor_phone && !viewing.visitor_email}>
              Message {viewing.visitor_name?.split(' ')[0] || 'the applicant'}{!viewing.visitor_phone && !viewing.visitor_email ? ' — no contact details' : ''}
            </button>
            <button className={btn} onClick={() => onQuickNotify('tenants')} disabled={!viewing.property_id}>Notify tenants at the property</button>
            <button className={`${btn} text-red-700`} onClick={() => setCancelling(true)}>Cancel this viewing</button>
            <Link href="/lettings/viewings" className={`${btn} block text-center`}>All viewings →</Link>
            {cancelling && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-md text-sm">
                <p className="font-bold text-red-900">Cancel this viewing?</p>
                <p className="mt-xs text-red-900">Everyone living there gets a text straight away saying it’s cancelled.</p>
                <label className="mt-sm flex items-center gap-xs text-neutral-800"><input type="checkbox" checked={tellApplicant} onChange={e => setTellApplicant(e.target.checked)} /> Tell {viewing.visitor_name?.split(' ')[0] || 'the applicant'} too</label>
                <div className="mt-sm flex gap-xs">
                  <button onClick={cancelViewing} disabled={saving} className="flex-1 rounded-xl bg-red-700 py-sm text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Cancelling…' : 'Yes, cancel it'}</button>
                  <button onClick={() => setCancelling(false)} disabled={saving} className="flex-1 rounded-xl border border-neutral-300 bg-white py-sm text-sm font-semibold">Keep it</button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-md">
            <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-md">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-neutral-700 mb-xs">Date</label>
                <input type="date" className={field} value={date} onChange={e => setDate(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-neutral-700 mb-xs">Time</label>
                <input type="time" className={field} value={time} onChange={e => setTime(e.target.value)} />
              </div>
            </div>
            <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-md space-y-sm text-sm">
              <label className="flex items-center gap-sm font-semibold text-blue-900">
                <input type="checkbox" checked={tellTenants} onChange={e => setTellTenants(e.target.checked)} /> Tell the tenants at the property
              </label>
              <label className={`flex items-center gap-sm font-semibold text-blue-900 ${viewing.visitor_phone || viewing.visitor_email ? '' : 'opacity-40'}`}>
                <input type="checkbox" disabled={!viewing.visitor_phone && !viewing.visitor_email} checked={tellApplicant}
                  onChange={e => setTellApplicant(e.target.checked)} />
                Tell {viewing.visitor_name?.split(' ')[0] || 'the applicant'} (text and email)
              </label>
              <p className="text-xs text-blue-800">Let-only landlords’ contacts are emailed automatically.</p>
            </div>
            <div className="flex gap-md">
              <button onClick={() => setMoving(false)} disabled={saving} className="flex-1 rounded-xl border border-neutral-300 py-md text-sm font-semibold text-neutral-700 hover:bg-neutral-50">Back</button>
              <button onClick={saveMove} disabled={saving || !changed}
                className="flex-1 rounded-xl bg-neutral-900 py-md text-sm font-bold text-white hover:bg-neutral-700 disabled:opacity-40">
                {saving ? 'Saving…' : 'Move viewing'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
