'use client'

// "Popping by" — tell the tenants about an unbooked visit, then get the key safe code (lib/access/visits).
// Contractors: shared areas only. Lettings / office: may pick a room (e.g. photos) — an occupied room needs 24 hours'
// notice unless the tenant has agreed.

import { useEffect, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'

interface Option { id: string; name: string; rooms: { id: string; name: string; occupied: boolean }[] }
interface Result { told: number; property: string; room: string | null; when: string; keySafe: string | null; reminder: string; noTenants: boolean }

const londonToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
const nextQuarter = () => { const d = new Date(); d.setMinutes(Math.ceil((d.getMinutes() + 1) / 15) * 15, 0, 0); return d }

// openKey: opened from elsewhere (the lettings Quick notify menu) — each new number opens it; hideButton: no button of its own
export default function PoppingByVisit({ className = '', label = 'Popping by a property', openKey = 0, hideButton = false }: { className?: string; label?: string; openKey?: number; hideButton?: boolean }) {
  const [open, setOpen] = useState(false)
  useEffect(() => { if (openKey) setOpen(true) }, [openKey])
  const [opts, setOpts] = useState<Option[] | null>(null)
  const [canRoom, setCanRoom] = useState(false)
  const [propertyId, setPropertyId] = useState('')
  const [roomId, setRoomId] = useState('')
  const [date, setDate] = useState(londonToday())
  const [from, setFrom] = useState(hhmm(nextQuarter()))
  const [to, setTo] = useState(hhmm(new Date(nextQuarter().getTime() + 3_600_000)))
  const [reason, setReason] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<Result | null>(null)

  useEffect(() => {
    if (!open || opts) return
    adminFetch('/api/visits').then(async r => {
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error || 'Could not load your properties'); setOpts([]); return }
      setOpts(d.properties ?? []); setCanRoom(!!d.canChooseRoom)
      if ((d.properties ?? []).length === 1) setPropertyId(d.properties[0].id)
    }).catch(() => { setError('Could not load your properties'); setOpts([]) })
  }, [open, opts])

  const prop = opts?.find(p => p.id === propertyId)
  const room = prop?.rooms.find(r => r.id === roomId)

  function close() { setOpen(false); setDone(null); setError(''); setReason(''); setRoomId(''); setAgreed(false) }

  async function send() {
    setBusy(true); setError('')
    const r = await adminFetch('/api/visits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ propertyId, roomId: roomId || null, date, from, to, reason, tenantAgreed: agreed }) })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setError(d.error || 'Could not tell the tenants'); return }
    setDone(d)
  }

  const input = 'w-full rounded-lg border border-neutral-300 bg-white px-sm py-xs text-sm text-neutral-900'
  const lab = 'block text-xs font-semibold text-neutral-700'

  return (
    <>
      {!hideButton && <button type="button" onClick={() => setOpen(true)} className={className || 'rounded-xl border border-neutral-300 bg-white px-md py-sm text-sm font-bold text-neutral-900 hover:bg-neutral-50'}>
        🔑 {label}
      </button>}

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={close}>
          <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-lg text-neutral-900 shadow-xl sm:rounded-2xl" onClick={e => e.stopPropagation()}>
            {!done ? (
              <div className="space-y-md">
                <div>
                  <h2 className="text-lg font-bold">Popping by</h2>
                  <p className="text-sm text-neutral-600">Tell the tenants you’re coming. Once they’ve been told, you’ll see the key safe code.</p>
                </div>
                <div className="rounded-xl border border-amber-300 bg-amber-50 px-md py-sm text-sm text-amber-900">
                  <strong>The key safe opens the house only.</strong>{' '}
                  {canRoom ? 'Only go into a room you’ve chosen below — never anyone else’s.' : 'You must not go into any tenant’s room on a pop-by visit. If work is needed in a room, it has to be a booked job.'}
                </div>
                {opts === null ? <p className="text-sm text-neutral-500">Loading…</p> : opts.length === 0 ? (
                  <p className="text-sm text-neutral-600">{error || 'There are no properties you can pop by yet — you can visit properties where you’ve done jobs.'}</p>
                ) : (
                  <>
                    <label className={lab}>Property
                      <select className={input} value={propertyId} onChange={e => { setPropertyId(e.target.value); setRoomId(''); setAgreed(false) }}>
                        <option value="">Choose…</option>
                        {opts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </label>
                    {canRoom && prop && prop.rooms.length > 0 && (
                      <label className={lab}>Where
                        <select className={input} value={roomId} onChange={e => { setRoomId(e.target.value); setAgreed(false) }}>
                          <option value="">Shared areas only</option>
                          {prop.rooms.map(r => <option key={r.id} value={r.id}>{r.name}{r.occupied ? ' (occupied)' : ' (empty)'}</option>)}
                        </select>
                      </label>
                    )}
                    {room?.occupied && (
                      <div className="rounded-lg bg-neutral-100 px-md py-sm text-xs text-neutral-700 space-y-xs">
                        <p>The tenant in {room.name} is owed 24 hours’ notice before anyone goes into their room. They’ll get their own message.</p>
                        <label className="flex items-start gap-xs font-semibold"><input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="mt-0.5" /> The tenant has agreed to this visit (needed for less than 24 hours’ notice)</label>
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-sm">
                      <label className={`${lab} col-span-3 sm:col-span-1`}>Day<input type="date" className={input} value={date} min={londonToday()} onChange={e => setDate(e.target.value)} /></label>
                      <label className={lab}>From<input type="time" step={900} className={input} value={from} onChange={e => setFrom(e.target.value)} /></label>
                      <label className={lab}>To<input type="time" step={900} className={input} value={to} onChange={e => setTo(e.target.value)} /></label>
                    </div>
                    <label className={lab}>Why are you visiting? <span className="font-normal text-neutral-500">(the tenants will see this)</span>
                      <input className={input} value={reason} maxLength={200} onChange={e => setReason(e.target.value)} placeholder={canRoom ? 'e.g. to take photos of the room' : 'e.g. to check the guttering at the back'} />
                    </label>
                    {error && <p className="rounded-lg bg-red-50 px-md py-sm text-sm text-red-700">{error}</p>}
                    <div className="flex gap-sm">
                      <button type="button" onClick={send} disabled={busy || !propertyId || reason.trim().length < 3} className="flex-1 rounded-xl bg-neutral-900 px-md py-sm text-sm font-bold text-white disabled:opacity-40">{busy ? 'Telling the tenants…' : 'Tell the tenants'}</button>
                      <button type="button" onClick={close} className="rounded-xl border border-neutral-300 px-md py-sm text-sm font-semibold">Cancel</button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-md">
                <h2 className="text-lg font-bold">✓ {done.noTenants ? 'No one lives there at the moment' : `${done.told} tenant${done.told === 1 ? '' : 's'} told`}</h2>
                <p className="text-sm text-neutral-600">{done.property}{done.room ? ` · ${done.room}` : ''} · {done.when}</p>
                {done.keySafe ? (
                  <div className="rounded-2xl bg-neutral-900 p-lg text-white">
                    <p className="text-xs font-bold uppercase tracking-wide text-white/60">Key safe code</p>
                    <p className="text-3xl font-bold tracking-widest">{done.keySafe}</p>
                    <p className="mt-xs text-xs text-white/70">Opens the front door only.</p>
                  </div>
                ) : <p className="rounded-xl bg-neutral-100 px-md py-sm text-sm text-neutral-700">There’s no key safe code saved for this property — call the office if you need to get in.</p>}
                <p className="rounded-xl border border-amber-300 bg-amber-50 px-md py-sm text-sm font-semibold text-amber-900">{done.reminder}</p>
                <button type="button" onClick={close} className="w-full rounded-xl bg-neutral-900 px-md py-sm text-sm font-bold text-white">Done</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
