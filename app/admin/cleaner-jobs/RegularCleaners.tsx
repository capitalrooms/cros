'use client'

// Each house's cleaning set-up (24–26 Oct 2026, Harry: "choose which properties she will be cleaning… the schedule those
// properties have cleaning (where is this saved in admin console)"). Per house: the regular cleaner, how often, the
// usual day and time — saved on the house (properties.regular_cleaner_id / clean_frequency_weeks / clean_day /
// clean_time). With all four set and nothing booked, saving puts the next clean in the cleaner's diary. Above the
// list: how tenants hear about cleans (email now, the app later).
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { adminFetch } from '@/lib/adminFetch'

type House = { id: string; name: string; regularCleanerId: string | null; everyWeeks: number | null; day: number | null; time: string | null; openCleans: number; nextClean: { date: string; time: string | null } | null }
type Cleaner = { id: string; name: string; test: boolean }
type Data = { ready: boolean; scheduleReady: boolean; channel: string; channels: { value: string; label: string }[]; houses: House[]; cleaners: Cleaner[] }
type Draft = { cleanerId: string; everyWeeks: string; day: string; time: string }

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const fullDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const clock = (t: string | null) => { if (!t) return ''; const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}` }
const draftOf = (h: House): Draft => ({ cleanerId: h.regularCleanerId ?? '', everyWeeks: h.everyWeeks ? String(h.everyWeeks) : '', day: h.day ? String(h.day) : '', time: h.time ?? '' })
const CHANNEL_HELP: Record<string, string> = {
  email: 'Tenants get an email when a clean is booked, moved, running late, finished or cancelled.',
  app: 'Tenants get an app notification instead of an email — use this once they’re on the app.',
  app_email: 'Tenants get both an app notification and an email.',
  off: 'Tenants aren’t told about cleans.',
}

export default function RegularCleaners({ onChanged }: { onChanged: () => void }) {
  const [data, setData] = useState<Data | null>(null)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [error, setError] = useState('')
  const [handOver, setHandOver] = useState(true)
  const [saving, setSaving] = useState('')
  const [note, setNote] = useState('')

  const load = () => adminFetch('/api/admin/cleaner/regular').then(async r => {
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error ?? 'The houses couldn’t be loaded'); return }
    setData(d); setDrafts(Object.fromEntries((d.houses as House[]).map(h => [h.id, draftOf(h)])))
  }).catch(() => setError('The houses couldn’t be loaded — check the connection.'))
  useEffect(() => { load() }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  async function post(body: object) {
    const r = await adminFetch('/api/admin/cleaner/regular', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return { ok: r.ok, d: await r.json().catch(() => ({})) }
  }

  async function setChannel(v: string) {
    setSaving('channel'); setNote(''); setError('')
    const { ok, d } = await post({ channel: v })
    setSaving('')
    if (!ok) { setError(d.error ?? 'Not saved'); return }
    setData(x => x && { ...x, channel: v })
    setNote(`Tenant updates about cleans: ${data?.channels.find(c => c.value === v)?.label ?? v}.`)
  }

  async function save(h: House) {
    const dr = drafts[h.id]
    setSaving(h.id); setNote(''); setError('')
    const body: Record<string, unknown> = { propertyId: h.id, cleanerId: dr.cleanerId || null, everyWeeks: dr.everyWeeks || null, handOver }
    if (data?.scheduleReady) { body.day = dr.day || null; body.time = dr.time || null }
    const { ok, d } = await post(body)
    setSaving('')
    if (!ok) { setError(`${h.name}: ${d.error ?? 'not saved'}`); return }
    const who = data?.cleaners.find(c => c.id === dr.cleanerId)?.name
    setNote([`${h.name} saved${who ? ` — ${who} is the regular cleaner` : ''}.`,
      d.moved ? `${d.moved} open clean${d.moved === 1 ? '' : 's'} handed over.` : '',
      d.booked ? `Next clean booked for ${fullDate(d.booked)}${dr.time ? ` at ${clock(dr.time)}` : ''} and the tenants told.` : ''].filter(Boolean).join(' '))
    await load(); if (d.moved || d.booked) onChanged()
  }

  if (error && !data) return <p className="mb-lg text-sm font-semibold text-red-700">{error}</p>
  if (!data) return null
  const withOne = data.houses.filter(h => h.regularCleanerId).length
  const real = data.cleaners.filter(c => !c.test)
  const field = 'w-full rounded-lg border border-neutral-300 bg-white px-sm py-xs text-sm text-neutral-900 disabled:opacity-50'

  return (
    <details className="mb-xl rounded-2xl border border-neutral-200 bg-white" open={withOne === 0}>
      <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-sm px-lg py-md">
        <span className="text-base font-bold text-neutral-900">Cleaners and schedules</span>
        <span className="text-xs text-neutral-500">{withOne} of {data.houses.length} houses have a regular cleaner</span>
      </summary>
      <div className="space-y-md border-t border-neutral-100 px-lg py-md">
        <div className="rounded-xl bg-neutral-50 p-md">
          <p className="text-sm font-bold text-neutral-900">How tenants hear about cleans</p>
          <div className="mt-sm flex flex-wrap gap-xs" role="radiogroup" aria-label="How tenants hear about cleans">
            {data.channels.map(c => (
              <button key={c.value} type="button" role="radio" aria-checked={data.channel === c.value} disabled={saving === 'channel'} onClick={() => setChannel(c.value)}
                className={`rounded-full border px-md py-xs text-sm font-semibold ${data.channel === c.value ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-100'}`}>{c.label}</button>
            ))}
          </div>
          <p className="mt-xs text-xs text-neutral-600">{CHANNEL_HELP[data.channel]} “Your cleaner has arrived” only ever goes as an app notification.</p>
        </div>

        <p className="text-sm text-neutral-600">For each house: who cleans it, how often, and the usual day and time. Once all four are set, saving books the next clean in the cleaner’s app and tells the tenants. New move-out cleans go to the regular cleaner too.</p>
        {!data.ready && <p className="rounded-lg bg-amber-50 px-md py-sm text-sm font-semibold text-amber-900">Run migration 243 first — it adds each house’s regular cleaner.</p>}
        {data.ready && !data.scheduleReady && <p className="rounded-lg bg-amber-50 px-md py-sm text-sm font-semibold text-amber-900">Run migration 245 to set each house’s cleaning day and time.</p>}
        {real.length === 0 && <p className="rounded-lg bg-amber-50 px-md py-sm text-sm text-amber-900">The only cleaners in CROS are test accounts. Add your cleaner on <Link href="/admin/people?tab=cleaners" className="font-semibold underline">People › Cleaners</Link> first.</p>}
        <label className="flex items-center gap-sm text-sm text-neutral-700">
          <input type="checkbox" checked={handOver} onChange={e => setHandOver(e.target.checked)} className="h-4 w-4" />
          Also give the regular cleaner the house’s open cleans nobody has accepted yet
        </label>
        {note && <p className="text-sm font-semibold text-green-800">{note}</p>}
        {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
        <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
          {data.houses.map(h => {
            const dr = drafts[h.id] ?? draftOf(h)
            const dirty = JSON.stringify(dr) !== JSON.stringify(draftOf(h))
            const set = (k: keyof Draft, v: string) => setDrafts(x => ({ ...x, [h.id]: { ...dr, [k]: v } }))
            const busy = !data.ready || saving === h.id
            return (
              <li key={h.id} className="space-y-sm px-md py-md">
                <div className="flex flex-wrap items-baseline justify-between gap-sm">
                  <span className="text-sm font-semibold text-neutral-900">{h.name}</span>
                  <span className="text-xs text-neutral-500">{h.nextClean ? `Next clean ${fullDate(h.nextClean.date)}${h.nextClean.time ? ` at ${clock(h.nextClean.time.slice(0, 5))}` : ''}` : 'No clean booked'}{h.openCleans > 1 ? ` · ${h.openCleans} open` : ''}</span>
                </div>
                <div className="grid grid-cols-2 gap-sm sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
                  <label className="col-span-2 text-xs text-neutral-600 sm:col-span-1">Regular cleaner
                    <select value={dr.cleanerId} disabled={busy} onChange={e => set('cleanerId', e.target.value)} className={`mt-xs ${field}`}>
                      <option value="">No regular cleaner</option>
                      {data.cleaners.map(c => <option key={c.id} value={c.id}>{c.name}{c.test ? ' (test)' : ''}</option>)}
                    </select></label>
                  <label className="text-xs text-neutral-600">How often
                    <select value={dr.everyWeeks} disabled={busy} onChange={e => set('everyWeeks', e.target.value)} className={`mt-xs ${field}`}>
                      <option value="">Not set</option>
                      {[1, 2, 3, 4].map(w => <option key={w} value={w}>{w === 1 ? 'Every week' : `Every ${w} weeks`}</option>)}
                    </select></label>
                  <label className="text-xs text-neutral-600">Day
                    <select value={dr.day} disabled={busy || !data.scheduleReady} onChange={e => set('day', e.target.value)} className={`mt-xs ${field}`}>
                      <option value="">Not set</option>
                      {DAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
                    </select></label>
                  <label className="text-xs text-neutral-600">Time
                    <input type="time" step={900} value={dr.time} disabled={busy || !data.scheduleReady} onChange={e => set('time', e.target.value)} className={`mt-xs ${field}`} /></label>
                  <div className="flex items-end">
                    <button type="button" onClick={() => save(h)} disabled={busy || !dirty}
                      className="w-full rounded-lg bg-neutral-900 px-md py-xs text-sm font-bold text-white disabled:bg-neutral-200 disabled:text-neutral-500">{saving === h.id ? 'Saving…' : 'Save'}</button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </details>
  )
}
