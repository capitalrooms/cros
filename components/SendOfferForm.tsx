'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import HoldingDepositModal from '@/components/HoldingDepositModal'

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
}

export default function SendOfferForm() {
  const [rooms,           setRooms]           = useState<Room[]>([])
  const [query,           setQuery]           = useState('')
  const [showDropdown,    setShowDropdown]    = useState(false)
  const [selectedRoom,    setSelectedRoom]    = useState<Room | null>(null)
  const [customMode,      setCustomMode]      = useState(false)   // free-text for unlisted properties
  const [customRoomDesc,  setCustomRoomDesc]  = useState('')      // e.g. "Room 2, ground floor"
  const [customAddress,   setCustomAddress]   = useState('')      // e.g. "45 Bermondsey Street"
  const [applicantEmail,  setApplicantEmail]  = useState('')
  const [applicantName,   setApplicantName]   = useState('')
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

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data } = await supabase
        .from('rooms')
        .select('id, name, property_id, current_asking_rent, properties(name, address)')
        .order('name')
      setRooms(
        (data || []).map((r: any) => ({
          id:               r.id,
          name:             r.name,
          property_id:      r.property_id,
          current_asking_rent: r.current_asking_rent,
          property_name:    r.properties?.name || '',
          property_address: r.properties?.address || '',
        }))
      )
    }
    load()
  }, [])

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
    setCustomMode(false)
    if (room.current_asking_rent) setAdvertisedRent(String(room.current_asking_rent))
  }

  function clearSelection() {
    setSelectedRoom(null)
    setCustomMode(false)
    setQuery('')
    setAdvertisedRent('')
  }

  function enableCustomMode() {
    setCustomMode(true)
    setSelectedRoom(null)
    setShowDropdown(false)
    setCustomRoomDesc(query) // seed with what they typed
    setCustomAddress('')
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setSuccess('')

    if (!applicantEmail || !advertisedRent) {
      setError('Please enter applicant email and rent amount')
      return
    }
    if (!customMode && !selectedRoom) {
      setError('Please select a room or switch to custom mode')
      return
    }
    if (customMode && !customAddress.trim()) {
      setError('Please enter the property address')
      return
    }

    setSending(true)
    try {
      const payload = customMode
        ? {
            customMode:    true,
            customRoomDesc: customRoomDesc.trim() || 'Room',
            customAddress:  customAddress.trim(),
            applicantEmail,
            applicantName,
            advertisedRent:  parseFloat(advertisedRent),
            moveInDate:      moveInDate || null,
            requestDeposit,
          }
        : {
            roomId:         selectedRoom!.id,
            propertyId:     selectedRoom!.property_id,
            applicantEmail,
            applicantName,
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
      setCustomRoomDesc(''); setCustomAddress('')
      setApplicantEmail(''); setApplicantName('')
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

      <form onSubmit={handleSend} className="space-y-md">

        {/* ── Property / Room search ── */}
        <div>
          <label className="block text-sm font-medium text-white mb-xs">
            Property / Room <span className="text-red-400">*</span>
          </label>

          {!customMode ? (
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
                        onClick={enableCustomMode}
                        className="text-sm text-blue-400 hover:text-blue-300 font-semibold"
                      >
                        ＋ Enter property details manually →
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : null}

          {/* Custom / unlisted mode */}
          {customMode && (
            <div className="space-y-sm">
              <div className="flex items-center gap-sm mb-xs">
                <span className="text-xs text-amber-400 font-semibold">✏️ Unlisted property</span>
                <button type="button" onClick={() => { setCustomMode(false); setQuery('') }}
                  className="text-xs text-neutral-500 hover:text-neutral-300 underline">
                  Search rooms instead
                </button>
              </div>
              <input
                type="text"
                value={customRoomDesc}
                onChange={e => setCustomRoomDesc(e.target.value)}
                placeholder="Room description, e.g. Double room, ground floor"
                className="w-full px-md py-sm rounded-xl border border-neutral-600 bg-neutral-800 text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
              <input
                type="text"
                value={customAddress}
                onChange={e => setCustomAddress(e.target.value)}
                placeholder="Full property address *"
                required
                className="w-full px-md py-sm rounded-xl border border-neutral-600 bg-neutral-800 text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
          )}

          {/* Selected room confirmation */}
          {selectedRoom && !customMode && (
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
            <input
              type="text"
              value={applicantName}
              onChange={e => setApplicantName(e.target.value)}
              placeholder="Full name"
              className="w-full px-md py-sm rounded-xl border border-neutral-600 bg-neutral-800 text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
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

        {/* Rent + move-in */}
        <div className="grid grid-cols-2 gap-sm">
          <div>
            <label className="block text-sm font-medium text-white mb-xs">Rent (pcm) <span className="text-red-400">*</span></label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">£</span>
              <input
                type="number"
                value={advertisedRent}
                onChange={e => setAdvertisedRent(e.target.value)}
                placeholder="850"
                required
                className="w-full pl-6 pr-md py-sm rounded-xl border border-neutral-600 bg-neutral-800 text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-white mb-xs">Available from</label>
            <input
              type="date"
              value={moveInDate}
              onChange={e => setMoveInDate(e.target.value)}
              className="w-full px-md py-sm rounded-xl border border-neutral-600 bg-neutral-800 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
        </div>

        {/* Holding deposit toggle */}
        <label className="flex items-center gap-sm cursor-pointer">
          <input
            type="checkbox"
            checked={requestDeposit}
            onChange={e => setRequestDeposit(e.target.checked)}
            className="w-4 h-4 accent-blue-500"
          />
          <span className="text-sm text-white/80">Request holding deposit ("Search is over" email)</span>
        </label>

        <button
          type="submit"
          disabled={sending || (!selectedRoom && !customMode) || !applicantEmail || !advertisedRent}
          className="w-full rounded-xl bg-blue-600 py-sm text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          {sending ? 'Sending…' : '📧 Send offer letter'}
        </button>
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
                  <p className="text-xs text-neutral-400 truncate">{[o.room, o.property].filter(Boolean).join(' · ')} · sent {new Date(o.sentAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>
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
