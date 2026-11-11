'use client'

// The weekly cleaner email, on the Cleaning screen (11 Nov 2026, Harry: "send the cleaners automated emails on Monday
// or Sunday evening to confirm that this week they must book in their designated cleans … then I don't have to chase
// people"). When it goes, the week's extra jobs ("Room 3 is empty — clean it"), and each cleaner's email exactly as
// they'll get it, with a test to yourself and a send-now. Data: /api/admin/cleaner/week (lib/cleans/weekPlan).
import { useEffect, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'

type Task = { id: string; propertyId: string; roomId: string | null; roomName: string | null; task: string; extraHours: number | null }
type House = { propertyId: string; name: string; due: boolean; booked: { date: string; time: string | null; done: boolean } | null; hours: number | null; tasks: Task[] }
type Cleaner = { cleanerId: string; name: string; email: string | null; test: boolean; houses: House[]; sentAt: string | null; subject: string; html: string }
type Data = {
  ready: boolean; setting: string; days: { value: string; label: string }[]; weekStart: string; weekEnd?: string
  cleaners?: Cleaner[]; unassigned?: { name: string; tasks: Task[] }[]; houses?: { id: string; name: string; rooms: { id: string; name: string }[] }[]
}

const day = (iso: string, opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' })
const shift = (iso: string, days: number) => new Date(new Date(`${iso}T12:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10)
const HELP: Record<string, string> = {
  off: 'No weekly email goes out.',
  sunday: 'Every Sunday at 6pm (7pm in summer), each cleaner gets their cleans for the week ahead.',
  monday: 'Every Monday at 6pm (7pm in summer), each cleaner gets their cleans for that week.',
}

export default function WeeklyEmail() {
  const [week, setWeek] = useState<string | null>(null)
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [form, setForm] = useState({ propertyId: '', roomId: '', task: '', extraHours: '' })

  const load = (w = week) => adminFetch(`/api/admin/cleaner/week${w ? `?week=${w}` : ''}`).then(async r => {
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error ?? 'Couldn’t load the weekly email'); return }
    setData(d); setWeek(d.weekStart)
  }).catch(() => setError('Couldn’t load the weekly email — check the connection.'))
  useEffect(() => { load(null) }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  async function post(body: object, label: string) {
    setBusy(label); setError(''); setNote('')
    const r = await adminFetch('/api/admin/cleaner/week', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await r.json().catch(() => ({}))
    setBusy('')
    if (!r.ok) { setError(d.error ?? 'That didn’t work'); return null }
    return d
  }

  if (!data) return error ? <p className="mb-lg text-sm font-semibold text-red-700">{error}</p> : null
  const field = 'w-full rounded-lg border border-neutral-300 bg-white px-sm py-xs text-sm text-neutral-900'
  const rooms = data.houses?.find(h => h.id === form.propertyId)?.rooms ?? []
  const allTasks = [...(data.cleaners ?? []).flatMap(c => c.houses.flatMap(h => h.tasks.map(t => ({ ...t, house: h.name, who: c.name })))),
    ...(data.unassigned ?? []).flatMap(u => u.tasks.map(t => ({ ...t, house: u.name, who: '' })))]
  const real = (data.cleaners ?? []).filter(c => !c.test)

  return (
    <details className="mb-xl rounded-2xl border border-neutral-200 bg-white" open>
      <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-sm px-lg py-md">
        <span className="text-base font-bold text-neutral-900">Weekly email to cleaners</span>
        <span className="text-xs text-neutral-500">{data.days.find(d => d.value === data.setting)?.label ?? 'Off'}</span>
      </summary>
      <div className="space-y-lg border-t border-neutral-100 px-lg py-md">
        {!data.ready ? <p className="rounded-lg bg-amber-50 px-md py-sm text-sm font-semibold text-amber-900">Run migration 276 in Supabase first: it adds how long each clean takes, the weekly extra jobs and the email record.</p> : <>

        {/* when it goes */}
        <div>
          <div className="flex flex-wrap gap-xs" role="radiogroup" aria-label="When the weekly email goes">
            {data.days.map(d => (
              <button key={d.value} type="button" role="radio" aria-checked={data.setting === d.value} disabled={busy === 'setting'}
                onClick={async () => { if (await post({ setting: d.value }, 'setting')) { setData(x => x && { ...x, setting: d.value }); setNote(d.value === 'off' ? 'Weekly email switched off.' : `Weekly email: ${d.label}.`) } }}
                className={`rounded-full border px-md py-xs text-sm font-semibold ${data.setting === d.value ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-100'}`}>{d.label}</button>
            ))}
          </div>
          <p className="mt-xs text-xs text-neutral-600">{HELP[data.setting]} It lists each house due a clean that week (from the schedules above), whether it’s booked yet, how long it takes, and any extra jobs below. Nobody gets the same week twice.</p>
        </div>

        {/* which week */}
        <div className="flex items-center gap-sm">
          <button type="button" onClick={() => load(shift(data.weekStart, -7))} className="rounded-lg border border-neutral-300 px-sm py-xs text-sm font-semibold hover:bg-neutral-50" aria-label="Previous week">‹</button>
          <p className="text-sm font-bold text-neutral-900">Week of {day(data.weekStart)}</p>
          <button type="button" onClick={() => load(shift(data.weekStart, 7))} className="rounded-lg border border-neutral-300 px-sm py-xs text-sm font-semibold hover:bg-neutral-50" aria-label="Next week">›</button>
        </div>

        {/* extra jobs this week */}
        <div className="rounded-xl bg-neutral-50 p-md">
          <p className="text-sm font-bold text-neutral-900">Extra jobs this week</p>
          <p className="mb-sm text-xs text-neutral-600">For example “Room 3 is empty, clean it ready for viewings”. It goes to that house’s regular cleaner in this week’s email.</p>
          <form className="grid grid-cols-2 gap-sm sm:grid-cols-[1.4fr_1fr_2fr_1fr_auto]" onSubmit={async e => {
            e.preventDefault()
            if (!form.propertyId) { setError('Pick the house.'); return }
            if (await post({ action: 'task', weekStart: data.weekStart, ...form }, 'task')) { setForm({ propertyId: form.propertyId, roomId: '', task: '', extraHours: '' }); setNote('Extra job added.'); load() }
          }}>
            <label className="col-span-2 text-xs text-neutral-600 sm:col-span-1">House
              <select value={form.propertyId} onChange={e => setForm({ ...form, propertyId: e.target.value, roomId: '' })} className={`mt-xs ${field}`}>
                <option value="">Choose…</option>
                {data.houses?.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select></label>
            <label className="text-xs text-neutral-600">Room (optional)
              <select value={form.roomId} disabled={!rooms.length} onChange={e => setForm({ ...form, roomId: e.target.value })} className={`mt-xs ${field}`}>
                <option value="">Whole house</option>
                {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select></label>
            <label className="col-span-2 text-xs text-neutral-600 sm:col-span-1">What needs doing
              <input value={form.task} onChange={e => setForm({ ...form, task: e.target.value })} maxLength={300} placeholder="Empty room, clean it ready for viewings" className={`mt-xs ${field}`} /></label>
            <label className="text-xs text-neutral-600">Extra time
              <select value={form.extraHours} onChange={e => setForm({ ...form, extraHours: e.target.value })} className={`mt-xs ${field}`}>
                <option value="">None</option>
                {[0.5, 1, 1.5, 2, 3, 4].map(h => <option key={h} value={h}>{h} hour{h === 1 ? '' : 's'}</option>)}
              </select></label>
            <div className="flex items-end"><button type="submit" disabled={busy === 'task' || !form.task.trim()} className="w-full rounded-lg bg-neutral-900 px-md py-xs text-sm font-bold text-white disabled:bg-neutral-200 disabled:text-neutral-500">Add</button></div>
          </form>
          {allTasks.length > 0 && (
            <ul className="mt-md divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white text-sm">
              {allTasks.map(t => (
                <li key={t.id} className="flex flex-wrap items-center gap-sm px-md py-xs">
                  <span className="flex-1"><strong>{t.house}</strong>{t.roomName ? ` · ${t.roomName}` : ''}: {t.task}{t.extraHours ? ` (+${t.extraHours}h)` : ''}
                    <span className="block text-xs text-neutral-500">{t.who ? `For ${t.who}` : 'No regular cleaner at this house: set one above or it won’t be sent'}</span></span>
                  <button type="button" onClick={async () => { if (await post({ action: 'cancelTask', id: t.id }, 'x')) load() }} className="text-xs font-semibold text-red-700 hover:underline">Remove</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {note && <p className="text-sm font-semibold text-green-800">{note}</p>}
        {error && <p className="text-sm font-semibold text-red-700">{error}</p>}

        {/* each cleaner's email */}
        <div>
          <p className="mb-sm text-sm font-bold text-neutral-900">This week’s emails</p>
          {!(data.cleaners ?? []).length ? <p className="text-sm text-neutral-500">Nobody has a clean due that week. Houses need a regular cleaner and “How often” set above.</p> : (
            <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
              {(data.cleaners ?? []).map(c => {
                const toBook = c.houses.filter(h => !h.booked).length
                return (
                  <li key={c.cleanerId} className="px-md py-sm">
                    <div className="flex flex-wrap items-center gap-sm">
                      <span className="flex-1 text-sm"><strong>{c.name}</strong>{c.test ? ' (test account, never sent)' : ''}
                        <span className="block text-xs text-neutral-500">{c.houses.length} house{c.houses.length === 1 ? '' : 's'} · {toBook ? `${toBook} not booked yet` : 'all booked'}{c.sentAt ? ` · sent ${day(c.sentAt.slice(0, 10), { weekday: 'short', day: 'numeric', month: 'short' })}` : ''}</span></span>
                      <button type="button" onClick={() => setOpen(open === c.cleanerId ? null : c.cleanerId)} className="rounded-lg border border-neutral-300 px-md py-xs text-xs font-bold hover:bg-neutral-50">{open === c.cleanerId ? 'Hide' : 'Preview'}</button>
                      <button type="button" disabled={busy === `t${c.cleanerId}`} onClick={async () => { const d = await post({ action: 'test', cleanerId: c.cleanerId, weekStart: data.weekStart }, `t${c.cleanerId}`); if (d) setNote(`Test sent to ${d.to}.`) }} className="rounded-lg border border-neutral-300 px-md py-xs text-xs font-bold hover:bg-neutral-50">{busy === `t${c.cleanerId}` ? 'Sending…' : 'Send me a test'}</button>
                    </div>
                    {open === c.cleanerId && (
                      <div className="mt-sm rounded-lg border border-neutral-200 p-md">
                        <p className="mb-sm text-xs text-neutral-500">Subject: <strong className="text-neutral-800">{c.subject}</strong>{c.email ? ` · to ${c.email}` : ' · no email address'}</p>
                        {/* the email body as they'll read it (inside the usual letterhead) */}
                        <div className="max-w-xl text-sm" dangerouslySetInnerHTML={{ __html: c.html }} />
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          {real.length > 0 && (
            <button type="button" disabled={busy === 'send'} onClick={async () => {
              if (!confirm(`Send this week’s email now to ${real.filter(c => !c.sentAt).length} cleaner(s)? Anyone already sent this week is skipped.`)) return
              const d = await post({ action: 'send', weekStart: data.weekStart }, 'send')
              if (d) { setNote([d.sent?.length ? `Sent to ${d.sent.join(', ')}.` : 'Nobody new to send to.', d.skipped?.length ? `Skipped: ${d.skipped.join('; ')}.` : ''].filter(Boolean).join(' ')); load() }
            }} className="mt-md rounded-lg bg-neutral-900 px-md py-sm text-sm font-bold text-white disabled:bg-neutral-300">{busy === 'send' ? 'Sending…' : 'Send this week’s emails now'}</button>
          )}
        </div>
        </>}
      </div>
    </details>
  )
}
