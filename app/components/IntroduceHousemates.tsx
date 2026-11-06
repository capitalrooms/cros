'use client'

// "Introduce to housemates" on the letting file (6 Nov 2026 — app/api/admin/lettings/[tenancyId]/introduce): shows who
// it would go to, a preview of the email, then Send. Hidden when it doesn't apply (let only, whole home, nobody else in).
import { useEffect, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'

export default function IntroduceHousemates({ tenancyId }: { tenancyId: string }) {
  const [d, setD] = useState<any>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  useEffect(() => { adminFetch(`/api/admin/lettings/${tenancyId}/introduce`).then(r => r.json()).then(setD).catch(() => {}) }, [tenancyId])
  if (!d || d.error) return null
  // let-only and whole homes have nothing to show here (the landlord card covers let-only)
  if (!d.ready && /let-only|whole-home/i.test(d.why ?? '')) return null
  async function send() {
    setBusy(true)
    const r = await adminFetch(`/api/admin/lettings/${tenancyId}/introduce`, { method: 'POST' })
    const j = await r.json().catch(() => ({}))
    setBusy(false); setOpen(false)
    setMsg(r.ok ? `Sent to ${j.sent.join(', ')}${j.failed?.length ? ` — didn’t send to ${j.failed.join(', ')}` : ''}` : (j.error ?? 'It didn’t send'))
  }
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-md space-y-sm">
      <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500">Housemates</h2>
      {d.ready ? <>
        <p className="text-sm text-neutral-700">Introduce {d.first} to the {d.recipients.length} {d.recipients.length === 1 ? 'person' : 'people'} living there — their photo and what they shared.</p>
        <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-neutral-300 px-sm py-0.5 text-xs font-semibold text-neutral-800 hover:bg-neutral-50">Introduce to housemates…</button>
      </> : <p className="text-xs text-neutral-500">{d.why}</p>}
      {msg && <p className="text-xs font-semibold text-green-800">{msg}</p>}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center md:p-lg" onClick={() => !busy && setOpen(false)}>
          <div className="flex max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl md:rounded-2xl" onClick={e => e.stopPropagation()}>
            <div className="border-b border-neutral-200 px-lg py-md">
              <h3 className="text-lg font-bold text-neutral-900">Meet your new housemate, {d.first}</h3>
              <p className="mt-xs text-xs text-neutral-600">Goes to: {d.recipients.map((r: any) => `${r.name}${r.room ? ` (${r.room})` : ''}`).join(' · ')} — each gets their own email.</p>
            </div>
            <iframe title="Email preview" srcDoc={d.html} sandbox="" className="min-h-[60dvh] w-full flex-1 bg-white" />
            <div className="flex items-center gap-sm border-t border-neutral-200 px-lg py-md">
              <button type="button" onClick={send} disabled={busy} className="rounded-lg bg-neutral-900 px-lg py-sm text-sm font-bold text-white hover:bg-neutral-700 disabled:opacity-40">{busy ? 'Sending…' : `Send to ${d.recipients.length}`}</button>
              <button type="button" onClick={() => setOpen(false)} disabled={busy} className="text-sm font-semibold text-neutral-600 underline">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
