'use client'
// "Ask for what's missing" on the AML review (30 Oct 2026): the failed or unclear checks, worded for the landlord
// (lib/landlordOnboarding/requests). Tick what to ask for, add a line if you like, and send — their form reopens so
// they can add it. Sanctions and PEP findings are never included (tipping off).
import { useMemo, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'
import { whatWeNeed } from '@/lib/landlordOnboarding/requests'

const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

export default function AskForMissing({ id, form, review, onSent, card, h2 }: { id: string; form: any; review: any; onSent: () => void; card: string; h2: string }) {
  const items = useMemo(() => whatWeNeed(review, form), [review, form])
  const [ticked, setTicked] = useState<Record<string, boolean>>(() => Object.fromEntries(items.map(i => [i.key, true])))
  const [texts, setTexts] = useState<Record<string, string>>(() => Object.fromEntries(items.map(i => [i.key, i.text])))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const asked = (Array.isArray(form.__requests) ? form.__requests : []) as { at: string; by: string; items: string[] }[]

  async function send() {
    const chosen = items.filter(i => ticked[i.key]).map(i => texts[i.key].trim()).filter(Boolean)
    if (!chosen.length) { setMsg({ ok: false, text: 'Tick at least one thing to ask for.' }); return }
    if (!confirm(`Email ${form.contact_email || 'the landlord'} asking for ${chosen.length} thing${chosen.length === 1 ? '' : 's'}, and reopen their form?`)) return
    setBusy(true); setMsg(null)
    const r = await adminFetch(`/api/landlord-onboarding/${id}/request-more`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: chosen, note }) })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    setMsg(r.ok ? { ok: true, text: `Sent to ${(d.to ?? []).join(' and ')}. Their form is open again; when they send it back the checks run again.` } : { ok: false, text: d.error ?? 'Couldn’t send it — try again' })
    if (r.ok) onSent()
  }

  return (
    <div className={card}>
      <h2 className={h2}>Ask for what’s missing</h2>
      {!items.length
        ? <p className="text-sm text-neutral-600">Nothing to ask the landlord for — the checks didn’t find anything they need to send.</p>
        : (
          <div className="space-y-sm">
            <p className="text-xs text-neutral-500">From the checks, worded for the landlord. Untick anything you’ve already sorted (for example, ID you’ve seen in person) and edit the wording if you like. Sanctions and PEP questions are never included.</p>
            {items.map(i => (
              <div key={i.key} className={`rounded-lg border px-sm py-xs ${ticked[i.key] ? 'border-neutral-300 bg-white' : 'border-neutral-200 bg-neutral-50 opacity-60'}`}>
                <label className="flex items-start gap-sm text-xs font-semibold text-neutral-700">
                  <input type="checkbox" checked={!!ticked[i.key]} onChange={e => setTicked(t => ({ ...t, [i.key]: e.target.checked }))} className="mt-0.5" />
                  Ask for this
                </label>
                <textarea value={texts[i.key]} onChange={e => setTexts(t => ({ ...t, [i.key]: e.target.value }))} rows={3} disabled={!ticked[i.key]}
                  className="mt-xs w-full rounded-md border border-neutral-200 px-xs py-xs text-sm text-neutral-900" />
              </div>
            ))}
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Anything else to add (optional)"
              className="w-full rounded-lg border border-neutral-200 px-sm py-xs text-sm" />
            <button type="button" onClick={send} disabled={busy}
              className="w-full rounded-xl bg-neutral-900 py-sm text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-40">
              {busy ? 'Sending…' : 'Email the landlord and reopen their form'}
            </button>
          </div>
        )}
      {msg && <p className={`mt-sm text-sm ${msg.ok ? 'text-green-700' : 'text-red-700'}`}>{msg.text}</p>}
      {asked.length > 0 && (
        <div className="mt-md border-t border-neutral-100 pt-sm">
          <p className="text-xs font-semibold text-neutral-500">Asked before</p>
          {asked.slice().reverse().map(a => (
            <p key={a.at} className="mt-xs text-xs text-neutral-600">{fmt(a.at)} · {a.items.length} thing{a.items.length === 1 ? '' : 's'} · {a.by}</p>
          ))}
        </div>
      )}
    </div>
  )
}
