'use client'

// The marketing board (option C, 17 Oct 2026): every listing as a card — Draft, Ready, Live, Let agreed — and the
// rooms coming free that have no listing yet. A card only moves on when its checks pass (Part A of the material
// information to be Ready; somewhere for it to go to be Live); Let agreed takes it down everywhere. Tap a card for the
// editor (/lettings/listing/[roomId]). Lettings and the office. Data: /api/lettings/listings.
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'

interface Card { id: string; status: string; room_id: string | null; property_id: string; headline: string | null; rent: number | null; available_from: string | null; house: string; room: string | null; photo: string | null; channels: string[]; missing: string[] }
interface Free { room_id: string; property_id: string; room: string; house: string; status: string; available_date: string | null; rent: number | null }
const COLS = [['draft', 'Draft', 'Being written'], ['ready', 'Ready', 'Checks passed'], ['live', 'Live', 'Out there'], ['let_agreed', 'Let agreed', 'Taken down']] as const
const NEXT: Record<string, string> = { draft: 'ready', ready: 'live', live: 'let_agreed', let_agreed: 'let' }
const NEXT_LABEL: Record<string, string> = { draft: 'Mark ready', ready: 'Publish', live: 'Let agreed', let_agreed: 'Mark let' }
const gbp = (n: number | null) => n == null ? '' : `£${Number(n).toLocaleString('en-GB', { maximumFractionDigits: 0 })}`
const day = (d: string | null) => d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''

export default function MarketingBoard() {
  const router = useRouter()
  const [cards, setCards] = useState<Card[] | null>(null)
  const [free, setFree] = useState<Free[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    const r = await fetch('/api/lettings/listings')
    const d = await r.json().catch(() => ({}))
    if (d.setupNeeded) { setError('The marketing board needs migration 227 running in Supabase first.'); setCards([]); return }
    if (!r.ok) { setError(d.error || 'Could not load the board'); setCards([]); return }
    setCards(d.listings); setFree(d.toList); setError('')
  }, [])
  useEffect(() => { load() }, [load])

  async function start(f: Free) {
    setBusy(f.room_id)
    const r = await fetch('/api/lettings/listings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomId: f.room_id }) })
    setBusy('')
    if (r.ok) router.push(`/lettings/listing/${f.room_id}?from=/lettings/board`)
    else setError((await r.json().catch(() => ({}))).error || 'Could not start the listing')
  }
  async function move(c: Card, to: string) {
    setBusy(c.id); setError('')
    const r = await fetch('/api/lettings/listings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id, action: 'move', to }) })
    const d = await r.json().catch(() => ({}))
    setBusy('')
    if (!r.ok) setError(`${c.room ? `${c.room}, ` : ''}${c.house}: ${d.error || 'could not move it'}`)
    load()
  }

  return (
    <div className="min-h-screen bg-[#EDF0F4] pb-3xl">
      <AppBar left={<BackButton href="/lettings?tab=available" label="Availability" />} title="Marketing board" />
      <main className="mx-auto max-w-7xl px-lg py-md">
        <div className="mb-sm flex flex-wrap items-baseline justify-between gap-sm">
          <h1 className="text-lg font-extrabold text-neutral-900">Marketing board</h1>
          <p className="text-xs text-neutral-500">A listing is Ready once rent, deposit, council tax, a headline, description, date and a photo are in. Let agreed takes it down everywhere.</p>
        </div>
        {error && <p className="mb-sm rounded-lg border border-amber-300 bg-amber-50 px-md py-sm text-sm text-amber-900">{error}</p>}
        {cards === null ? <p className="text-sm text-neutral-500">Loading…</p> : (
          <div className="grid gap-sm md:grid-cols-5">
            {/* rooms coming free with no listing yet */}
            <section className="rounded-[10px] border border-dashed border-[#C9D1DA] bg-white/60 p-sm">
              <h2 className="mb-xs text-[11px] font-bold uppercase tracking-wide text-[#5B6470]">To list <span className="font-normal normal-case">· {free.length}</span></h2>
              <div className="space-y-xs">
                {free.length === 0 && <p className="text-xs text-neutral-500">Every free room has a listing.</p>}
                {free.map(f => (
                  <div key={f.room_id} className="rounded-lg border border-[#D6DCE3] bg-white p-sm text-xs">
                    <p className="font-semibold text-neutral-900">{f.room} · {f.house}</p>
                    <p className="text-neutral-500">{f.status === 'on_notice' ? 'Tenant leaving' : 'Empty'}{f.available_date ? ` · from ${day(f.available_date)}` : ''}{f.rent ? ` · ${gbp(f.rent)}` : ''}</p>
                    <button type="button" onClick={() => start(f)} disabled={busy === f.room_id} className="mt-1 rounded-md bg-neutral-900 px-sm py-0.5 text-[11px] font-bold text-white disabled:opacity-50">{busy === f.room_id ? 'Starting…' : 'Start listing'}</button>
                  </div>
                ))}
              </div>
            </section>
            {COLS.map(([k, t, hint]) => {
              const col = cards.filter(c => c.status === k)
              return (
                <section key={k} className="rounded-[10px] border border-[#D6DCE3] bg-[#F6F8FA] p-sm">
                  <h2 className="mb-xs text-[11px] font-bold uppercase tracking-wide text-[#5B6470]">{t} <span className="font-normal normal-case">· {col.length} · {hint}</span></h2>
                  <div className="space-y-xs">
                    {col.map(c => (
                      <article key={c.id} className="overflow-hidden rounded-lg border border-[#D6DCE3] bg-white text-xs">
                        <Link href={`/lettings/listing/${c.room_id}?from=/lettings/board`} className="block">
                          {c.photo ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={c.photo} alt="" className="aspect-[16/9] w-full object-cover" /> : <div className="flex aspect-[16/9] items-center justify-center bg-neutral-100 text-[11px] text-neutral-400">No photo</div>}
                          <div className="p-sm">
                            <p className="font-semibold text-neutral-900">{c.room ? `${c.room} · ` : ''}{c.house}</p>
                            <p className="truncate text-neutral-600">{c.headline || 'No headline yet'}</p>
                            <p className="text-neutral-500">{[gbp(c.rent), c.available_from ? `from ${day(c.available_from)}` : ''].filter(Boolean).join(' · ')}</p>
                            {k === 'draft' && c.missing.length > 0 && <p className="mt-1 text-[11px] text-amber-800">Needs: {c.missing.join(', ')}</p>}
                            {k !== 'draft' && <p className="mt-1 text-[11px] text-emerald-800">{c.channels.length ? c.channels.join(' · ') : 'Nowhere yet'}</p>}
                          </div>
                        </Link>
                        {NEXT[k] && (
                          <div className="flex border-t border-[#EDF0F3]">
                            <button type="button" onClick={() => move(c, NEXT[k])} disabled={busy === c.id} className="flex-1 py-1 text-[11px] font-bold text-neutral-900 hover:bg-neutral-50 disabled:opacity-50">{busy === c.id ? '…' : `${NEXT_LABEL[k]} →`}</button>
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
