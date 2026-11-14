'use client'
// Room locations (14 Nov 2026) — where each room is in the house, for every room at once. Paste a list in any shape
// ("Claverton: Room 1 ground floor front, Room 2 first floor back…") → CROS matches each line to a room and shows them
// to check → save. Or type them straight into the table. Used in contractor emails and texts, quotes, emergencies
// and the cleaner and contractor apps. /api/admin/room-locations.
import { useEffect, useMemo, useState } from 'react'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import { adminFetch } from '@/lib/adminFetch'

type R = { id: string; property: string; propertyId: string; room: string; location: string }
type M = { roomId: string; property: string; room: string; current: string; location: string; line: string; sure: boolean; use: boolean }

export default function RoomLocations() {
  const [rooms, setRooms] = useState<R[] | null>(null)
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [text, setText] = useState('')
  const [matches, setMatches] = useState<M[] | null>(null)
  const [unmatched, setUnmatched] = useState<string[]>([])
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [onlyMissing, setOnlyMissing] = useState(false)

  const load = () => adminFetch('/api/admin/room-locations').then(r => r.json()).then(j => { setRooms(j.rooms ?? []); setEdits({}) }).catch(() => setRooms([]))
  useEffect(() => { load() }, [])

  const post = (body: unknown) => adminFetch('/api/admin/room-locations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async r => ({ ok: r.ok, j: await r.json().catch(() => ({})) as any }))
  async function read() {
    setBusy('match'); setMsg(''); setMatches(null)
    const r = await post({ action: 'match', text })
    setBusy('')
    if (!r.ok) { setMsg(r.j.error || 'Couldn’t read the list'); return }
    setMatches((r.j.items ?? []).map((x: any) => ({ ...x, use: true }))); setUnmatched(r.j.unmatched ?? [])
  }
  async function save(items: { roomId: string; location: string }[], after: () => void) {
    if (!items.length) return
    setBusy('save'); setMsg('')
    const r = await post({ action: 'save', items })
    setBusy('')
    if (!r.ok) { setMsg(r.j.error || 'Didn’t save'); return }
    setMsg(`Saved ${r.j.saved} room${r.j.saved === 1 ? '' : 's'}.`); after(); load()
  }

  const groups = useMemo(() => {
    const g = new Map<string, R[]>()
    for (const r of rooms ?? []) { if (onlyMissing && r.location) continue; g.set(r.property, [...(g.get(r.property) ?? []), r]) }
    return [...g.entries()]
  }, [rooms, onlyMissing])
  const done = (rooms ?? []).filter(r => r.location).length
  const changed = Object.entries(edits).filter(([id, v]) => (rooms ?? []).find(r => r.id === id)?.location !== v)
  const field = 'w-full rounded-lg border border-neutral-300 bg-white px-sm py-1.5 text-sm text-neutral-900'

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin/active-rooms" />} title="Room Locations" />
      <div className="mx-auto max-w-6xl px-lg py-xl">
        <h1 className="text-2xl font-bold text-neutral-900">Where each room is</h1>
        <p className="mt-xs max-w-2xl text-sm text-neutral-600">So a contractor, cleaner or anyone sent a job can find “Room 4 (first floor, back)” without asking. It goes into their emails, texts, quotes, emergency call-outs and apps.</p>
        {rooms && <p className="mt-sm text-sm font-semibold text-neutral-800">{done} of {rooms.length} rooms done</p>}

        <section className="mt-lg rounded-2xl bg-white p-lg ring-1 ring-neutral-200">
          <p className="font-semibold text-neutral-900">Paste a list</p>
          <p className="text-xs text-neutral-500">Any shape is fine — one room a line, or a property name then its rooms underneath. E.g. “Claverton — Room 1 ground floor front, Room 2 first floor back”.</p>
          <textarea value={text} onChange={e => setText(e.target.value)} rows={7} className={`${field} mt-sm font-mono`} placeholder={'75 Crownfield Road\nRoom 1 – ground floor, front\nRoom 2 – ground floor, back\n…'} />
          <button type="button" disabled={!text.trim() || !!busy} onClick={read} className="mt-sm rounded-xl bg-neutral-900 px-lg py-sm text-sm font-semibold text-white disabled:opacity-40">{busy === 'match' ? 'Reading the list…' : 'Read the list'}</button>

          {matches && (
            <div className="mt-lg">
              <p className="text-sm font-semibold text-neutral-900">{matches.length} matched — check them, untick any that are wrong, then save</p>
              <div className="mt-sm overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs uppercase tracking-wider text-neutral-500"><th className="py-xs pr-sm"></th><th className="py-xs pr-sm">Property</th><th className="py-xs pr-sm">Room</th><th className="py-xs pr-sm">Where</th><th className="py-xs">From your list</th></tr></thead>
                  <tbody>{matches.map((m, i) => (
                    <tr key={m.roomId + i} className={`border-t border-neutral-100 ${!m.sure ? 'bg-amber-50' : ''}`}>
                      <td className="py-xs pr-sm"><input type="checkbox" checked={m.use} onChange={e => setMatches(v => v!.map((x, k) => k === i ? { ...x, use: e.target.checked } : x))} /></td>
                      <td className="py-xs pr-sm">{m.property}</td>
                      <td className="py-xs pr-sm font-semibold">{m.room}</td>
                      <td className="py-xs pr-sm"><input value={m.location} onChange={e => setMatches(v => v!.map((x, k) => k === i ? { ...x, location: e.target.value } : x))} className={field} />{m.current && m.current !== m.location && <span className="text-xs text-neutral-500">was: {m.current}</span>}</td>
                      <td className="py-xs text-xs text-neutral-500">{m.line}{!m.sure && <b className="ml-xs text-amber-800">check this one</b>}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              {unmatched.length > 0 && <p className="mt-sm text-xs text-neutral-600"><b>Couldn’t match:</b> {unmatched.join(' · ')}</p>}
              <button type="button" disabled={!!busy || !matches.some(m => m.use)} onClick={() => save(matches.filter(m => m.use).map(m => ({ roomId: m.roomId, location: m.location })), () => { setMatches(null); setText('') })}
                className="mt-md rounded-xl bg-emerald-700 px-lg py-sm text-sm font-semibold text-white disabled:opacity-40">{busy === 'save' ? 'Saving…' : `Save ${matches.filter(m => m.use).length}`}</button>
            </div>
          )}
          {msg && <p className="mt-sm text-sm text-neutral-700">{msg}</p>}
        </section>

        <section className="mt-lg rounded-2xl bg-white p-lg ring-1 ring-neutral-200">
          <div className="flex flex-wrap items-center justify-between gap-sm">
            <p className="font-semibold text-neutral-900">Or type them in</p>
            <label className="flex items-center gap-xs text-sm text-neutral-700"><input type="checkbox" checked={onlyMissing} onChange={e => setOnlyMissing(e.target.checked)} /> Only rooms still to do</label>
          </div>
          {!rooms && <p className="mt-sm text-sm text-neutral-500">Loading…</p>}
          <div className="mt-sm space-y-md">
            {groups.map(([prop, list]) => (
              <div key={prop}>
                <p className="text-sm font-bold text-neutral-900">{prop}</p>
                <div className="mt-xs grid gap-xs sm:grid-cols-2">
                  {list.map(r => (
                    <label key={r.id} className="flex items-center gap-sm text-sm">
                      <span className="w-24 shrink-0 font-semibold text-neutral-700">{r.room}</span>
                      <input value={edits[r.id] ?? r.location} onChange={e => setEdits(v => ({ ...v, [r.id]: e.target.value }))} placeholder="e.g. first floor, back" className={field} />
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {changed.length > 0 && (
            <div className="sticky bottom-0 mt-md flex items-center gap-md bg-white py-sm">
              <button type="button" disabled={!!busy} onClick={() => save(changed.map(([roomId, location]) => ({ roomId, location })), () => {})} className="rounded-xl bg-emerald-700 px-lg py-sm text-sm font-semibold text-white">{busy === 'save' ? 'Saving…' : `Save ${changed.length} change${changed.length === 1 ? '' : 's'}`}</button>
              <button type="button" onClick={() => setEdits({})} className="text-sm font-semibold underline">Undo</button>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
