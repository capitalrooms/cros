'use client'

import NameInput, { emptyName, toLegalName, type NameValue } from '@/app/components/NameInput'
import { useState, useEffect, useRef } from 'react'
import HoldingDepositModal from '@/components/HoldingDepositModal'
import AddLetOnlyModal from '@/app/components/AddLetOnlyModal'
import InviteApplicant from '@/components/InviteApplicant'

interface RecentOffer {
  id: string
  applicantId: string | null
  name: string
  room: string
  property: string
  sentAt: string
  state: 'sent' | 'completed' | 'claimed' | 'paid'
}

const OFFER_STATE: Record<RecentOffer['state'], { label: string; cls: string }> = {
  sent:      { label: 'Offer sent — waiting for their application', cls: 'bg-neutral-700 text-neutral-200' },
  completed: { label: 'Offer completed',                             cls: 'bg-blue-500/20 text-blue-200' },
  claimed:   { label: 'Offer completed · they say deposit paid — check bank', cls: 'bg-amber-500/20 text-amber-200' },
  paid:      { label: 'Offer completed · holding deposit paid',     cls: 'bg-green-500/20 text-green-300' },
}

interface Room {
  id: string
  name: string
  property_id: string
  current_asking_rent?: number | null
  property_name?: string
  property_address?: string
  whole?: boolean
}

