'use client'
// Planned Works — the contractor's daily update on a multi-day project (24 Nov 2026). Renders nothing for a standard job.
import { useCallback, useEffect, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'

type Fac = { name: string; facility_status: string }
type Upd = { id: string; update_date: string; kind: string; message: string; return_on: string | null; created_at: string }
type Project = {
  planned: boolean; day: number; duration: number | null; expectedCompleteOn: string | null; projectStatus: string | null
  updates: Upd[]; facilities: Fac[]; facilityNames: string[]; facilityLabels: Record<string, string>
  messages: { key: string; label: string; text: string }[]; canUpdate: boolean
}

const CONTRACTOR_STATUS = ['available', 'restricted', 'unavailable', 'partial'] as const

export default function PlannedDailyUpdate({ ticketId }: { ticketId: string }) {
  const [p, setP] = useState<Project | null>(null)
  const [key, setKey] = useState<string>('')
  const [text, setText] = useState('')
  const [returnOn, setReturnOn] = useState('')
  const [delay, setDelay] = useState(false)
  const [proposed, setProposed] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    const r = await adminFetch(`/api/planned-works?ticketId=${encodeURIComponent(ticketId)}`).catch(() => null)
    if (r?.ok) setP(await r.json())
  }, [ticketId])
  useEffect(() => { load() }, [load])

  async function post(body: Record<string, unknown>) {
    setBusy(true); setNote('')
    const r = await adminFetch('/api/planned-works', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketId, ...body }) }).catch(() => null)
    const j = r ? await r.json().catch(() => ({})) : {}
    setBusy(false)
    if (!r?.ok) { setNote(j.error || 'That didn’t send — try again.'); return false }
    await load()
    return true
  }

  async function sendDaily() {
    const ok = await post({ action: 'daily', key: key || undefined, message: key ? undefined : text, returnOn: returnOn || undefined, delay, proposedCompleteOn: delay && proposed ? proposed : undefined })
    if (ok) { setKey(''); setText(''); setReturnOn(''); setDelay(false); setProposed(''); setNote('Sent. The office and the tenants have the update.') }
  }

  if (!p || !p.planned) return null
  const done = p.projectStatus === 'completed'
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-lg">
      <div className="flex flex-wrap items-baseline justify-between gap-sm">
        <h2 className="font-bold text-neutral-900">Planned works</h2>
        <span className="text-sm text-neutral-600">Day {p.day} of {p.duration ?? '?'}{p.expectedCompleteOn ? ` · expected ${p.expectedCompleteOn}` : ''}</span>
      </div>
      <p className="mt-xs text-sm text-neutral-600">{done ? 'This project is complete.' : 'Send one update at the end of each working day. Weekends don’t close the project.'}</p>

      <div className="mt-md">
        <p className="text-sm font-semibold text-neutral-900">Facilities</p>
        <ul className="mt-xs space-y-xs">
          {p.facilityNames.map(name => {
            const f = p.facilities.find(x => x.name === name)
            const cur = f?.facility_status ?? 'unavailable'
            return (
              <li key={name} className="flex flex-wrap items-center gap-sm text-sm">
                <span className="w-24 text-neutral-900">{name}</span>
                <span className="text-neutral-500">{p.facilityLabels[cur] ?? cur}</span>
                {!done && CONTRACTOR_STATUS.map(s => (
                  <button key={s} type="button" disabled={busy || cur === s} onClick={() => post({ action: 'facility', name, status: s })}
                    className="rounded-full bg-white px-sm py-xs text-xs font-semibold text-neutral-800 ring-1 ring-neutral-300 disabled:opacity-40">{p.facilityLabels[s]}</button>
                ))}
              </li>
            )
          })}
        </ul>
        <p className="mt-xs text-xs text-neutral-500">Only the office can mark a facility restored.</p>
      </div>

      {!done && p.canUpdate && (
        <div className="mt-lg">
          <p className="text-sm font-semibold text-neutral-900">Today’s update</p>
          <div className="mt-xs flex flex-wrap gap-xs">
            {p.messages.map(m => (
              <button key={m.key} type="button" onClick={() => setKey(key === m.key ? '' : m.key)}
                className={`rounded-full px-sm py-xs text-xs font-semibold ring-1 ${key === m.key ? 'bg-neutral-900 text-white ring-neutral-900' : 'bg-white text-neutral-800 ring-neutral-300'}`}>{m.label}</button>
            ))}
          </div>
          {key && <p className="mt-xs text-sm text-neutral-600">{p.messages.find(m => m.key === key)?.text}</p>}
          <textarea value={text} onChange={e => setText(e.target.value)} disabled={!!key} rows={3} maxLength={1000} placeholder="Or write your own, e.g. We’ve removed the old bath. Use the upstairs bathroom until further notice."
            className="mt-sm w-full resize-none rounded-xl border border-neutral-300 bg-white px-md py-sm text-sm text-neutral-900 disabled:opacity-50" />
          <div className="mt-sm grid gap-sm sm:grid-cols-2">
            <label className="text-sm text-neutral-700">Back on site
              <input type="date" value={returnOn} onChange={e => setReturnOn(e.target.value)} className="mt-xs block w-full rounded-xl border border-neutral-300 px-sm py-xs" /></label>
            <label className="flex items-center gap-sm self-end text-sm text-neutral-700">
              <input type="checkbox" checked={delay} onChange={e => setDelay(e.target.checked)} /> This is a delay</label>
            {delay && <label className="text-sm text-neutral-700">New expected finish (office confirms)
              <input type="date" value={proposed} onChange={e => setProposed(e.target.value)} className="mt-xs block w-full rounded-xl border border-neutral-300 px-sm py-xs" /></label>}
          </div>
          <button type="button" disabled={busy || (!key && !text.trim())} onClick={sendDaily}
            className="mt-md rounded-full bg-neutral-900 px-lg py-sm text-sm font-bold text-white disabled:opacity-40">{busy ? 'Sending…' : 'Send today’s update'}</button>
        </div>
      )}

      {!done && (
        <div className="mt-lg border-t border-neutral-200 pt-md">
          <p className="text-sm text-neutral-700">Finished all the work? Ask the office to check it and close the project. It doesn’t close on your say-so.</p>
          <button type="button" disabled={busy} onClick={() => post({ action: 'request_complete', note: 'Work finished. Please check and close the project.' })}
            className="mt-sm rounded-full bg-white px-lg py-sm text-sm font-semibold text-neutral-900 ring-1 ring-neutral-300 disabled:opacity-40">Ask the office to close it</button>
        </div>
      )}

      {note && <p className="mt-md text-sm font-semibold text-neutral-800">{note}</p>}

      {p.updates.length > 0 && (
        <div className="mt-lg">
          <p className="text-sm font-semibold text-neutral-900">History</p>
          <ul className="mt-xs space-y-xs text-sm text-neutral-700">
            {p.updates.map(u => <li key={u.id}><span className="text-neutral-500">{u.update_date}</span> — {u.message}{u.return_on ? ` (back ${u.return_on})` : ''}</li>)}
          </ul>
        </div>
      )}
    </section>
  )
}
