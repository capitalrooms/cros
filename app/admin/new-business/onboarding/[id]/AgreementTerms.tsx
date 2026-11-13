'use client'
// The agreement's terms, as first sent next to how they stand now (13 Nov 2026, Harry: "we should always be able to see
// the original proposed agreement alongside their proposed changes and then if needed can change things … then we can
// resend"). Change any term with a reason (kept in the history), preview the agreement, and send it again.
// /api/landlord-onboarding/[id]/terms; sending reuses "Send the form link again" (before they submit) or
// Approve & send (after).
import { useCallback, useEffect, useState } from 'react'
import { adminFetch, downloadPdf } from '@/lib/adminFetch'

type Field = { key: string; label: string; kind: 'pct' | 'text' | 'money' | 'date' }
type Data = { none?: boolean; fields: Field[]; original: Record<string, any>; current: Record<string, any>; history: { version: number; at: string; by: string; reason: string; changes: Record<string, { from: unknown; to: unknown }> }[]; version: number; sentAt: string | null; submitted: boolean; approvalSentAt: string | null }

const show = (f: Field, v: unknown) => v == null || v === '' ? '—' : f.kind === 'pct' ? `${v}%` : f.kind === 'money' ? `£${v}` : f.kind === 'date' ? new Date(`${String(v).slice(0, 10)}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : String(v)
const day = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

export default function AgreementTerms({ id, card, h2, onResend }: { id: string; card: string; h2: string; onResend?: () => void }) {
  const [d, setD] = useState<Data | null>(null)
  const [edit, setEdit] = useState(false)
  const [vals, setVals] = useState<Record<string, string>>({})
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    const r = await adminFetch(`/api/landlord-onboarding/${id}/terms`)
    if (!r.ok) return
    const j = await r.json(); setD(j)
    if (j.current) setVals(Object.fromEntries((j.fields as Field[]).map(f => [f.key, String(j.current[f.key] ?? '')])))
  }, [id])
  useEffect(() => { load() }, [load])
  if (!d || d.none) return null

  async function save() {
    setBusy(true); setMsg(null)
    const changes = Object.fromEntries(d!.fields.filter(f => String(d!.current[f.key] ?? '') !== vals[f.key]).map(f => [f.key, vals[f.key]]))
    const r = await adminFetch(`/api/landlord-onboarding/${id}/terms`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ changes, reason }) })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setMsg({ ok: false, text: j.error || 'Couldn’t save' }); return }
    setEdit(false); setReason(''); setMsg({ ok: true, text: `Saved — version ${j.version}. ${d!.submitted ? 'It goes in the final agreement when you approve & send.' : 'Send it again so they have the corrected agreement.'}` }); load()
  }

  const differs = (f: Field) => String(d.original[f.key] ?? '') !== String(d.current[f.key] ?? '')
  return (
    <div className={card}>
      <div className="mb-sm flex flex-wrap items-center justify-between gap-sm">
        <h2 className={h2}>Agreement terms</h2>
        <span className="text-xs text-neutral-500">Version {d.version}{d.sentAt ? ` · first sent ${day(d.sentAt)}` : ''}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-[11px] uppercase tracking-wider text-neutral-500"><th className="py-xs pr-sm">Term</th><th className="py-xs pr-sm">As first sent</th><th className="py-xs">Now</th></tr></thead>
          <tbody>{d.fields.map(f => (
            <tr key={f.key} className={`border-t border-neutral-100 ${differs(f) ? 'bg-amber-50/60' : ''}`}>
              <td className="py-xs pr-sm text-neutral-600">{f.label}</td>
              <td className={`py-xs pr-sm ${differs(f) ? 'text-neutral-500 line-through' : 'text-neutral-900'}`}>{show(f, d.original[f.key])}</td>
              <td className="py-xs">{edit
                ? <input type={f.kind === 'date' ? 'date' : 'text'} inputMode={f.kind === 'pct' || f.kind === 'money' ? 'decimal' : undefined} value={f.kind === 'date' ? vals[f.key]?.slice(0, 10) : vals[f.key]} onChange={e => setVals(v => ({ ...v, [f.key]: e.target.value }))} className="w-full max-w-[14rem] rounded-lg border border-neutral-300 px-sm py-xs text-sm" />
                : <span className={differs(f) ? 'font-semibold text-neutral-900' : 'text-neutral-900'}>{show(f, d.current[f.key])}</span>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      {edit ? (
        <div className="mt-sm space-y-xs">
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Why — e.g. let fee agreed on the phone as £250 per room" className="w-full rounded-lg border border-neutral-300 px-md py-xs text-sm" />
          <div className="flex gap-sm">
            <button type="button" disabled={busy || reason.trim().length < 3} onClick={save} className="rounded-lg bg-neutral-900 px-md py-xs text-sm font-semibold text-white disabled:opacity-40">{busy ? 'Saving…' : 'Save the new terms'}</button>
            <button type="button" onClick={() => { setEdit(false); load() }} className="rounded-lg border border-neutral-300 px-md py-xs text-sm font-semibold">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="mt-sm flex flex-wrap gap-sm">
          <button type="button" onClick={() => setEdit(true)} className="rounded-lg border border-neutral-300 px-md py-xs text-sm font-semibold">Change the terms</button>
          <button type="button" onClick={() => downloadPdf(`/api/landlord-onboarding/${id}/agreement?pdf=1`, 'Agreement-preview.pdf')} className="rounded-lg border border-neutral-300 px-md py-xs text-sm font-semibold">Preview the agreement</button>
          {!d.submitted && onResend && <button type="button" onClick={onResend} className="rounded-lg bg-neutral-900 px-md py-xs text-sm font-semibold text-white">Send it to the landlord again</button>}
        </div>
      )}
      {d.submitted && <p className="mt-xs text-xs text-neutral-500">They’ve submitted their form, so the agreement with these terms goes to them when you press Approve & send below.</p>}
      {msg && <p className={`mt-xs text-sm ${msg.ok ? 'text-emerald-700' : 'text-red-700'}`}>{msg.text}</p>}

      {d.history.length > 0 && (
        <details className="mt-sm text-xs">
          <summary className="cursor-pointer font-semibold text-neutral-700">Changes ({d.history.length})</summary>
          <ul className="mt-xs space-y-xs">
            {[...d.history].reverse().map(h => (
              <li key={h.version} className="rounded-lg bg-neutral-50 px-sm py-xs">
                <span className="font-semibold">Version {h.version}</span> · {day(h.at)} · {h.by} — “{h.reason}”
                <span className="block text-neutral-600">{Object.entries(h.changes).map(([k, c]) => { const f = d.fields.find(x => x.key === k)!; return `${f?.label ?? k}: ${show(f, c.from)} → ${show(f, c.to)}` }).join(' · ')}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