export default function SendOfferForm() {
  const [rooms,           setRooms]           = useState<Room[]>([])
  const [query,           setQuery]           = useState('')
  const [showDropdown,    setShowDropdown]    = useState(false)
  const [selectedRoom,    setSelectedRoom]    = useState<Room | null>(null)
  // A property CROS doesn't have is added as a let-only room first (12 Oct 2026): the application link has to name a
  // real room — offers typed in by hand used to send a link the applicant couldn't open
  const [addingLetOnly,   setAddingLetOnly]   = useState(false)
  const [applicantEmail,  setApplicantEmail]  = useState('')
  const [applicantName,   setApplicantName]   = useState('')
  const [applicantPhone,  setApplicantPhone]  = useState('')
  const [applicantNm,     setApplicantNm]     = useState<NameValue>(emptyName())
  const [advertisedRent,  setAdvertisedRent]  = useState('')
  const [moveInDate,      setMoveInDate]      = useState('')
  const [requestDeposit,  setRequestDeposit]  = useState(false)
  const [sending,         setSending]         = useState(false)
  const [error,           setError]           = useState('')
  const [success,         setSuccess]         = useState('')

  const [recent,          setRecent]          = useState<RecentOffer[]>([])
  const [depositFor,      setDepositFor]      = useState<string | null>(null)

  const wrapperRef = useRef<HTMLDivElement>(null)

  async function loadRecent() {
    const res = await fetch('/api/lettings/holding-deposit').catch(() => null)
    const d = await res?.json().catch(() => null)
    if (res?.ok && d?.offers) setRecent(d.offers)
  }
  useEffect(() => { loadRecent() }, [])

  // from the server (/api/lettings/invite-to-apply GET): addresses on one line, and whether each is a whole home
  async function loadRooms(): Promise<Room[]> {
    const res = await fetch('/api/lettings/invite-to-apply').catch(() => null)
    const d = await res?.json().catch(() => null)
    if (!res?.ok || !d?.rooms) return rooms
    const props = new Map<string, any>((d.properties ?? []).map((p: any) => [p.id, p]))
    const list = (d.rooms as any[]).filter(r => props.has(r.property_id)).map(r => {
      const p = props.get(r.property_id)
      const name = p.name || p.address || ''
      return {
        id:               r.id,
        name:             p.whole ? 'Whole property' : r.name,
        property_id:      r.property_id,
        current_asking_rent: r.current_asking_rent,
        property_name:    name,
        // only when it says more than the name (most properties are named by their address)
        property_address: p.address && p.address !== name ? p.address : '',
        whole:            !!p.whole,
      }
    })
    setRooms(list)
    return list
  }
  useEffect(() => { loadRooms() }, [])

  // the let-only room just added: pick it (the first room under that property)
  async function letOnlyAdded(property: any) {
    setAddingLetOnly(false)
    const list = await loadRooms()
    const room = list.filter(r => r.property_id === property?.id).sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }))[0]
    if (room) pickRoom(room)
  }

  // Close dropdown on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  // Filtered suggestions
  const q = query.toLowerCase().trim()
  const suggestions = q.length < 1 ? [] : rooms.filter(r =>
    r.name.toLowerCase().includes(q) ||
    (r.property_name || '').toLowerCase().includes(q) ||
    (r.property_address || '').toLowerCase().includes(q)
  ).slice(0, 8)

  function pickRoom(room: Room) {
    setSelectedRoom(room)
    setQuery(`${room.name} — ${room.property_name}`)
    setShowDropdown(false)
    if (room.current_asking_rent) setAdvertisedRent(String(room.current_asking_rent))
  }

  function clearSelection() {
    setSelectedRoom(null)
    setQuery('')
    setAdvertisedRent('')
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setSuccess('')

    if (!applicantEmail || !advertisedRent) {
      setError('Please enter applicant email and rent amount')
      return
    }
    if (!selectedRoom) {
      setError('Pick the room. If the property isn’t in CROS yet, add it as a let-only room first.')
      return
    }

    setSending(true)
    try {
      const payload = {
            roomId:         selectedRoom.id,
            propertyId:     selectedRoom.property_id,
            applicantEmail,
            applicantName, salutation: applicantNm.salutation, firstName: applicantNm.first_name.trim(), lastName: applicantNm.last_name.trim(),
            advertisedRent:  parseFloat(advertisedRent),
            moveInDate:      moveInDate || null,
            requestDeposit,
          }

      const res = await fetch('/api/lettings/send-offer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = await res.json()
      if (!res.ok) { setError(result.error || 'Failed to send offer'); setSending(false); return }

      setSuccess(`✓ Offer sent to ${applicantEmail} — it shows below and updates when they apply and pay`)
      loadRecent()
      clearSelection()
      setApplicantEmail(''); setApplicantName(''); setApplicantNm(emptyName())
      setAdvertisedRent(''); setMoveInDate('')
      setRequestDeposit(false)
    } catch {
      setError('An error occurred. Please try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="bg-neutral-900 rounded-2xl p-xl border-2 border-neutral-950 text-white">
      <h2 className="text-2xl font-bold text-white mb-xs">📧 Send Offer Letter</h2>
      <p className="text-sm text-white/60 mb-lg">Send a personalised application link to an applicant</p>

      {error   && <div className="mb-lg p-md rounded-lg bg-red-100  border border-red-300  text-red-900  text-sm">{error}</div>}
      {success && <div className="mb-lg p-md rounded-lg bg-green-100 border border-green-300 text-green-900 text-sm">{success}</div>}

      <form onSubmit={e => e.preventDefault()} className="space-y-md">

        {/* ── Property / Room search ── */}
        <div>
          <label className="block text-sm font-medium text-white mb-xs">
            Property / Room <span className="text-red-400">*</span>
          </label>

          <div ref={wrapperRef} className="relative">
              <input
                type="text"
                value={query}
                onChange={e => { setQuery(e.target.value); setSelectedRoom(null); setShowDropdown(true) }}
                onFocus={() => { if (query.length > 0) setShowDropdown(true) }}
                placeholder="Type a room or address to search…"
                className="w-full px-md py-sm rounded-xl border border-neutral-600 bg-neutral-800 text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              {/* Clear button */}
              {query && (
                <button type="button" onClick={clearSelection}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white text-lg leading-none">
                  ✕
                </button>
              )}

              {/* Dropdown */}
              {showDropdown && query.length > 0 && (
                <div className="absolute z-30 mt-1 w-full bg-neutral-800 border border-neutral-600 rounded-xl shadow-xl overflow-hidden">
                  {suggestions.length > 0 ? (
                    suggestions.map(r => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => pickRoom(r)}
                        className="w-full text-left px-md py-sm hover:bg-neutral-700 transition-colors border-b border-neutral-700 last:border-0"
                      >
                        <p className="text-sm font-semibold text-white">{r.name}</p>
                        <p className="text-xs text-neutral-400">{r.property_name}{r.property_address ? ` · ${r.property_address}` : ''}</p>
                        {r.current_asking_rent && (
                          <p className="text-xs text-green-400 mt-0.5">£{r.current_asking_rent.toLocaleString()}/mo</p>
                        )}
                      </button>
                    ))
                  ) : (
                    <div className="px-md py-sm">
                      <p className="text-sm text-neutral-400 mb-sm">No rooms matched "{query}"</p>
                      <button
                        type="button"
                        onClick={() => { setShowDropdown(false); setAddingLetOnly(true) }}
                        className="text-sm text-blue-400 hover:text-blue-300 font-semibold"
                      >
                        ＋ Not in CROS? Add it as a let-only room →
                      </button>
                    </div>
                  )}
                </div>
              )}
          </div>
          {!selectedRoom && (
            <button type="button" onClick={() => setAddingLetOnly(true)} className="mt-xs text-xs text-neutral-400 hover:text-white underline">
              Property not in CROS? Add it as a let-only room
            </button>
          )}

          {/* Selected room confirmation */}
          {selectedRoom && (
            <div className="mt-sm bg-neutral-800 px-md py-sm rounded-xl border border-neutral-700 text-sm">
              <span className="text-white font-semibold">{selectedRoom.name}</span>
              <span className="text-neutral-400 ml-xs">· {selectedRoom.property_name}</span>
              {selectedRoom.property_address && <span className="text-neutral-500 ml-xs">· {selectedRoom.property_address}</span>}
            </div>
          )}
        </div>

        {/* Applicant details */}
        <div className="grid grid-cols-2 gap-sm">
          <div>
            <label className="block text-sm font-medium text-white mb-xs">Applicant name</label>
            <NameInput value={applicantNm} required titleRequired
              onChange={n => { setApplicantNm(n); setApplicantName(toLegalName(n)) }}
              inputClass="w-full px-md py-sm rounded-xl border border-neutral-600 bg-neutral-800 text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" labelClass="block text-xs font-semibold text-neutral-400 mb-1" />
          </div>
          <div>
            <label className="block text-sm font-medium text-white mb-xs">Email <span className="text-red-400">*</span></label>
            <input
              type="email"
              value={applicantEmail}
              onChange={e => setApplicantEmail(e.target.value)}
              placeholder="applicant@email.com"
              required
              className="w-full px-md py-sm rounded-xl border border-neutral-600 bg-neutral-800 text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-white mb-xs">Mobile <span className="text-neutral-400 font-normal">(to text them too)</span></label>
          <input type="tel" value={applicantPhone} onChange={e => setApplicantPhone(e.target.value)} placeholder="07…"
            className="w-full px-md py-sm rounded-xl border border-neutral-600 bg-neutral-800 text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
        </div>

        {/* What to send, the rent and the exact email — the one panel Invite to apply and Applicants use (23 Oct 2026:
            this form sent its own "search is over" email whose button opened the application form, so people paid by
            transfer and never reached the "I've paid" button) */}
        <div className="rounded-xl bg-white p-md text-neutral-900">
          {selectedRoom && applicantEmail.includes('@') && applicantNm.first_name.trim()
            ? <InviteApplicant key={`${selectedRoom.id}|${applicantEmail}|${applicantPhone}|${applicantNm.first_name}|${applicantNm.last_name}`}
                target={{ manual: { name: applicantName, salutation: applicantNm.salutation, first_name: applicantNm.first_name.trim(), last_name: applicantNm.last_name.trim(), email: applicantEmail.trim(), phone: applicantPhone.trim(), room_id: selectedRoom.id, property_id: selectedRoom.property_id } }}
                onSent={() => loadRecent()} />
            : <p className="text-sm text-neutral-500">Pick the room and enter their name and email to choose what to send and see the email.</p>}
        </div>
      </form>

      {/* Recent offers and where each has got to */}
      {recent.length > 0 && (
        <div className="mt-xl">
          <h3 className="text-sm font-bold text-white/80 uppercase tracking-wide mb-sm">Recent offers</h3>
          <div className="space-y-xs">
            {recent.map(o => (
              <div key={o.id} className="flex flex-wrap items-center gap-sm rounded-xl bg-neutral-800 border border-neutral-700 px-md py-sm">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white truncate">{o.name}</p>
                  <p className="text-xs text-neutral-400 truncate">{[o.room, o.property].filter(Boolean).join(' · ')} · sent {new Date(o.sentAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}</p>
                </div>
                <span className={`rounded-full px-sm py-0.5 text-xs font-semibold ${OFFER_STATE[o.state].cls}`}>{OFFER_STATE[o.state].label}</span>
                {o.state !== 'paid' && o.applicantId && (
                  <button type="button" onClick={() => setDepositFor(o.applicantId)}
                    className="rounded-lg bg-green-600 hover:bg-green-700 px-sm py-xs text-xs font-bold text-white">
                    💷 Holding deposit received
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {addingLetOnly && <AddLetOnlyModal onClose={() => setAddingLetOnly(false)} onSave={letOnlyAdded} />}

      {depositFor && (
        <HoldingDepositModal
          applicantId={depositFor}
          onClose={() => setDepositFor(null)}
          onDone={summary => { setDepositFor(null); setSuccess(summary); loadRecent() }}
        />
      )}
    </div>
  )
}
