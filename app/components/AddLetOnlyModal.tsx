'use client'

/**
 * AddLetOnlyModal
 *
 * Lightweight form for adding a let-only listing (landlord-marketed property).
 * Creates one let_only_listing + one or more let_only_rooms in a single submit.
 *
 * - Postcode → address lookup via PostcodeAddressLookup component
 * - Landlord search: type to search existing people (role=landlord), or enter new details
 * - At least one room: name, rent, available date, en-suite/shared bathroom/lounge (3-state)
 * - "+ Add another room" row for multi-room listings
 */

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import PostcodeAddressLookup, { ParsedAddress } from './PostcodeAddressLookup'
import { displayName } from '@/lib/people'

interface RoomDraft {
  room_name: string
  monthly_rent: string
  floor_area_sqm: string
  available_date: string
  has_ensuite: boolean | null
  has_shared_bathroom: boolean | null
  has_lounge: boolean | null
  description: string
}

interface LandlordSuggestion {
  id: string
  first_name: string | null
  last_name: string | null
  full_name: string | null
  email: string | null
  phone: string | null
}

interface Props {
  onClose: () => void
  onSave: (listing: any) => void
  createdByPersonId?: string
}

const emptyRoom = (): RoomDraft => ({
  room_name: 'Room 1',
  monthly_rent: '',
  floor_area_sqm: '',
  available_date: '',
  has_ensuite: null,
  has_shared_bathroom: null,
  has_lounge: null,
  description: '',
})

/** Toggle a 3-state boolean: null → true → false → null */
function triToggle(current: boolean | null): boolean | null {
  if (current === null) return true
  if (current === true) return false
  return null
}

