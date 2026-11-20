'use client'

// Contractor asks the office to price work they've discussed (Nov 2026). Works with or without open jobs.
// The house comes from the system (their past houses, or a postcode search) or is typed in when it isn't on the system.
import { useEffect, useState } from 'react'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import { adminFetch } from '@/lib/adminFetch'
import { TidyBox } from '@/components/SupplierInvoices'

type House = { id: string; name: string | null; address: string | null; postcode: string | null }
type Req = { id: string; work: string; status: string; created_at: string; unlisted_address: string | null; postcode: string | null; properties: { name: string | null; address: string | null } | null }

const STATUS: Record<string, { label: string; cls: string }> = {
  awaiting_office: { label: 'With the office', cls: 'bg-amber-100 text-amber-900' },
  approved: { label: 'Prices being asked', cls: 'bg-green-100 text-green-800' },
  declined: { label: 'Not going ahead', cls: 'bg-neutral-200 text-neutral-700' },
  withdrawn: { label: 'Withdrawn', cls: 'bg-neutral-200 text-neutral-700' },
}

// the postcode is shown once: not added again when the address already ends with it
const addrLine = (a?: string | null, p?: string | null) => (a && p && a.replace(/\s+/g, '').toUpperCase().includes(p.replace(/\s+/g, '').toUpperCase()) ? a : [a, p].filter(Boolean).join(', '))
const field = 'w-full rounded-xl border border-neutral-300 bg-white px-md py-3 text-base text-neutral-900 placeholder:text-neutral-400 focus:border-[#17332B] focus:outline-none'

