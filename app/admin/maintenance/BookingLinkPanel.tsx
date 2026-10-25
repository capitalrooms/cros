'use client'

// "Not on the app?" — send a job to a contractor by a booking link (25 Oct 2026). They pick their own day and time
// at /book/<link>; the tenants (with the contractor's mobile) and the office are told, and the same link moves or
// cancels it. Route: /api/admin/maintenance/booking-link.
import { useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'

export default function BookingLinkPanel({ ticketId, onSent }: { ticketId: string; onSent: () => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string; link?: string } | null>(null)

  async function send() {
    setBusy(true); setMsg(null)
    try {
      const r = await adminFetch('/api/admin/maintenance/booking-link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketId, name, phone, email }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setMsg({ ok: false, text: d.error ?? 'Not sent' }); return }
      setMsg({ ok: true, text: d.via?.length ? `Sent by ${d.via.join(' and ')}. They’ll book a day themselves — you’ll get an email when they do.` : 'The job is theirs, but the text/email didn’t go — copy the link below and send it yourself.', link: d.link })
      onSent()
    } finally { setBusy(false) }
  }

  const input = 'mt-xs w-full rounded-xl border border-neutral-300 px-md py-sm text-sm'
  return (
    <div className="mt-md border-t border-neutral-200 pt-md">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="w-full rounded-lg border border-neutral-300 py-sm text-sm font-bold text-neutral-900 hover:bg-neutral-50">
          Not on the app? Send a booking link
        </button>
      ) : (
        <div className="space-y-sm">
          <p className="text-xs font-medium text-neutral-600">Send a booking link — for a one-off contractor who isn’t on the app</p>
          <p className="text-xs text-neutral-500">They get a text and/or email with a link: they pick a day and time, the tenants are told with their mobile number, and you get an email. The same link lets them move or cancel it — no account needed.</p>
          <label className="block text-xs font-medium text-neutral-700">Name<input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Sam Patel, SP Plumbing" className={input} /></label>
          <div className="grid gap-sm sm:grid-cols-2">
            <label className="block text-xs font-medium text-neutral-700">Mobile<input value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" placeholder="07…" className={input} /></label>
            <label className="block text-xs font-medium text-neutral-700">Email (optional)<input value={email} onChange={e => setEmail(e.target.value)} inputMode="email" className={input} /></label>
          </div>
          {msg && <p className={`text-sm font-semibold ${msg.ok ? 'text-green-800' : 'text-red-700'}`}>{msg.text}</p>}
          {msg?.link && <p className="break-all rounded-lg bg-neutral-50 px-sm py-xs text-xs text-neutral-600">{msg.link}</p>}
          <div className="flex gap-sm">
            <button type="button" onClick={send} disabled={busy || !name.trim() || (!phone.trim() && !email.trim())} className="flex-1 rounded-lg bg-neutral-900 py-sm text-sm font-bold text-white disabled:bg-neutral-300">{busy ? 'Sending…' : 'Send booking link'}</button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-neutral-300 px-md py-sm text-sm font-bold">Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