function ThreeStateButton({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean | null
  onChange: (v: boolean | null) => void
}) {
  const state = value === true ? 'yes' : value === false ? 'no' : 'unknown'
  const colors = {
    yes: 'bg-emerald-100 border-emerald-400 text-emerald-800',
    no: 'bg-neutral-100 border-neutral-400 text-neutral-600',
    unknown: 'border-dashed border-neutral-300 text-neutral-400',
  }
  const labels = { yes: `✓ ${label}`, no: `✗ ${label}`, unknown: `? ${label}` }
  return (
    <button
      type="button"
      onClick={() => onChange(triToggle(value))}
      title="Tap to cycle: unknown → yes → no → unknown"
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${colors[state]}`}
    >
      {labels[state]}
    </button>
  )
}

export default function AddLetOnlyModal({ onClose, onSave, createdByPersonId }: Props) {
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Address
  const [address, setAddress] = useState('')
  const [postcode, setPostcode] = useState('')

  // Landlord — existing person lookup
  const [landlordQuery, setLandlordQuery] = useState('')
  const [landlordSuggestions, setLandlordSuggestions] = useState<LandlordSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedLandlordId, setSelectedLandlordId] = useState<string | null>(null)
  const landlordDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Landlord contact fields (used whether picked from DB or entered fresh)
  const [landlordName, setLandlordName] = useState('')
  const [landlordPhone, setLandlordPhone] = useState('')
  const [landlordEmail, setLandlordEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [hasWashingMachine, setHasWashingMachine] = useState<boolean | null>(null)
  const [hasTumbleDryer, setHasTumbleDryer] = useState<boolean | null>(null)

  const [rooms, setRooms] = useState<RoomDraft[]>([emptyRoom()])

  // ── Landlord autocomplete ──────────────────────────────────────────────────

  useEffect(() => {
    if (landlordDebounce.current) clearTimeout(landlordDebounce.current)
    const q = landlordQuery.trim()
    if (q.length < 2) {
      setLandlordSuggestions([])
      return
    }
    landlordDebounce.current = setTimeout(async () => {
      const { data } = await supabase
        .from('people')
        .select('id, first_name, last_name, full_name, email, phone')
        .eq('role', 'landlord')
        .or(`full_name.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`)
        .limit(6)
      setLandlordSuggestions(data || [])
      setShowSuggestions(true)
    }, 250)
  }, [landlordQuery])

  function pickLandlord(l: LandlordSuggestion) {
    setSelectedLandlordId(l.id)
    const name = displayName(l) || l.full_name || ''
    setLandlordName(name)
    setLandlordQuery(name)
    setLandlordPhone(l.phone || '')
    setLandlordEmail(l.email || '')
    setLandlordSuggestions([])
    setShowSuggestions(false)
  }

  function clearLandlord() {
    setSelectedLandlordId(null)
    setLandlordQuery('')
    setLandlordName('')
    setLandlordPhone('')
    setLandlordEmail('')
  }

  // ── Address lookup callback ────────────────────────────────────────────────

  function handleAddressPicked(parsed: ParsedAddress) {
    setAddress(parsed.line1 || parsed.full)
    setPostcode(parsed.postcode)
  }

  // ── Room helpers ───────────────────────────────────────────────────────────

  function updateRoom(index: number, patch: Partial<RoomDraft>) {
    setRooms(prev => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  function addRoom() {
    setRooms(prev => [...prev, { ...emptyRoom(), room_name: `Room ${prev.length + 1}` }])
  }

  function removeRoom(index: number) {
    if (rooms.length === 1) return
    setRooms(prev => prev.filter((_, i) => i !== index))
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!address.trim()) { setError('Address is required'); return }
    if (rooms.some(r => !r.room_name.trim())) { setError('Each room must have a name'); return }
    setSaving(true)
    setError(null)

    const { data: listing, error: listingErr } = await supabase
      .from('let_only_listings')
      .insert({
        address: address.trim(),
        postcode: postcode.trim() || null,
        landlord_name: landlordName.trim() || null,
        landlord_phone: landlordPhone.trim() || null,
        landlord_email: landlordEmail.trim() || null,
        landlord_person_id: selectedLandlordId || null,
        notes: notes.trim() || null,
        has_washing_machine: hasWashingMachine,
        has_tumble_dryer: hasTumbleDryer,
        is_active: true,
        created_by: createdByPersonId || null,
      })
      .select()
      .single()

    if (listingErr || !listing) {
      // landlord_person_id column may not exist yet — retry without it
      const { data: listing2, error: listingErr2 } = await supabase
        .from('let_only_listings')
        .insert({
          address: address.trim(),
          postcode: postcode.trim() || null,
          landlord_name: landlordName.trim() || null,
          landlord_phone: landlordPhone.trim() || null,
          landlord_email: landlordEmail.trim() || null,
          notes: notes.trim() || null,
          has_washing_machine: hasWashingMachine,
          has_tumble_dryer: hasTumbleDryer,
          is_active: true,
          created_by: createdByPersonId || null,
        })
        .select()
        .single()
      if (listingErr2 || !listing2) {
        setError(listingErr2?.message || listingErr?.message || 'Failed to create listing')
        setSaving(false)
        return
      }
      return finishSave(listing2)
    }
    finishSave(listing)
  }

  async function finishSave(listing: any) {
    const roomRows = rooms.map(r => ({
      listing_id: listing.id,
      room_name: r.room_name.trim(),
      monthly_rent: r.monthly_rent ? parseFloat(r.monthly_rent) : null,
      floor_area_sqm: r.floor_area_sqm ? parseFloat(r.floor_area_sqm) : null,
      available_date: r.available_date || null,
      has_ensuite: r.has_ensuite,
      has_shared_bathroom: r.has_shared_bathroom,
      has_lounge: r.has_lounge,
      description: r.description.trim() || null,
      status: 'available',
    }))

    const { error: roomsErr } = await supabase.from('let_only_rooms').insert(roomRows)
    if (roomsErr) {
      setError(roomsErr.message)
      await supabase.from('let_only_listings').delete().eq('id', listing.id)
      setSaving(false)
      return
    }
    onSave(listing)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-lg">
      <div className="w-full max-w-lg rounded-t-2xl sm:rounded-2xl bg-white overflow-y-auto max-h-[92dvh] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-lg pt-lg pb-md border-b border-neutral-200 sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-lg font-bold text-neutral-900">Add let-only room</h2>
            <p className="text-xs text-neutral-500 mt-0.5">Landlord-marketed property not managed by Capital Rooms</p>
          </div>
          <button onClick={onClose} className="rounded-xl p-sm text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 transition-colors">✕</button>
        </div>

        <div className="px-lg py-lg space-y-lg">

          {/* ── Property address ── */}
          <section>
            <h3 className="text-sm font-semibold text-neutral-700 mb-md">Property details</h3>
            <PostcodeAddressLookup
              label="Address"
              placeholder="Type postcode to look up…"
              onSelectParsed={handleAddressPicked}
              onSelect={setAddress}
              initialValue={address}
            />
            {/* Manual fallback if address not filled by lookup */}
            {address && (
              <div className="mt-sm space-y-sm">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-xs">Street address</label>
                  <input
                    type="text"
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                    className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm text-neutral-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-xs">Postcode</label>
                  <input
                    type="text"
                    value={postcode}
                    onChange={e => setPostcode(e.target.value)}
                    className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm text-neutral-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
                  />
                </div>
              </div>
            )}
            {!address && (
              <div className="mt-sm">
                <label className="block text-xs font-medium text-neutral-600 mb-xs">Or enter address manually</label>
                <input
                  type="text"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder="e.g. 45 Maple Road"
                  className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm text-neutral-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
                />
              </div>
            )}
          </section>

          {/* ── Landlord contact ── */}
          <section>
            <h3 className="text-sm font-semibold text-neutral-700 mb-md">Landlord contact</h3>
            <div className="space-y-sm">
              {/* Search existing landlords */}
              <div className="relative">
                <label className="block text-xs font-medium text-neutral-600 mb-xs">
                  Name
                  <span className="ml-1 text-neutral-400 font-normal">— search existing or type new</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={landlordQuery}
                    onChange={e => {
                      setLandlordQuery(e.target.value)
                      setLandlordName(e.target.value)
                      if (selectedLandlordId) setSelectedLandlordId(null)
                    }}
                    onFocus={() => landlordSuggestions.length > 0 && setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                    placeholder="Search landlords or enter name…"
                    className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm text-neutral-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none pr-8"
                  />
                  {selectedLandlordId && (
                    <button
                      type="button"
                      onClick={clearLandlord}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 text-xs"
                    >✕</button>
                  )}
                </div>
                {selectedLandlordId && (
                  <p className="text-xs text-emerald-600 mt-1">✓ Linked to existing landlord record</p>
                )}
                {showSuggestions && landlordSuggestions.length > 0 && (
                  <ul className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-neutral-200 rounded-xl shadow-lg overflow-hidden">
                    {landlordSuggestions.map(l => (
                      <li key={l.id}>
                        <button
                          type="button"
                          onMouseDown={() => pickLandlord(l)}
                          className="w-full text-left px-md py-sm hover:bg-amber-50 transition-colors"
                        >
                          <p className="text-sm font-medium text-neutral-900">{displayName(l) || l.full_name}</p>
                          {l.email && <p className="text-xs text-neutral-400">{l.email}</p>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="grid grid-cols-2 gap-sm">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-xs">Phone</label>
                  <input
                    type="tel"
                    value={landlordPhone}
                    onChange={e => setLandlordPhone(e.target.value)}
                    placeholder="07700 …"
                    className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm text-neutral-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-xs">Email</label>
                  <input
                    type="email"
                    value={landlordEmail}
                    onChange={e => setLandlordEmail(e.target.value)}
                    placeholder="landlord@…"
                    className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm text-neutral-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-xs">Internal notes</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Access instructions, any quirks, landlord preferences…"
                  className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm text-neutral-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none resize-none"
                />
              </div>
            </div>
          </section>

          {/* ── Appliances ── */}
          <section>
            <h3 className="text-sm font-semibold text-neutral-700 mb-md">Shared appliances</h3>
            <div className="flex flex-wrap gap-xs">
              <ThreeStateButton label="Washing machine" value={hasWashingMachine} onChange={setHasWashingMachine} />
              <ThreeStateButton label="Tumble dryer" value={hasTumbleDryer} onChange={setHasTumbleDryer} />
            </div>
          </section>

          {/* ── Rooms ── */}
          <section>
            <h3 className="text-sm font-semibold text-neutral-700 mb-md">
              {rooms.length === 1 ? 'Room details' : `Rooms (${rooms.length})`}
            </h3>
            <div className="space-y-md">
              {rooms.map((room, idx) => (
                <div key={idx} className="rounded-xl border border-neutral-200 p-md space-y-sm bg-neutral-50">
                  {rooms.length > 1 && (
                    <div className="flex items-center justify-between mb-xs">
                      <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Room {idx + 1}</span>
                      <button type="button" onClick={() => removeRoom(idx)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-sm">
                    <div>
                      <label className="block text-xs font-medium text-neutral-600 mb-xs">Room name *</label>
                      <input
                        type="text"
                        value={room.room_name}
                        onChange={e => updateRoom(idx, { room_name: e.target.value })}
                        placeholder="e.g. Double room"
                        className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm text-neutral-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-600 mb-xs">Rent (£pcm)</label>
                      <input
                        type="number"
                        value={room.monthly_rent}
                        onChange={e => updateRoom(idx, { monthly_rent: e.target.value })}
                        placeholder="e.g. 750"
                        min={0}
                        className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm text-neutral-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-xs">Floor area (m²)</label>
                    <input
                      type="number"
                      value={room.floor_area_sqm}
                      onChange={e => updateRoom(idx, { floor_area_sqm: e.target.value })}
                      placeholder="e.g. 14"
                      min={0}
                      step={0.5}
                      className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm text-neutral-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-xs">Available from</label>
                    <input
                      type="date"
                      value={room.available_date}
                      onChange={e => updateRoom(idx, { available_date: e.target.value })}
                      className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm text-neutral-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-xs">
                      Room features <span className="text-neutral-400 font-normal">(tap to cycle: unknown → yes → no)</span>
                    </label>
                    <div className="flex flex-wrap gap-xs mt-xs">
                      <ThreeStateButton label="En-suite" value={room.has_ensuite} onChange={v => updateRoom(idx, { has_ensuite: v })} />
                      <ThreeStateButton label="Shared bathroom" value={room.has_shared_bathroom} onChange={v => updateRoom(idx, { has_shared_bathroom: v })} />
                      <ThreeStateButton label="Lounge" value={room.has_lounge} onChange={v => updateRoom(idx, { has_lounge: v })} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-xs">Description (optional)</label>
                    <textarea
                      value={room.description}
                      onChange={e => updateRoom(idx, { description: e.target.value })}
                      rows={2}
                      placeholder="Additional room details for internal reference or applicants…"
                      className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm text-neutral-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none resize-none"
                    />
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={addRoom}
                className="w-full rounded-xl border border-dashed border-neutral-300 py-sm text-sm text-neutral-500 hover:border-neutral-400 hover:text-neutral-700 transition-colors"
              >
                + Add another room
              </button>
            </div>
          </section>

          {error && (
            <p className="rounded-xl bg-red-50 border border-red-200 px-md py-sm text-sm text-red-700">{error}</p>
          )}

          <div className="flex gap-sm pb-sm">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-neutral-200 py-md text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex-1 rounded-xl bg-neutral-900 py-md text-sm font-bold text-white hover:bg-neutral-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Save listing'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
