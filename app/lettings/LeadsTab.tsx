'use client'

// Lettings phone app › Leads: the applicants in progress (same list as /admin/lettings), newest first, each opening
// its applicant card. Data: /api/admin/lettings/overview (read-only).
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { adminFetch } from '@/lib/adminFetch'

interface Applicant { id: string; name: string; stage: string; at: string | null; room: string; property: string }

const STAGE: Record<string, [string, string]> = {
  no_tenancy: ['Let agreed — no tenancy yet', 'bg-amber-100 text-amber-800'],
  applied: ['Applied', 'bg-blue-50 text-blue-800'],
  offer_sent: ['Offer sent', 'bg-amber-50 text-amber-800'],
  referencing: ['Referencing', 'bg-violet-50 text-violet-800'],
  referencing_passed: ['Ref. passed', 'bg-sky-50 text-sky-800'],
  docs_uploaded: ['Docs in', 'bg-teal-50 text-teal-800'],
}
const day = (iso: string | null) => iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : ''

export default function LeadsTab() {
  const [apps, setApps] = useState<Applicant[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    adminFetch('/api/admin/lettings/overview')
      .then(async r => { const d = await r.json().catch(() => null); if (!r.ok) throw new Error(d?.error || `Couldn’t load (${r.status})`); setApps(d.applicants ?? []) })
      .catch(e => setError(e.message))
  }, [])

  return (
    <div className="space-y-md">
      <div className="flex items-center justify-between gap-md">
        <h2 className="text-base font-bold text-neutral-900">Applicants in progress{apps ? ` · ${apps.length}` : ''}</h2>
        <Link href="/admin/applicants" className="shrink-0 text-xs font-semibold text-blue-700">All applicants →</Link>
      </div>
      <div className="grid grid-cols-2 gap-sm">
        <Link href="/admin/invite-to-apply" className="rounded-xl border border-neutral-300 bg-white px-md py-sm text-center text-sm font-semibold text-neutral-800 active:bg-neutral-50">Invite to apply</Link>
        <Link href="/admin/applicants?add=1" className="rounded-xl bg-neutral-900 px-md py-sm text-center text-sm font-semibold text-white active:bg-neutral-700">+ Add applicant</Link>
      </div>
      {error ? (
        <p className="rounded-xl bg-red-50 px-lg py-md text-sm text-red-800">{error}</p>
      ) : !apps ? (
        <p className="px-sm py-lg text-sm text-neutral-400">Loading…</p>
      ) : apps.length === 0 ? (
        <p className="rounded-2xl border-2 border-dashed border-neutral-200 bg-white px-lg py-xl text-center text-sm text-neutral-500">No applications in progress.</p>
      ) : (
        <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          {apps.map(a => (
            <li key={a.id}>
              <Link href={`/admin/applicants?open=${a.id}${a.stage === 'no_tenancy' ? '&deposit=1' : ''}`} className="block px-lg py-md active:bg-neutral-50">
                <span className="flex items-baseline justify-between gap-sm">
                  <span className="truncate text-sm font-semibold text-neutral-900">{a.name}</span>
                  <span className={`shrink-0 rounded-full px-sm py-0.5 text-[11px] font-semibold ${STAGE[a.stage]?.[1] ?? 'bg-neutral-100 text-neutral-600'}`}>{STAGE[a.stage]?.[0] ?? a.stage}</span>
                </span>
                <span className="block truncate text-xs text-neutral-500">{[a.room, a.property].filter(Boolean).join(' · ') || 'No room chosen'}{a.at ? ` · ${day(a.at)}` : ''}</span>
                    {a.stage === 'no_tenancy' && <span className="mt-0.5 block text-xs font-semibold text-amber-800">Next: record the holding deposit to open the letting file →</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
