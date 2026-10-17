'use client'

// A cleaner's page for one house (17 Oct 2026): the usual visit, one list of "notes for this house" shared with the
// office (add one, tick one off), and past cleans with what was noted. Opened from a clean. The office sees and adds
// the same notes on Property notes. Data: /api/cleaner/house.
import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'

const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

export default function CleanerHouse({ params }: { params: Promise<{ propertyId: string }> }) {
  const { propertyId } = use(params)
  const [d, setD] = useState<any>(null)
  const [error, setError] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    const r = await fetch(`/api/cleaner/house?propertyId=${propertyId}`)
    const j = await r.json().catch(() => ({}))
    if (!r.ok) setError(j.error || 'Could not open the house'); else setD(j)
  }, [propertyId])
  useEffect(() => { load() }, [load])

  async function add() {
    if (!text.trim()) return
    setBusy('add')
    const r = await fetch('/api/cleaner/house', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ propertyId, text }) })
    setBusy('')
    if (r.ok) { setText(''); load() } else setError('Could not save the note')
  }
  async function tick(noteId: string) {
    setBusy(noteId)
    await fetch('/api/cleaner/house', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ noteId }) })
    setBusy(''); load()
  }

  const shell = (body: React.ReactNode) => <div className="min-h-screen bg-neutral-100 pb-3xl"><AppBar left={<BackButton href="/cleaner" />} title="House" /><main className="mx-auto max-w-2xl px-lg py-lg space-y-md">{body}</main></div>
  if (error) return shell(<p className="text-sm text-red-700">{error}</p>)
  if (!d) return shell(<p className="text-sm text-neutral-500">Loading…</p>)
  const h = d.house, u = d.usual
  const rhythm = [u.everyWeeks ? (u.everyWeeks === 1 ? 'Every week' : `Every ${u.everyWeeks} weeks`) : null, u.day ? `usually ${u.day}s` : null, u.time ? `at ${u.time}` : null, u.hours ? `for ${u.hours} hour${u.hours === '1' ? '' : 's'}` : null].filter(Boolean).join(' ')

  return shell(<>
    <section className="rounded-2xl bg-white p-lg">
      <h1 className="text-xl font-extrabold text-neutral-900" style={{ fontFamily: 'var(--font-baloo-2, system-ui, sans-serif)' }}>{String(h.name || h.address).split('\n')[0]}</h1>
      <p className="text-sm text-neutral-500">{String(h.address ?? '').replace(/\s*\n\s*/g, ', ')}</p>
      <p className="mt-sm text-sm font-semibold text-neutral-800">{rhythm || 'No usual time yet — it’s worked out from your cleans here.'}</p>
      {h.communal_notes && <p className="mt-sm whitespace-pre-line rounded-xl bg-neutral-50 p-md text-sm text-neutral-700">{h.communal_notes}</p>}
    </section>

    <section className="rounded-2xl bg-white p-lg">
      <h2 className="text-sm font-bold text-neutral-900">Notes for this house <span className="font-normal text-neutral-500">· you and the office both see these</span></h2>
      {d.notes.length === 0 ? <p className="mt-xs text-sm text-neutral-500">Nothing open.</p> : (
        <ul className="mt-sm divide-y divide-neutral-100">
          {d.notes.map((n: any) => (
            <li key={n.id} className="flex items-start justify-between gap-md py-sm">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">{n.cleaning_type === 'reminder' ? 'From you' : n.cleaning_type === 'office' ? 'From the office' : (n.note_title || 'Task')}</p>
                <p className="whitespace-pre-line text-sm text-neutral-900">{n.note_content || n.note_title}</p>
              </div>
              <button type="button" onClick={() => tick(n.id)} disabled={busy === n.id} className="shrink-0 rounded-lg border border-neutral-300 px-sm py-1 text-xs font-semibold text-neutral-700 disabled:opacity-50">{busy === n.id ? '…' : '✓ Done'}</button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-sm flex gap-sm">
        <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="Add a note — e.g. bin day is Tuesday" className="flex-1 rounded-xl border border-neutral-300 px-md py-sm text-sm" />
        <button type="button" onClick={add} disabled={busy === 'add' || !text.trim()} className="rounded-xl bg-neutral-900 px-md py-sm text-sm font-bold text-white disabled:opacity-40">Add</button>
      </div>
      {d.done.length > 0 && <details className="mt-sm text-xs text-neutral-500"><summary className="cursor-pointer">Done recently ({d.done.length})</summary><ul className="mt-xs space-y-xs">{d.done.map((n: any) => <li key={n.id}>✓ {n.note_content || n.note_title}</li>)}</ul></details>}
    </section>

    <section className="rounded-2xl bg-white p-lg">
      <h2 className="text-sm font-bold text-neutral-900">Cleans here</h2>
      <ul className="mt-sm divide-y divide-neutral-100">
        {d.cleans.map((c: any) => (
          <li key={c.id} className="py-sm text-sm">
            <Link href={`/cleaner/clean/${c.id}`} className="flex justify-between gap-md"><span className="font-semibold text-neutral-900">{day(c.clean_date)}{c.clean_time ? ` · ${String(c.clean_time).slice(0, 5)}` : ''}</span><span className={`text-xs font-semibold ${c.status === 'completed' ? 'text-emerald-700' : 'text-neutral-500'}`}>{c.status === 'completed' ? 'Done' : 'Booked'}</span></Link>
            {[c.admin_note && `Office: ${c.admin_note}`, c.cleaner_note && `You: ${c.cleaner_note}`, c.notes].filter(Boolean).map((t: string, i: number) => <p key={i} className="mt-0.5 text-xs text-neutral-600">{t}</p>)}
          </li>
        ))}
      </ul>
    </section>
  </>)
}
