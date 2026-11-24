'use client'
// Planned Works — what a tenant sees on a multi-day project (24 Nov 2026). Renders nothing for a standard job.
import { useEffect, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'

type Fac = { name: string; facility_status: string }
type Upd = { id: string; update_date: string; kind: string; message: string; return_on: string | null }
type Project = {
  planned: boolean; day: number; duration: number | null; expectedCompleteOn: string | null; projectStatus: string | null
  updates: Upd[]; facilities: Fac[]; facilityLabels: Record<string, string>
}

export default function PlannedWorksTenant({ ticketId }: { ticketId: string }) {
  const [p, setP] = useState<Project | null>(null)
  useEffect(() => {
    adminFetch(`/api/planned-works?ticketId=${encodeURIComponent(ticketId)}`).then(r => r.ok ? r.json() : null).then(j => setP(j)).catch(() => null)
  }, [ticketId])
  if (!p || !p.planned) return null
  const done = p.projectStatus === 'completed'
  const restricted = p.facilities.filter(f => f.facility_status !== 'available' && f.facility_status !== 'restored')
  return (
    <section className="rounded-[22px] bg-white p-lg">
      <div className="flex flex-wrap items-baseline justify-between gap-sm">
        <h2 className="font-bold text-neutral-900">Works at your home</h2>
        <span className="text-sm text-neutral-600">{done ? 'Complete' : `Day ${p.day} of ${p.duration ?? '?'}`}{p.expectedCompleteOn && !done ? ` · expected ${p.expectedCompleteOn}` : ''}</span>
      </div>
      {!done && restricted.length > 0 && (
        <div className="mt-md rounded-xl bg-amber-50 p-md text-sm text-amber-900">
          <p className="font-semibold">Please check before you use these</p>
          <ul className="mt-xs list-disc pl-lg">{restricted.map(f => <li key={f.name}>{f.name}: {p.facilityLabels[f.facility_status] ?? f.facility_status}</li>)}</ul>
        </div>
      )}
      {p.facilities.length > 0 && done === false && restricted.length === 0 && (
        <p className="mt-md text-sm text-neutral-700">Everything is available for now.</p>
      )}
      <div className="mt-md">
        <p className="text-sm font-semibold text-neutral-900">Updates, newest first</p>
        <ul className="mt-xs space-y-sm text-sm text-neutral-700">
          {p.updates.filter(u => u.kind !== 'completion_requested').map(u => (
            <li key={u.id}><span className="text-neutral-500">{u.update_date}</span> — {u.message}{u.return_on ? ` Back on ${u.return_on}.` : ''}</li>
          ))}
          {p.updates.length === 0 && <li className="text-neutral-500">No updates yet.</li>}
        </ul>
      </div>
    </section>
  )
}
