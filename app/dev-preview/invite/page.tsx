'use client'
// DEV ONLY (never committed): the shared invite panel with sample replies.
import { useEffect, useState } from 'react'
import InviteApplicant from '@/components/InviteApplicant'
export default function Page() {
  const [ok, setOk] = useState(false)
  useEffect(() => {
    const real = window.fetch
    window.fetch = (async (input: any, init?: any) => {
      if (!String(input).includes('invite-to-apply')) return real(input, init)
      const b = JSON.parse(init?.body ?? '{}'); const rent = b.rent ?? (b.mode === 'apply' ? null : 950)
      return new Response(JSON.stringify({ preview: true, to: 'abnajem11@gmail.com', phone: '07700 900123', subject: b.mode === 'reserve' ? 'Updated: secure Room 3 — corrected rent and holding deposit' : 'Your application for Room 3 at 75 Crownfield Road', html: `<div style="font-family:sans-serif;padding:24px"><h2>${b.mode}</h2><p>Rent £${rent ?? '—'}</p></div>`, sms: 'Hi Abdella, Room 3 is ready to reserve…', rent, deposit: rent ? Math.round(rent * 12 / 52 * 100) / 100 : null, asking: 925, pinned: 950, earlier: { at: '2026-10-23T08:34:50Z', rent: 950 }, existingApplicant: true }), { headers: { 'content-type': 'application/json' } })
    }) as any
    setOk(true)
  }, [])
  return <div className="min-h-screen bg-neutral-100 p-xl"><div className="mx-auto max-w-3xl rounded-2xl bg-white p-lg">{ok && <InviteApplicant target={{ applicantId: 'x' }} initialMode="reserve" />}</div></div>
}