export default function ContractorQuoteRequest() {
  const [myHouses, setMyHouses] = useState<House[]>([])
  const [requests, setRequests] = useState<Req[]>([])
  const [loading, setLoading] = useState(true)
  const [postcode, setPostcode] = useState('')
  const [found, setFound] = useState<House[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [chosen, setChosen] = useState<House | null>(null)
  const [typing, setTyping] = useState(false)
  const [address, setAddress] = useState('')
  const [pc, setPc] = useState('')
  const [work, setWork] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  const load = async () => {
    try {
      const r = await adminFetch('/api/contractor/quote-requests')
      if (r.status === 401) { window.location.href = '/login'; return }
      const d = await r.json()
      setMyHouses(d.houses ?? [])
      setRequests(d.requests ?? [])
    } catch { setError('We couldn’t load your houses. Check your connection and try again.') }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  // postcode search: runs once there are enough characters, so typing doesn't fire a request for each letter
  useEffect(() => {
    const clean = postcode.replace(/\s+/g, '')
    if (clean.length < 3) { setFound(null); return }
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const r = await adminFetch(`/api/contractor/quote-requests?postcode=${encodeURIComponent(clean)}`)
        const d = await r.json()
        setFound(d.houses ?? [])
      } catch { setFound([]) }
      setSearching(false)
    }, 350)
    return () => clearTimeout(t)
  }, [postcode])

  const canSend = !!(chosen || (typing && address.trim().length >= 5)) && work.trim().length >= 5 && !busy

  async function send() {
    setError(''); setBusy(true)
    const body = chosen
      ? { propertyId: chosen.id, work: work.trim(), reason: reason.trim() || undefined }
      : { unlisted: { address: address.trim(), postcode: pc.trim() || undefined }, work: work.trim(), reason: reason.trim() || undefined }
    try {
      const r = await adminFetch('/api/contractor/quote-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error || 'That didn’t send. Please try again.'); setBusy(false); return }
      setSent(true)
      load()
    } catch {
      setError('That didn’t send. Check your connection and try again. Nothing has been sent twice.')
    }
    setBusy(false)
  }

  if (sent) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar left={<BackButton href="/contractor?tab=quotes" label="Quotes" />} />
        <main className="mx-auto max-w-xl px-lg py-xl">
          <div className="rounded-2xl bg-white p-xl shadow-sm">
            <h1 className="text-2xl font-bold text-neutral-900">Quote raised</h1>
            <p className="mt-sm text-neutral-600">The office has your request. They’ll approve it, then ask for prices, or get in touch if they need more detail.</p>
            <div className="mt-lg flex flex-col gap-sm">
              <button type="button" onClick={() => { setSent(false); setChosen(null); setTyping(false); setAddress(''); setPc(''); setWork(''); setReason(''); setPostcode(''); setFound(null) }} className="rounded-full border border-neutral-300 px-lg py-3 text-sm font-semibold text-neutral-800">Raise another</button>
              <a href="/contractor?tab=quotes" className="rounded-full bg-[#17332B] px-lg py-3 text-center text-sm font-bold text-white">Back to quotes</a>
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/contractor?tab=quotes" label="Quotes" />} />
      <main className="mx-auto max-w-xl px-lg py-lg">
        <h1 className="text-2xl font-bold text-neutral-900">Raise a quote</h1>
        <p className="mt-xs text-sm text-neutral-600">Discussed work on the phone, or spotted something on site? Raise a quote and the office will get it priced. You don’t need an open job.</p>

        <section className="mt-lg rounded-2xl bg-white p-lg shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wide text-neutral-500">Which house?</h2>

          {chosen ? (
            <div className="mt-md flex items-center justify-between gap-md rounded-xl bg-green-50 px-md py-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-neutral-900">{chosen.name || chosen.address}</p>
                <p className="truncate text-sm text-neutral-600">{addrLine(chosen.address, chosen.postcode)}</p>
              </div>
              <button type="button" onClick={() => setChosen(null)} className="shrink-0 text-sm font-semibold text-neutral-700 underline">Change</button>
            </div>
          ) : (
            <>
              {!loading && myHouses.length > 0 && (
                <div className="mt-md">
                  <p className="text-xs text-neutral-500">Houses you’ve worked at</p>
                  <div className="mt-xs flex flex-col gap-xs">
                    {myHouses.map(h => (
                      <button key={h.id} type="button" onClick={() => setChosen(h)} className="rounded-xl border border-neutral-200 px-md py-3 text-left">
                        <span className="block font-semibold text-neutral-900">{h.name || h.address}</span>
                        <span className="block text-sm text-neutral-600">{addrLine(h.address, h.postcode)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-md">
                <label htmlFor="pc" className="text-xs text-neutral-500">Or search by postcode</label>
                <input id="pc" value={postcode} onChange={e => setPostcode(e.target.value)} placeholder="e.g. E14 0DX" autoComplete="off" className={`${field} mt-xs`} />
                {searching && <p className="mt-xs text-xs text-neutral-500">Searching…</p>}
                {found && found.length === 0 && !searching && <p className="mt-xs text-xs text-neutral-500">No houses on the system with that postcode. Enter the address below.</p>}
                {found && found.length > 0 && (
                  <div className="mt-xs flex flex-col gap-xs">
                    {found.map(h => (
                      <button key={h.id} type="button" onClick={() => setChosen(h)} className="rounded-xl border border-neutral-200 px-md py-3 text-left">
                        <span className="block font-semibold text-neutral-900">{h.name || h.address}</span>
                        <span className="block text-sm text-neutral-600">{addrLine(h.address, h.postcode)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-md">
                {!typing ? (
                  <button type="button" onClick={() => setTyping(true)} className="text-sm font-semibold text-neutral-800 underline">Not on the system? Enter the address</button>
                ) : (
                  <div className="space-y-sm">
                    <p className="text-xs text-neutral-500">Type it in. The office will add it to the system when they approve the request.</p>
                    <input value={address} onChange={e => setAddress(e.target.value)} placeholder="House number, street, town" className={field} />
                    <input value={pc} onChange={e => setPc(e.target.value)} placeholder="Postcode (if you know it)" className={field} />
                  </div>
                )}
              </div>
            </>
          )}
        </section>

        <section className="mt-md rounded-2xl bg-white p-lg shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wide text-neutral-500">What’s the work?</h2>
          <div className="mt-md"><TidyBox kind="quote" value={work} onChange={setWork} placeholder="e.g. Replace the back door lock and check the frame" /></div>
          <label htmlFor="why" className="mt-md block text-xs text-neutral-500">Why it came up (optional)</label>
          <input id="why" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Spotted on the last visit, or raised by the tenant on the phone" className={`${field} mt-xs`} />
        </section>

        {error && <p role="alert" className="mt-md rounded-xl bg-red-50 px-md py-3 text-sm text-red-800">{error}</p>}

        <button type="button" disabled={!canSend} onClick={send} className="mt-lg w-full rounded-full bg-[#17332B] px-lg py-4 text-base font-bold text-white disabled:opacity-40">
          {busy ? 'Sending…' : 'Send to the office'}
        </button>
        {!canSend && !busy && <p className="mt-xs text-center text-xs text-neutral-500">Choose a house and describe the work to send.</p>}

        {requests.length > 0 && (
          <section className="mt-xl">
            <h2 className="text-sm font-bold uppercase tracking-wide text-neutral-500">Your requests</h2>
            <div className="mt-sm space-y-sm">
              {requests.map(r => {
                const st = STATUS[r.status] ?? { label: r.status, cls: 'bg-neutral-200 text-neutral-700' }
                const where = r.properties ? (r.properties.name || r.properties.address) : [r.unlisted_address, r.postcode].filter(Boolean).join(', ')
                return (
                  <div key={r.id} className="rounded-2xl bg-white p-md shadow-sm">
                    <div className="flex items-start justify-between gap-sm">
                      <p className="font-semibold text-neutral-900">{where}</p>
                      <span className={`shrink-0 rounded-full px-sm py-xs text-xs font-bold ${st.cls}`}>{st.label}</span>
                    </div>
                    <p className="mt-xs line-clamp-2 text-sm text-neutral-600">{r.work}</p>
                  </div>
                )
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
