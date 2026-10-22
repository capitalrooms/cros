'use client'

// "Same person, more than one record" on Applicants (22 Oct 2026): each email with several live applicant records,
// the one furthest along picked to keep, and a Merge button (/api/admin/applicants/merge).
import { useEffect, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'

type Group = { email: string; keep: string; rows: { id: string; name: string; stage: string; room: string; created: string; applied: boolean }[] }
const STAGE: Record<string, string> = { invited: 'Invited', applied: 'Applied', offer_sent: 'Offer sent', referencing: 'Referencing', referencing_passed: 'Referencing passed', docs_uploaded: 'Documents in' }

export default function DuplicateApplicants({ onMerged }: { onMerged: () => void }) {
  const [groups, setGroups] = useState<Group[]>([])
  const [keep, setKeep] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const load = () => adminFetch('/api/admin/applicants/merge').then(r => r.json()).then(d => { setGroups(d.groups ?? []); setKeep(Object.fromEntries((d.groups ?? []).map((g: Group) => [g.email, g.keep]))) }).catch(() => {})
  useEffect(() => { load() }, [])
  if (!groups.length && !msg) return null

  async function merge(g: Group) {
    const k = keep[g.email]
    if (!confirm(`Merge ${g.rows.length} records for ${g.email} into one? Deposits, offers, documents and messages move onto the one you keep; the others are archived (still on record).`)) return
    setBusy(g.email); setMsg(null)
    const r = await adminFetch('/api/admin/applicants/merge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keep: k, others: g.rows.map(x => x.id).filter(id => id !== k) }) })
    const d = await r.json().catch(() => ({}))
    setBusy('')
    setMsg(r.ok ? { ok: true, text: `Merged — ${g.email} is now one applicant.` } : { ok: false, text: d.error ?? 'Not merged' })
    if (r.ok) { load(); onMerged() }
  }

  return (
    <section className="mb-lg rounded-2xl border border-amber-300 bg-amber-50 p-lg">
      <h2 className="text-base font-bold text-amber-950">Same person, more than one record</h2>
      <p className="mb-md text-sm text-amber-900">These email addresses have several applicant records. Keep the one that’s furthest along (ticked) and merge the rest into it.</p>
      {msg && <p className={`mb-md rounded-lg px-md py-sm text-sm font-semibold ${msg.ok ? 'bg-green-100 text-green-900' : 'bg-red-100 text-red-800'}`}>{msg.text}</p>}
      <div className="space-y-md">
        {groups.map(g => (
          <div key={g.email} className="rounded-xl border border-amber-200 bg-white p-md">
            <p className="mb-sm text-sm font-bold text-neutral-900">{g.email}</p>
            <ul className="space-y-xs">
              {g.rows.map(r => (
                <li key={r.id}>
                  <label className="flex flex-wrap items-center gap-sm text-sm">
                    <input type="radio" name={`keep-${g.email}`} checked={keep[g.email] === r.id} onChange={() => setKeep(k => ({ ...k, [g.email]: r.id }))} />
                    <span className="font-semibold">{r.name}</span>
                    <span className="text-neutral-500">{STAGE[r.stage] ?? r.stage}{r.applied ? ' · application in' : ''} · {r.room || 'no room'} · made {new Date(r.created).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' })}</span>
                  </label>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => merge(g)} disabled={busy === g.email} className="mt-sm rounded-lg bg-neutral-900 px-md py-sm text-sm font-bold text-white disabled:opacity-50">{busy === g.email ? 'Merging…' : `Merge into one`}</button>
          </div>
        ))}
      </div>
    </section>
  )
}
