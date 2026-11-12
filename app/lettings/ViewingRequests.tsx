'use client'
// Viewing requests from the website (12 Nov 2026, Harry): each shows the times the person chose — tap one to book it.
// Booking confirms it to them (text + email) and tells the house as for any viewing: the tenants of a managed house,
// everyone the landlord told us lives at a let-only one. "None of these work" asks them for other times.
// Shown on the lettings app's Leads tab and the office Lettings screen. Data: /api/lettings/viewing-requests.
import { useEffect, useState } from 'react'
import { slotLabel } from '@/lib/lettings/viewingSlots'
import { notifyLetOnlyContacts } from './ViewingSheet'

interface Req { id: string; name: string; email: string | null; phone: string | null; slots: { date: string; time: string }[]; message: string | null; created_at: string; house: string; room: string | null; property_id: string; room_id: string }

export default function ViewingRequests({ compact = false }: { compact?: boolean }) {
  const [list, setList] = useState<Req[] | null>(null)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const load = () => fetch('/api/lettings/viewing-requests').then(r => r.json()).then(d => setList(d.requests ?? [])).catch(() => setList([]))
  useEffect(() => { load() }, [])

  async function book(r: Req, i: number) {
    setBusy(r.id); setMsg('')
    const res = await fetch('/api/lettings/viewing-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: r.id, action: 'book', slot: i }) })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { setBusy(''); setMsg(d.error || 'That didn’t book'); return }
    const v = d.viewing
    // tell the house, as for any booking
    let told = ''
    if (await notifyLetOnlyContacts(v.room_id, 'booked', v.date, v.time, v.room, '')) told = ' and the household told'
    else {
      const when = new Date(`${v.date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
      const t = await fetch('/api/admin/quick-notify-lettings', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: v.property_id, subject: 'A viewing at your home', message: `A viewing has been arranged at ${v.house} on ${when} at ${v.time}. We will have a management set of keys for access. Thank you for your hospitality whilst we visit and we hope not to disturb you for too long.` }) }).catch(() => null)
      const td = await t?.json().catch(() => ({}))
      if (td?.recipientCount) told = ` and ${td.recipientCount} tenant${td.recipientCount === 1 ? '' : 's'} told`
    }
    setBusy(''); setMsg(`Booked ${r.name} for ${slotLabel(v.date, v.time)} — they’ve been sent a confirmation${told}.`); load()
  }
  async function decline(r: Req) {
    if (!window.confirm(`Ask ${r.name} for other times? They get a text and email.`)) return
    setBusy(r.id)
    await fetch('/api/lettings/viewing-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: r.id, action: 'decline' }) })
    setBusy(''); setMsg(`Asked ${r.name} for other times.`); load()
  }

  if (!list) return null
  // the last thing done stays on screen even when that was the last request
  if (!list.length) return msg ? <p className="rounded-xl bg-emerald-50 px-lg py-md text-sm text-emerald-800">{msg}</p> : compact ? null : <p className="text-sm text-neutral-500">No viewing requests waiting.</p>
  return (
    <section className="rounded-2xl bg-white ring-1 ring-amber-300">
      <header className="border-b border-neutral-100 px-lg py-md">
        <h2 className="text-base font-bold text-neutral-900">Viewing requests <span className="ml-xs text-sm font-semibold tabular-nums text-amber-700">{list.length}</span></h2>
        <p className="text-xs text-neutral-500">From the website — tap a time to book it. They’re told straight away.</p>
      </header>
      {msg && <p className="px-lg pt-sm text-sm text-emerald-700">{msg}</p>}
      <ul className="divide-y divide-neutral-100">
        {list.map(r => (
          <li key={r.id} className="px-lg py-md">
            <p className="text-sm font-bold text-neutral-900">{r.name} <span className="font-normal text-neutral-500">· {r.house}{r.room ? ` (${r.room})` : ''}</span></p>
            <p className="text-xs text-neutral-500">{[r.phone, r.email].filter(Boolean).join(' · ')}</p>
            {r.message && <p className="mt-xs text-sm italic text-neutral-700">“{r.message}”</p>}
            <div className="mt-sm flex flex-wrap gap-xs">
              {r.slots.map((s, i) => <button key={i} type="button" disabled={busy === r.id} onClick={() => book(r, i)} className="rounded-full bg-neutral-900 px-md py-xs text-xs font-semibold text-white disabled:opacity-50">Book {slotLabel(s.date, s.time)}</button>)}
              <button type="button" disabled={busy === r.id} onClick={() => decline(r)} className="rounded-full border border-neutral-300 px-md py-xs text-xs font-semibold text-neutral-700">None of these work</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
