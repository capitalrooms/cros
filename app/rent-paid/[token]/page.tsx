'use client'
// The tenant's "I've paid" page (lib/rent/paidClaim). No sign-in. It only tells the finance team; it doesn't confirm payment.
import { use, useState } from 'react'

export default function RentPaidPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  async function tell() {
    setBusy(true)
    const r = await fetch(`/api/rent-paid/${encodeURIComponent(token)}`, { method: 'POST' }).then(x => x.json()).catch(() => ({ error: 'Something went wrong. Please try again.' }))
    setMsg(r.message ?? r.error ?? 'Something went wrong. Please try again.')
    setBusy(false)
  }
  return (
    <main className="mx-auto max-w-md px-5 py-12 text-[#17332B]" style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <h1 className="text-2xl font-bold">Have you paid your rent?</h1>
      <p className="mt-4 text-base">If you’ve just paid the amount we asked for, tap the button below. We’ll let the team know, and check the bank before we confirm.</p>
      {!msg && <button type="button" disabled={busy} onClick={tell} className="mt-6 rounded-lg bg-[#17332B] px-5 py-3 font-bold text-white disabled:opacity-40">{busy ? 'Sending…' : 'I’ve paid'}</button>}
      {msg && <p className="mt-6 text-base font-semibold">{msg}</p>}
    </main>
  )
}
