'use client'

// Arrange works on this room (24 Oct 2026, Harry: "arrange a contractor to visit for known issue e.g. get them to
// repaint room when room is empty or send to multiple to get quotes"). One job, approved, either sent to one
// contractor to book or out for quotes to several (on the app or not) — through the same routes as Maintenance.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { adminFetch } from '@/lib/adminFetch'

type Contractor = { id: string; name: string; test: boolean }
type Window = { from: string; to: string | null; text: string } | null

// common jobs on a room, alphabetical (feedback: lists always alphabetical)
const PICKS: { title: string; category: string }[] = [
  { title: 'Deep clean the carpet', category: 'Cleanliness & Pests' },
  { title: 'Fix or replace furniture', category: 'Furniture' },
  { title: 'Repaint the room', category: 'Decoration & Finishes' },
  { title: 'Replace the carpet', category: 'Decoration & Finishes' },
  { title: 'Replace the mattress', category: 'Furniture' },
]
const errorText = async (r: Response, fallback: string) => { const d = await r.json().catch(() => ({})); return d.error || `${fallback} (error ${r.status})` }

export default function ArrangeWorks({ roomId, roomName, houseName, onClose, onDone }: { roomId: string; roomName: string; houseName: string; onClose: () => void; onDone: () => void }) {
  const [mounted, setMounted] = useState(false)
  const [contractors, setContractors] = useState<Contractor[] | null>(null)
  const [win, setWin] = useState<Window>(null)
  const [loadError, setLoadError] = useState('')

  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('Decoration & Finishes')
  const [details, setDetails] = useState('')
  const [when, setWhen] = useState<'empty' | 'asap' | 'from'>('asap')
  const [from, setFrom] = useState('')
  const [mode, setMode] = useState<'assign' | 'quotes'>('assign')
  const [one, setOne] = useState('')
  const [several, setSeveral] = useState<Set<string>>(new Set())
  const [others, setOthers] = useState<{ name: string; email: string }[]>([])
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<{ ticketId: string; text: string } | null>(null)

  useEffect(() => {
    setMounted(true)
    adminFetch(`/api/admin/maintenance/arrange?roomId=${roomId}`).then(async r => {
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setLoadError(d.error ?? 'Contractors couldn’t be loaded'); return }
      setContractors(d.contractors); setWin(d.window)
      if (d.window) setWhen('empty')   // a room that's (going to be) empty: book the works into that time
    }).catch(() => setLoadError('Contractors couldn’t be loaded — check the connection.'))
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [roomId])

  const quoteCount = several.size + others.length
  const ready = !!title.trim() && (when !== 'from' || !!from) && (mode === 'assign' ? !!one : quoteCount > 0)
  const oneName = contractors?.find(c => c.id === one)?.name

  function addOther() {
    const name = newName.trim(), email = newEmail.trim().toLowerCase()
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Add their name and a valid email.'); return }
    setOthers(o => [...o, { name, email }]); setNewName(''); setNewEmail(''); setError('')
  }

  async function send() {
    setBusy(true); setError('')
    try {
      const r = await adminFetch('/api/admin/maintenance/arrange', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, title, details, category, when, from, mode, contractorId: one }) })
      if (!r.ok) { setError(await errorText(r, 'The job wasn’t made')); return }
      const { ticketId } = await r.json()
      if (mode === 'assign') {
        const n = await adminFetch('/api/notify-job-raised', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketId }) })
        setDone({ ticketId, text: n.ok ? `Sent to ${oneName}. They’ll book a date${when === 'empty' ? ' while the room is empty' : ''}.` : `The job is with ${oneName}, but telling them didn’t work — open the job and send it again.` })
      } else {
        const q = await adminFetch('/api/admin/quotes', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticketId, contractorIds: [...several], others, message: details || null }) })
        setDone({ ticketId, text: q.ok ? `Asked ${quoteCount} contractor${quoteCount === 1 ? '' : 's'} for a price. Prices come into the job’s Quotes — accept one and it goes to them to book.` : `The job is made, but the quote requests didn’t go: ${await errorText(q, 'not sent')}. Open the job to ask again.` })
      }
      onDone()
    } finally { setBusy(false) }
  }

  if (!mounted) return null
  const input = 'block w-full rounded-lg border border-neutral-300 bg-white px-sm py-xs text-sm text-neutral-900'
  const chip = (on: boolean) => `rounded-full border px-md py-xs text-sm font-semibold ${on ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white text-neutral-800 hover:border-neutral-500'}`
  const radio = (on: boolean) => `flex cursor-pointer items-start gap-sm rounded-xl border p-md text-sm ${on ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200 bg-white'}`

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-stretch justify-center bg-black/50 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] md:items-center md:pt-0 md:pb-0 md:p-lg" role="dialog" aria-modal="true" aria-label="Arrange works">
      <div className="flex w-full flex-col overflow-hidden bg-neutral-50 shadow-2xl md:max-h-[92dvh] md:max-w-2xl md:rounded-2xl">
        <div className="flex items-start justify-between gap-md bg-[#181614] px-lg py-md text-white">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-neutral-400">Arrange works</p>
            <p className="truncate text-lg font-bold">{roomName} · {houseName}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg px-sm text-2xl leading-none text-neutral-400 hover:text-white">×</button>
        </div>

        <div className="flex-1 space-y-lg overflow-y-auto px-lg py-lg">
          {loadError && <p className="rounded-xl border border-red-200 bg-red-50 p-md text-sm font-semibold text-red-800">{loadError}</p>}
          {done ? (
            <div className="space-y-sm rounded-xl border border-green-200 bg-green-50 p-lg text-sm text-green-900">
              <p className="text-base font-bold">✓ {title}</p>
              <p>{done.text}</p>
              <p><Link href={`/admin/maintenance?ticket=${done.ticketId}`} className="font-semibold underline">Open the job in Maintenance</Link></p>
            </div>
          ) : !contractors && !loadError ? <p className="text-sm text-neutral-400">Loading…</p> : contractors && (<>
            <section className="space-y-sm">
              <h3 className="text-xs font-bold uppercase tracking-wide text-neutral-500">What needs doing</h3>
              <div className="flex flex-wrap gap-xs">
                {PICKS.map(p => <button key={p.title} type="button" onClick={() => { setTitle(p.title); setCategory(p.category) }} className={chip(title === p.title)}>{p.title}</button>)}
              </div>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Or write it, e.g. Fix the window catch" className={input} aria-label="What needs doing" />
              <textarea rows={3} value={details} onChange={e => setDetails(e.target.value)} placeholder="Anything that helps — colour, which wall, how bad it is (optional)" className={input} aria-label="Details" />
            </section>

            <section className="space-y-sm">
              <h3 className="text-xs font-bold uppercase tracking-wide text-neutral-500">When</h3>
              {win && <label className={radio(when === 'empty')}><input type="radio" checked={when === 'empty'} onChange={() => setWhen('empty')} className="mt-0.5" /><span><b>While the room is empty</b><span className="block text-neutral-600">{win.text.charAt(0).toUpperCase() + win.text.slice(1)}</span></span></label>}
              <label className={radio(when === 'asap')}><input type="radio" checked={when === 'asap'} onChange={() => setWhen('asap')} className="mt-0.5" /><span><b>As soon as possible</b>{!win && <span className="block text-neutral-600">Someone lives in {roomName}: the contractor books it with them.</span>}</span></label>
              <label className={radio(when === 'from')}><input type="radio" checked={when === 'from'} onChange={() => setWhen('from')} className="mt-0.5" /><span className="flex-1"><b>On or after a date</b>
                {when === 'from' && <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={`${input} mt-xs max-w-[200px]`} aria-label="From" />}</span></label>
            </section>

            <section className="space-y-sm">
              <h3 className="text-xs font-bold uppercase tracking-wide text-neutral-500">Who</h3>
              <div className="flex flex-wrap gap-xs">
                <button type="button" onClick={() => setMode('assign')} className={chip(mode === 'assign')}>Send to one contractor</button>
                <button type="button" onClick={() => setMode('quotes')} className={chip(mode === 'quotes')}>Get quotes from several</button>
              </div>
              {mode === 'assign' ? (
                <select value={one} onChange={e => setOne(e.target.value)} className={input} aria-label="Contractor">
                  <option value="">Choose a contractor…</option>
                  {contractors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              ) : (
                <div className="space-y-sm">
                  <ul className="max-h-56 divide-y divide-neutral-100 overflow-y-auto rounded-xl border border-neutral-200 bg-white">
                    {contractors.map(c => (
                      <li key={c.id}><label className="flex cursor-pointer items-center gap-sm px-md py-sm text-sm">
                        <input type="checkbox" checked={several.has(c.id)} onChange={() => setSeveral(s => { const n = new Set(s); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n })} className="h-4 w-4" />{c.name}
                      </label></li>
                    ))}
                  </ul>
                  {others.length > 0 && <ul className="space-y-xs text-sm">{others.map((o, i) => <li key={o.email} className="flex items-center justify-between rounded-lg bg-white px-md py-xs"><span>{o.name} · {o.email}</span><button type="button" onClick={() => setOthers(x => x.filter((_, j) => j !== i))} className="text-xs font-semibold text-neutral-500 underline">Remove</button></li>)}</ul>}
                  <div className="grid gap-xs sm:grid-cols-[1fr_1fr_auto]">
                    <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Someone not on the app: name" className={input} aria-label="Name" />
                    <input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="Their email" inputMode="email" className={input} aria-label="Email" />
                    <button type="button" onClick={addOther} className="rounded-lg border border-neutral-300 bg-white px-md py-xs text-sm font-bold">Add</button>
                  </div>
                  <p className="text-xs text-neutral-500">People on the app see it in their Quotes; anyone else gets the job sheet by email with a link to send their price. Tenants’ names and the key safe code are never on it.</p>
                </div>
              )}
            </section>
            {error && <p className="rounded-xl border border-red-200 bg-red-50 p-md text-sm font-semibold text-red-800">{error}</p>}
          </>)}
        </div>

        <div className="flex items-center justify-end gap-sm border-t border-neutral-200 bg-white px-lg py-md">
          <button onClick={onClose} className="rounded-lg border border-neutral-300 px-md py-sm text-sm font-bold">{done ? 'Close' : 'Cancel'}</button>
          {!done && <button onClick={send} disabled={!ready || busy} className="rounded-lg bg-neutral-900 px-md py-sm text-sm font-bold text-white disabled:opacity-40">
            {busy ? 'Sending…' : mode === 'assign' ? (oneName ? `Send to ${oneName.split(' · ')[0]}` : 'Send') : `Ask ${quoteCount || ''} for quotes`.replace('  ', ' ')}
          </button>}
        </div>
      </div>
    </div>,
    document.body,
  )
}
