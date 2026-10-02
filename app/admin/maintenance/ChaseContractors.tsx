'use client'

// "Ask for updates": jobs that have stalled with their contractor — never booked, or the booked day has passed with
// no job sheet. Pick the jobs, check the message, send. Each contractor gets it in the app, as a push and (ticked by
// default, since few contractors have notifications on yet) by email. Nothing is sent until you press Send.

import { useCallback, useEffect, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'

interface ChaseJob {
  id: string; title: string; where: string; contractor: string; contractorEmail: string | null
  bookedDate: string | null; reason: 'not_booked' | 'overdue'; message: string
}

const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

export default function ChaseContractors() {
  const [jobs, setJobs] = useState<ChaseJob[] | null>(null)
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('')
  const [email, setEmail] = useState(true)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const r = await adminFetch('/api/admin/jobs/chase')
    const d = await r.json().catch(() => ({}))
    if (r.ok) setJobs(d.jobs ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  if (!jobs?.length && !result) return null

  async function send() {
    if (!picked.size) return
    if (!window.confirm(`Ask ${new Set(jobs!.filter(j => picked.has(j.id)).map(j => j.contractor)).size} contractor(s) for an update on ${picked.size} job${picked.size === 1 ? '' : 's'}${email ? ', by app and email' : ', in the app'}?`)) return
    setBusy(true); setError('')
    const r = await adminFetch('/api/admin/jobs/chase', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketIds: [...picked], note, email }) })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setError(d.error ?? 'Could not send'); return }
    const emailed = (d.results ?? []).filter((x: any) => x.email).length
    const errs = (d.results ?? []).filter((x: any) => x.error).map((x: any) => `${x.contractor}: ${x.error}`)
    setResult(`✅ Asked for ${d.sent} update${d.sent === 1 ? '' : 's'}${emailed ? ` · ${emailed} emailed` : ''}${errs.length ? ` · ⚠️ ${errs.join('; ')}` : ''}`)
    setOpen(false); setPicked(new Set()); setNote('')
    load()
  }

  const overdue = (jobs ?? []).filter(j => j.reason === 'overdue').length
  return (
    <>
      <div className="mb-lg flex flex-wrap items-center justify-between gap-md rounded-2xl border border-amber-300 bg-amber-50 px-lg py-md">
        <p className="text-sm text-amber-900">
          {jobs?.length
            ? <><strong>{jobs.length} job{jobs.length === 1 ? '' : 's'} waiting on a contractor</strong> — {overdue ? `${overdue} past the booked day with no job sheet` : ''}{overdue && jobs.length - overdue ? ', ' : ''}{jobs.length - overdue ? `${jobs.length - overdue} not booked yet` : ''}.</>
            : null}
          {result && <span className="block font-semibold text-green-800">{result}</span>}
        </p>
        {!!jobs?.length && <button type="button" onClick={() => { setOpen(true); setPicked(new Set(jobs.map(j => j.id))) }} className="rounded-xl bg-neutral-900 px-lg py-sm text-sm font-bold text-white hover:bg-neutral-700">Ask for updates…</button>}
      </div>

      {open && jobs && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 p-lg" onClick={() => !busy && setOpen(false)}>
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-lg text-neutral-900 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="mb-md flex items-start justify-between gap-md">
              <div>
                <h2 className="text-xl font-bold">Ask contractors for an update</h2>
                <p className="text-sm text-neutral-600">Each contractor gets one message per job, worded for where it’s got to.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="text-2xl leading-none text-neutral-400 hover:text-neutral-900">×</button>
            </div>
            {error && <p className="mb-md rounded-lg border border-red-200 bg-red-50 px-md py-sm text-sm text-red-800">{error}</p>}
            <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
              {jobs.map(j => (
                <li key={j.id} className="p-md">
                  <label className="flex items-start gap-sm">
                    <input type="checkbox" className="mt-1" checked={picked.has(j.id)} onChange={e => setPicked(p => { const n = new Set(p); if (e.target.checked) n.add(j.id); else n.delete(j.id); return n })} />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{j.title} <span className="font-normal text-neutral-500">· {j.where}</span></span>
                      <span className="block text-xs text-neutral-500">{j.contractor}{j.contractorEmail ? ` · ${j.contractorEmail}` : ' · no email on file'} · <span className={j.reason === 'overdue' ? 'text-red-700' : 'text-amber-700'}>{j.reason === 'overdue' ? `booked ${day(j.bookedDate!)}, no job sheet` : 'not booked yet'}</span></span>
                      <span className="mt-xs block rounded-lg bg-neutral-50 px-sm py-xs text-xs text-neutral-700">{j.message}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <label className="mt-md block text-xs font-bold uppercase tracking-wide text-neutral-600">Add a note to every message (optional)</label>
            <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} className="mt-xs w-full rounded-xl border border-neutral-300 px-md py-sm text-sm" placeholder="e.g. The tenant is away until Friday" />
            <label className="mt-md flex items-center gap-sm text-sm font-semibold">
              <input type="checkbox" checked={email} onChange={e => setEmail(e.target.checked)} /> Email them as well
            </label>
            <p className="text-[11px] text-neutral-500">Few contractors have notifications turned on yet, so email makes sure it reaches them. A note is added to each job saying it was chased.</p>
            <div className="mt-md flex gap-md">
              <button type="button" onClick={() => setOpen(false)} disabled={busy} className="flex-1 rounded-xl border border-neutral-300 py-md text-sm font-semibold">Cancel</button>
              <button type="button" onClick={send} disabled={busy || !picked.size} className="flex-1 rounded-xl bg-neutral-900 py-md text-sm font-bold text-white disabled:opacity-40">{busy ? 'Sending…' : `Send ${picked.size} request${picked.size === 1 ? '' : 's'}`}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
