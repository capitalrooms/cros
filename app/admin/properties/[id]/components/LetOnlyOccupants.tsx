'use client'
// Who lives here — let-only houses (12 Nov 2026, Harry). The landlord tells us: "Ask the landlord" emails them a
// line per room to fill in, they reply, and "Paste their reply" reads it in (the room-list reader). People can also be
// added or changed by hand. Kept for reference only (let_only_occupants) — never a tenancy. Used for the viewing
// heads-up texts, for greeting them by name, and (where the landlord said they're happy) to describe the household on
// adverts — never by name.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { adminFetch } from '@/lib/adminFetch'

type Occ = { id: string; roomId: string; roomName: string; name: string; phone: string | null; email: string | null; occupation: string | null; age: number | null; gender: string | null; share: boolean; source: string | null }
type Draft = { id?: string; roomId: string; roomName?: string; name: string; phone: string; email: string; occupation: string; age: string; gender: string; share: boolean }
const blank = (roomId = ''): Draft => ({ roomId, name: '', phone: '', email: '', occupation: '', age: '', gender: '', share: false })
const field = 'w-full rounded-lg border border-neutral-300 bg-white px-sm py-xs text-sm'

export default function LetOnlyOccupants({ propertyId }: { propertyId: string }) {
  const [data, setData] = useState<{ occupants: Occ[]; rooms: { id: string; name: string }[]; landlord: { name: string; email: string | null } | null; askedAt: string | null; bedrooms: number | null } | null>(null)
  const [beds, setBeds] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [ask, setAsk] = useState<{ to: string; subject: string; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const load = () => adminFetch(`/api/let-only/occupants?propertyId=${propertyId}`).then(r => r.json()).then(d => { if (!d.error) setData(d) })
  useEffect(() => { load() }, [propertyId])   // eslint-disable-line react-hooks/exhaustive-deps

  async function post(body: any) {
    setBusy(true); setErr('')
    const r = await adminFetch('/api/let-only/occupants', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ propertyId, ...body }) })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setErr(d.error || 'That didn’t work'); return null }
    return d
  }
  async function preview() { const d = await post({ action: 'ask' }); if (d) setAsk(d) }
  async function send() { const d = await post({ action: 'ask', send: true }); if (d) { setAsk(null); setMsg(`Sent to ${d.to}. When they reply, use “Paste their reply”.`); load() } }
  async function save() { if (!draft) return; const isNew = draft.roomId.startsWith('new:'); const d = await post({ action: 'save', ...draft, roomId: isNew ? '' : draft.roomId, roomName: isNew ? draft.roomId.slice(4) : undefined }); if (d) { setDraft(null); setMsg('Saved.'); load() } }
  async function saveBeds() { const d = await post({ action: 'bedrooms', bedrooms: Number(beds) }); if (d) { setMsg('Saved.'); load() } }
  async function end(o: Occ) { if (!window.confirm(`${o.name} has moved out of ${o.roomName}?`)) return; if (await post({ action: 'end', id: o.id })) load() }

  if (!data) return null
  const onFile = data.rooms
  const extra = Array.from({ length: data.bedrooms ?? 0 }, (_, i) => `Room ${i + 1}`).filter(n => !onFile.some(r => r.name.toLowerCase().replace(/\s/g, '') === n.toLowerCase().replace(/\s/g, '')))
  const allRooms: { id: string; name: string; virtual?: boolean }[] = [...onFile, ...extra.map(n => ({ id: `new:${n}`, name: n, virtual: true }))].sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }))
  const peopleIn = (roomId: string) => data.occupants.filter(o => o.roomId === roomId)
  const byRoom = new Map(data.occupants.map(o => [o.roomId, o]))
  const describe = (o: Occ) => [o.gender, o.age ? String(o.age) : null, o.occupation].filter(Boolean).join(' · ')
  return (
    <section className="mb-lg rounded-2xl border border-neutral-200 bg-white p-lg">
      <div className="flex flex-wrap items-start justify-between gap-sm">
        <div>
          <h3 className="text-base font-bold text-neutral-900">Who lives here</h3>
          <p className="text-xs text-neutral-500">From the landlord. They get a text and email before every viewing, addressed by first name.{data.askedAt && ` Landlord last asked ${new Date(data.askedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}.`}</p>
        </div>
        <div className="flex flex-wrap gap-xs">
          <button type="button" onClick={preview} disabled={busy} className="rounded-full bg-neutral-900 px-md py-xs text-sm font-semibold text-white disabled:opacity-50">Ask the landlord</button>
          <Link href={`/admin/let-only-properties/room-list?property=${propertyId}`} className="rounded-full border border-neutral-300 px-md py-xs text-sm font-semibold text-neutral-800">Paste their reply</Link>
          <button type="button" onClick={() => setDraft(blank(allRooms.find(r => !byRoom.has(r.id))?.id ?? allRooms[0]?.id ?? ''))} className="rounded-full border border-neutral-300 px-md py-xs text-sm font-semibold text-neutral-800">Add by hand</button>
        </div>
      </div>
      {msg && <p className="mt-sm text-sm text-emerald-700">{msg}</p>}
      {err && <p className="mt-sm text-sm text-red-700">{err}</p>}

      {!data.bedrooms && (
        <div className="mt-md flex flex-wrap items-center gap-xs rounded-xl bg-amber-50 px-md py-sm text-sm text-amber-900">
          <span>How many bedrooms does the whole property have? (Including rooms we don’t let.)</span>
          <input value={beds} onChange={e => setBeds(e.target.value.replace(/\D/g, '').slice(0, 2))} inputMode="numeric" placeholder="e.g. 3" className="w-16 rounded-lg border border-amber-300 bg-white px-sm py-xs text-sm" />
          <button type="button" onClick={saveBeds} disabled={busy || !beds} className="rounded-full bg-neutral-900 px-md py-xs text-xs font-semibold text-white disabled:opacity-40">Save</button>
        </div>
      )}
      {ask && (
        <div className="mt-md rounded-xl border border-neutral-200 bg-neutral-50 p-md text-sm">
          <p className="text-neutral-600">To <b>{ask.to}</b> · <b>{ask.subject}</b></p>
          <pre className="mt-sm whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-neutral-800">{ask.text}</pre>
          <div className="mt-sm flex gap-xs">
            <button type="button" onClick={send} disabled={busy} className="rounded-full bg-neutral-900 px-md py-xs text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Sending…' : 'Send to the landlord'}</button>
            <button type="button" onClick={() => setAsk(null)} className="rounded-full border border-neutral-300 px-md py-xs text-sm font-semibold">Cancel</button>
          </div>
        </div>
      )}

      <ul className="mt-md divide-y divide-neutral-100">
        {allRooms.map(r => {
          const ppl = peopleIn(r.id)
          return (
            <li key={r.id} className="py-sm text-sm">
              <div className="flex flex-wrap items-center justify-between gap-sm">
                <span className="font-semibold text-neutral-900">{r.name}{r.virtual && <span className="ml-xs text-[11px] font-normal text-neutral-400">not one we let</span>}</span>
                <button type="button" className="text-xs font-semibold underline" onClick={() => setDraft(blank(r.id))}>{ppl.length ? '+ Add another person' : '+ Add who lives here'}</button>
              </div>
              {ppl.length === 0 && <p className="text-xs italic text-neutral-500">Nobody on file</p>}
              {ppl.map(o => (
                <div key={o.id} className="mt-xs flex flex-wrap items-start justify-between gap-sm">
                  <span className="min-w-0">
                    <span className="text-neutral-900">{o.name}</span>
                    {o.phone && <span className="ml-sm tabular-nums text-neutral-500">{o.phone}</span>}
                    {o.email && <span className="ml-sm text-neutral-500">{o.email}</span>}
                    {describe(o) && <span className="block text-xs text-neutral-600">{describe(o)}{o.share ? <span className="ml-xs font-semibold text-emerald-700">· on adverts (no name)</span> : null}</span>}
                    {!o.phone && !o.email && <span className="block text-xs font-semibold text-amber-700">No mobile or email — they won’t hear about viewings</span>}
                  </span>
                  <span className="flex gap-sm text-xs">
                    <button type="button" className="font-semibold underline" onClick={() => setDraft({ id: o.id, roomId: o.roomId, name: o.name, phone: o.phone ?? '', email: o.email ?? '', occupation: o.occupation ?? '', age: o.age ? String(o.age) : '', gender: o.gender ?? '', share: o.share })}>Edit</button>
                    <button type="button" className="font-semibold text-neutral-500 underline" onClick={() => end(o)}>Moved out</button>
                  </span>
                </div>
              ))}
            </li>
          )
        })}
      </ul>

      {draft && (
        <div className="mt-md grid gap-sm rounded-xl border border-neutral-200 bg-neutral-50 p-md sm:grid-cols-2">
          <label className="text-xs font-semibold text-neutral-600">Room<select className={field} value={draft.roomId} onChange={e => setDraft({ ...draft, roomId: e.target.value })}>{allRooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
          <label className="text-xs font-semibold text-neutral-600">Name<input className={field} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
          <label className="text-xs font-semibold text-neutral-600">Mobile<input className={field} inputMode="tel" value={draft.phone} onChange={e => setDraft({ ...draft, phone: e.target.value })} /></label>
          <label className="text-xs font-semibold text-neutral-600">Email<input className={field} type="email" value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })} /></label>
          <label className="text-xs font-semibold text-neutral-600">What they do<input className={field} value={draft.occupation} placeholder="e.g. Software developer" onChange={e => setDraft({ ...draft, occupation: e.target.value })} /></label>
          <div className="grid grid-cols-2 gap-sm">
            <label className="text-xs font-semibold text-neutral-600">Age<input className={field} inputMode="numeric" value={draft.age} onChange={e => setDraft({ ...draft, age: e.target.value.replace(/\D/g, '').slice(0, 3) })} /></label>
            <label className="text-xs font-semibold text-neutral-600">Male / female<select className={field} value={draft.gender} onChange={e => setDraft({ ...draft, gender: e.target.value })}><option value="">—</option><option value="male">Male</option><option value="female">Female</option></select></label>
          </div>
          <label className="flex items-start gap-xs text-sm sm:col-span-2"><input type="checkbox" className="mt-0.5 h-4 w-4" checked={draft.share} onChange={e => setDraft({ ...draft, share: e.target.checked })} /><span>The landlord says they’re happy to be mentioned on adverts — described, never named (e.g. “a 27-year-old male software developer”)</span></label>
          <div className="flex gap-xs sm:col-span-2">
            <button type="button" onClick={save} disabled={busy} className="rounded-full bg-neutral-900 px-md py-xs text-sm font-semibold text-white disabled:opacity-50">Save</button>
            <button type="button" onClick={() => setDraft(null)} className="rounded-full border border-neutral-300 px-md py-xs text-sm font-semibold">Cancel</button>
          </div>
        </div>
      )}
    </section>
  )
}
