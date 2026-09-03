'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import Link from 'next/link'
import CouncilInfoModal from './components/CouncilInfoModal'

type LetType = 'hmo' | 'single_let' | null

export default function NewPropertyPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 1: Address
  const [address, setAddress] = useState('')
  const [propertyCode, setPropertyCode] = useState('')
  const [councilTaxBand, setCouncilTaxBand] = useState('')
  const [councilLookupLoading, setCouncilLookupLoading] = useState(false)
  const [councilInfo, setCouncilInfo] = useState<any>(null)
  const [showCouncilModal, setShowCouncilModal] = useState(false)
  const [pendingCouncilInfo, setPendingCouncilInfo] = useState<any>(null)

  // Step 2: The fork
  const [letType, setLetType] = useState<LetType>(null)

  // Step 3: Landlord picker
  interface LandlordOption { id: string; first_name: string | null; last_name: string | null; full_name: string | null; company: string | null; email: string; phone: string | null }
  const [allLandlords, setAllLandlords] = useState<LandlordOption[]>([])
  const [landlordSearch, setLandlordSearch] = useState('')
  const [selectedLandlord, setSelectedLandlord] = useState<LandlordOption | null>(null)
  const [landlordMode, setLandlordMode] = useState<'search' | 'add_new'>('search')
  const [newLLFirstName, setNewLLFirstName] = useState('')
  const [newLLLastName, setNewLLLastName] = useState('')
  const [newLLEmail, setNewLLEmail] = useState('')
  const [newLLPhone, setNewLLPhone] = useState('')
  const [savingNewLL, setSavingNewLL] = useState(false)
  const [newLLError, setNewLLError] = useState<string | null>(null)
  // CC emails — joint landlords, accountants etc.
  const [ccEmails, setCcEmails] = useState('')

  // Step 4: Features
  const [hasGas, setHasGas] = useState(true)
  const [hasElectric, setHasElectric] = useState(true)
  const [furnishedStatus, setFurnishedStatus] = useState<'furnished' | 'unfurnished' | 'part-furnished'>('unfurnished')
  const [communalBathrooms, setCommunalBathrooms] = useState(1)
  const [billsIncluded, setBillsIncluded] = useState(true)

  // HMO only: rooms
  const [numRooms, setNumRooms] = useState<number | ''>('')
  const [roomTypes, setRoomTypes] = useState<string[]>([])

  function generatePropertyCode(addr: string): string {
    if (!addr.trim()) return ''
    const numberMatch = addr.match(/^(\d+)/)
    const number = numberMatch ? String(parseInt(numberMatch[1])).padStart(3, '0') : ''
    const streetPart = addr.split(',')[0]
    const words = streetPart.split(/\s+/).filter(w => !/^\d+$/.test(w))
    const letters = words.map(w => w.charAt(0).toUpperCase()).join('')
    return `${number}${letters}`.toUpperCase()
  }

  const handleAddressChange = (value: string) => {
    setAddress(value)
    setPropertyCode(generatePropertyCode(value))
    if (value.length > 10) lookupCouncilInfo(value)
  }

  const lookupCouncilInfo = async (addressValue: string) => {
    setCouncilLookupLoading(true)
    try {
      const response = await fetch('/api/lookup/council-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: addressValue })
      })
      if (response.ok) {
        const data = await response.json()
        setPendingCouncilInfo(data.data)
        setShowCouncilModal(true)
      }
    } catch (err) {
      console.error('Council lookup error:', err)
    } finally {
      setCouncilLookupLoading(false)
    }
  }

  const handleAcceptCouncilInfo = (data: any) => {
    setCouncilInfo(data)
    setShowCouncilModal(false)
    setPendingCouncilInfo(null)
  }

  const handleRejectCouncilInfo = () => {
    setCouncilInfo(null)
    setShowCouncilModal(false)
    setPendingCouncilInfo(null)
  }

  // Load existing landlords once
  useEffect(() => {
    createClient()
      .from('people')
      .select('id, first_name, last_name, full_name, company, email, phone')
      .eq('role', 'landlord')
      .order('last_name', { ascending: true })
      .then(({ data }) => setAllLandlords(data || []))
  }, [])

  const llDisplayName = (ll: LandlordOption) => {
    const personal = [ll.first_name, ll.last_name].filter(Boolean).join(' ') || ll.full_name || ''
    if (ll.company) return personal ? `${personal} (${ll.company})` : ll.company
    return personal || ll.email
  }

  const filteredLandlords = allLandlords.filter(ll => {
    const q = landlordSearch.toLowerCase()
    return !q || llDisplayName(ll).toLowerCase().includes(q) || ll.email.toLowerCase().includes(q)
  })

  async function handleCreateNewLandlord() {
    if (!newLLFirstName.trim() || !newLLEmail.trim()) {
      setNewLLError('First name and email are required.')
      return
    }
    setSavingNewLL(true)
    setNewLLError(null)
    try {
      const supabase = createClient()
      const { data: ll, error: e } = await supabase
        .from('people')
        .insert({
          first_name: newLLFirstName.trim(),
          last_name: newLLLastName.trim() || null,
          full_name: [newLLFirstName.trim(), newLLLastName.trim()].filter(Boolean).join(' '),
          email: newLLEmail.trim().toLowerCase(),
          phone: newLLPhone.trim() || null,
          role: 'landlord',
          landlord_comms_enabled: false,
        })
        .select('id, first_name, last_name, full_name, email, phone')
        .single()
      if (e) throw e
      setAllLandlords(prev => [...prev, ll])
      setSelectedLandlord(ll)
      setLandlordMode('search')
      setNewLLFirstName(''); setNewLLLastName(''); setNewLLEmail(''); setNewLLPhone('')
    } catch (err: any) {
      setNewLLError(err.message || 'Could not save landlord — try again.')
    } finally {
      setSavingNewLL(false)
    }
  }

  const handleRoomCountChange = (count: number) => {
    setNumRooms(count)
    setRoomTypes(Array(count).fill(''))
  }

  const handleRoomTypeChange = (index: number, type: string) => {
    const newTypes = [...roomTypes]
    newTypes[index] = type
    setRoomTypes(newTypes)
  }

  const getUnitCode = (roomIndex: number): string =>
    `${propertyCode}${String(roomIndex + 1).padStart(2, '0')}`

  const roomTypeOptions = [
    'Small Double Room',
    'Medium Double Room',
    'Large Double Room',
    'Small Double Ensuite',
    'Medium Double Ensuite',
    'Large Double Ensuite',
    'Single Room',
    'Bedsit',
    'Studio'
  ]

  const isComplete = letType === 'single_let'
    ? address.trim() && propertyCode && !!selectedLandlord
    : address.trim() && propertyCode && !!selectedLandlord &&
      numRooms !== '' && roomTypes.every(t => t)

  const handleCreate = async () => {
    if (!isComplete || !letType) {
      setError('Please complete all required fields')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const supabase = createClient()

      const { data: property, error: propErr } = await supabase
        .from('properties')
        .insert({
          name: address,
          address,
          property_code: propertyCode,
          property_type: letType,
          landlord_id: selectedLandlord?.id || null,
          landlord_name: selectedLandlord ? llDisplayName(selectedLandlord) : null,
          landlord_email: selectedLandlord?.email || null,
          landlord_phone: selectedLandlord?.phone || null,
          cc_emails: ccEmails.trim() || null,
          council_tax_band: councilTaxBand || councilInfo?.council_tax_band || null,
          council_name: councilInfo?.council_name || null,
          council_email: councilInfo?.council_email || null,
          council_phone: councilInfo?.council_phone || null,
          council_website: councilInfo?.council_website || null,
          bin_collection_day: councilInfo?.bin_collection_day || null,
          has_gas: hasGas,
          has_electric: hasElectric,
          furnished_status: furnishedStatus,
          bills_included: billsIncluded,
          notice_period_months: 2,
          communal_bathrooms: letType === 'hmo' ? communalBathrooms : null,
        })
        .select()
        .single()

      if (propErr) throw propErr
      if (!property) throw new Error('Failed to create property')

      // Create rooms
      const roomsToCreate = letType === 'single_let'
        ? [{ property_id: property.id, name: 'Whole Property', unit_code: `${propertyCode}01`, room_type: 'Single Let' }]
        : roomTypes.map((type, index) => ({
            property_id: property.id,
            name: `Room ${index + 1}`,
            unit_code: getUnitCode(index),
            room_type: type
          }))

      const { error: roomsErr } = await supabase.from('rooms').insert(roomsToCreate)
      if (roomsErr) throw roomsErr

      router.push(`/admin/properties/${property.id}`)
    } catch (err: any) {
      setError(err.message || 'Failed to create property')
      setLoading(false)
    }
  }

  const inputClass = "w-full px-lg py-md border border-neutral-700 rounded-lg text-sm bg-neutral-800 text-neutral-50 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
  const smallInputClass = "w-full px-md py-xs text-sm border border-neutral-700 rounded bg-neutral-800 text-neutral-50 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
  const sectionClass = "rounded-lg border border-neutral-700 bg-neutral-900 p-md"
  const labelClass = "block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm"

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin/properties" />} />

      <main className="mx-auto max-w-4xl px-md">
        <div className="pt-md mb-md">
          <h1 className="text-xl font-bold text-neutral-900">🏠 Create Property</h1>
        </div>

        {error && (
          <div className="mb-md p-sm bg-red-50 border border-red-300 rounded text-xs text-red-700 font-semibold">
            {error}
          </div>
        )}

        <div className="space-y-md">

          {/* Section 1: Address */}
          <div className={sectionClass}>
            <h2 className="text-xs font-bold text-white mb-sm uppercase tracking-wider">1️⃣ Address</h2>
            {councilInfo && (
              <div className="mb-sm rounded border border-green-600 bg-green-900/30 p-xs">
                <p className="text-xs font-semibold text-green-400">✓ {councilInfo.council_name} · Bins: {councilInfo.bin_collection_day}</p>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
              <div>
                <label className={labelClass}>Full Address *</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => handleAddressChange(e.target.value)}
                  placeholder="e.g., 451 St Davids Square, London, E14 3WQ"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Property Code (auto-generated) *</label>
                <div className="flex gap-sm items-center">
                  <input
                    type="text"
                    value={propertyCode}
                    onChange={(e) => setPropertyCode(e.target.value.toUpperCase())}
                    maxLength={10}
                    className="flex-1 px-lg py-md border border-neutral-700 rounded-lg text-sm bg-neutral-800 text-white font-mono font-bold focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <span className="text-lg">✏️</span>
                </div>
              </div>
              {/* EPC / council tax quick lookup */}
              {address.length > 10 && (() => {
                const pcMatch = address.match(/([A-Z]{1,2}[0-9]{1,2}\s?[0-9][A-Z]{2})/i)
                const pc = pcMatch ? pcMatch[1].replace(/\s/g, '').toUpperCase() : ''
                const epcUrl = pc
                  ? `https://find-energy-certificate.service.gov.uk/find-a-certificate/search-by-postcode?postcode=${pc}`
                  : 'https://find-energy-certificate.service.gov.uk'
                const voaUrl = pc
                  ? `https://www.gov.uk/council-tax-bands?postcode=${pc}`
                  : 'https://www.gov.uk/council-tax-bands'
                return (
                  <div className="md:col-span-2 rounded-xl border border-neutral-600 bg-neutral-800/60 p-md">
                    <p className="text-xs font-semibold text-neutral-300 mb-sm">
                      🔍 Quick lookups{pc ? ` for ${pc}` : ''}
                    </p>
                    <div className="flex flex-wrap gap-sm mb-sm">
                      <a
                        href={epcUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-xs rounded-lg bg-neutral-700 hover:bg-neutral-600 text-white text-xs font-semibold px-md py-xs transition-colors"
                      >
                        EPC rating &amp; expiry ↗
                      </a>
                      <a
                        href={voaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-xs rounded-lg bg-neutral-700 hover:bg-neutral-600 text-white text-xs font-semibold px-md py-xs transition-colors"
                      >
                        Council tax band ↗
                      </a>
                    </div>
                    <p className="text-xs text-neutral-500 mb-xs">Council tax band (optional — paste from lookup)</p>
                    <input
                      type="text"
                      value={councilTaxBand}
                      onChange={(e) => setCouncilTaxBand(e.target.value.toUpperCase())}
                      placeholder="A–H"
                      maxLength={1}
                      className="w-16 px-md py-xs text-sm border border-neutral-600 rounded bg-neutral-800 text-white text-center font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )
              })()}
            </div>
          </div>

          {/* Section 2: THE FORK — only show once address is entered */}
          {address.trim().length > 5 && (
            <div className={sectionClass}>
              <h2 className="text-xs font-bold text-white mb-md uppercase tracking-wider">2️⃣ What type of letting is this?</h2>
              <div className="grid grid-cols-2 gap-md">
                {/* HMO */}
                <button
                  type="button"
                  onClick={() => setLetType('hmo')}
                  className={`p-lg rounded-xl border-2 text-left transition-all ${
                    letType === 'hmo'
                      ? 'border-blue-500 bg-blue-900/30'
                      : 'border-neutral-700 hover:border-neutral-500 bg-neutral-800'
                  }`}
                >
                  <div className="text-3xl mb-sm">🏠</div>
                  <p className="text-base font-bold text-white mb-xs">HMO</p>
                  <p className="text-xs text-neutral-400 leading-relaxed">Multiple tenants, each with their own room. Shared kitchen, bathrooms and communal areas.</p>
                  {letType === 'hmo' && <p className="text-xs text-blue-400 font-semibold mt-sm">✓ Selected</p>}
                </button>

                {/* Single Let */}
                <button
                  type="button"
                  onClick={() => { setLetType('single_let'); setNumRooms(''); setRoomTypes([]) }}
                  className={`p-lg rounded-xl border-2 text-left transition-all ${
                    letType === 'single_let'
                      ? 'border-green-500 bg-green-900/30'
                      : 'border-neutral-700 hover:border-neutral-500 bg-neutral-800'
                  }`}
                >
                  <div className="text-3xl mb-sm">🔑</div>
                  <p className="text-base font-bold text-white mb-xs">Single Let</p>
                  <p className="text-xs text-neutral-400 leading-relaxed">Whole property let to one household. One tenancy agreement, one set of keys.</p>
                  {letType === 'single_let' && <p className="text-xs text-green-400 font-semibold mt-sm">✓ Selected</p>}
                </button>
              </div>
            </div>
          )}

          {/* Remaining sections — only show once let type is chosen */}
          {letType && (
            <>
              {/* Section 3: Landlord */}
              <div className={sectionClass}>
                <h2 className="text-xs font-bold text-white mb-sm uppercase tracking-wider">3️⃣ Landlord</h2>

                {selectedLandlord ? (
                  /* ── Confirmed landlord card + CC emails ── */
                  <div className="space-y-sm">
                    <div className="rounded-xl border-2 border-green-500 bg-green-950/40 p-md flex items-start gap-md">
                      <div className="w-12 h-12 rounded-full bg-green-700 flex items-center justify-center text-white font-bold text-lg shrink-0">
                        {llDisplayName(selectedLandlord).charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-white text-base">{llDisplayName(selectedLandlord)}</p>
                        <p className="text-sm text-neutral-300">{selectedLandlord.email}</p>
                        {selectedLandlord.phone
                          ? <p className="text-sm text-neutral-400">{selectedLandlord.phone}</p>
                          : <p className="text-xs text-amber-400 mt-xs">⚠ No phone number — add to their profile after setup</p>
                        }
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedLandlord(null)}
                        className="shrink-0 text-xs text-neutral-400 hover:text-white border border-neutral-600 rounded px-sm py-xs transition-colors"
                      >
                        Change
                      </button>
                    </div>
                    {/* CC emails — joint landlord, second owner, accountant */}
                    <div>
                      <label className={labelClass}>CC emails <span className="normal-case font-normal text-neutral-500">(joint owner, accountant — comma-separated)</span></label>
                      <input
                        type="text"
                        value={ccEmails}
                        onChange={e => setCcEmails(e.target.value)}
                        placeholder="second@owner.com, accountant@firm.co.uk"
                        className={inputClass}
                      />
                    </div>
                  </div>
                ) : landlordMode === 'add_new' ? (
                  /* ── Add new landlord inline ── */
                  <div className="space-y-md">
                    <div className="rounded-lg border border-amber-600 bg-amber-950/40 px-md py-sm">
                      <p className="text-xs text-amber-300">Adding a new landlord — you can fill in the remaining details (address, company, AML) from their landlord profile after setup.</p>
                    </div>
                    {newLLError && (
                      <p className="text-xs text-red-400 bg-red-950/40 border border-red-700 rounded px-md py-sm">{newLLError}</p>
                    )}
                    <div className="grid grid-cols-2 gap-md">
                      <div>
                        <label className={labelClass}>First name *</label>
                        <input value={newLLFirstName} onChange={e => setNewLLFirstName(e.target.value)}
                          placeholder="Cameron" className={smallInputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>Last name</label>
                        <input value={newLLLastName} onChange={e => setNewLLLastName(e.target.value)}
                          placeholder="Bennett" className={smallInputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>Email *</label>
                        <input type="email" value={newLLEmail} onChange={e => setNewLLEmail(e.target.value)}
                          placeholder="cameron@example.com" className={smallInputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>Phone</label>
                        <input type="tel" value={newLLPhone} onChange={e => setNewLLPhone(e.target.value)}
                          placeholder="07700 000000" className={smallInputClass} />
                      </div>
                    </div>
                    <div className="flex gap-sm">
                      <button type="button" onClick={handleCreateNewLandlord} disabled={savingNewLL}
                        className="flex-1 rounded-lg bg-white text-neutral-900 font-bold py-sm text-sm hover:bg-neutral-100 disabled:opacity-40 transition-colors">
                        {savingNewLL ? 'Saving…' : 'Create landlord & select'}
                      </button>
                      <button type="button" onClick={() => { setLandlordMode('search'); setNewLLError(null) }}
                        className="rounded-lg border border-neutral-600 text-neutral-300 font-semibold px-lg py-sm text-sm hover:border-neutral-400 transition-colors">
                        ← Back
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── Search existing landlords ── */
                  <div className="space-y-sm">
                    <input
                      type="text"
                      value={landlordSearch}
                      onChange={e => setLandlordSearch(e.target.value)}
                      placeholder="Search by name or email…"
                      className={inputClass}
                    />
                    {allLandlords.length === 0 ? (
                      <p className="text-xs text-neutral-500 py-sm">No landlords set up yet.</p>
                    ) : filteredLandlords.length === 0 ? (
                      <p className="text-xs text-neutral-500 py-sm">No match for &quot;{landlordSearch}&quot;</p>
                    ) : (
                      <div className="rounded-lg border border-neutral-700 overflow-hidden max-h-48 overflow-y-auto">
                        {filteredLandlords.map((ll, i) => (
                          <button
                            key={ll.id}
                            type="button"
                            onClick={() => setSelectedLandlord(ll)}
                            className={`w-full flex items-center gap-md px-md py-sm text-left hover:bg-neutral-700 transition-colors ${i > 0 ? 'border-t border-neutral-700' : ''}`}
                          >
                            <div className="w-8 h-8 rounded-full bg-neutral-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                              {llDisplayName(ll).charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-white truncate">{llDisplayName(ll)}</p>
                              <p className="text-xs text-neutral-400 truncate">{ll.email}</p>
                            </div>
                            {!ll.phone && <span className="text-xs text-amber-500 shrink-0">no phone</span>}
                          </button>
                        ))}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setLandlordMode('add_new')}
                      className="w-full rounded-lg border border-dashed border-neutral-600 text-neutral-400 hover:text-white hover:border-neutral-400 py-sm text-sm font-semibold transition-colors"
                    >
                      + Add new landlord
                    </button>
                  </div>
                )}
              </div>

              {/* Section 4: Features */}
              <div className={sectionClass}>
                <h2 className="text-xs font-bold text-white mb-sm uppercase tracking-wider">4️⃣ Features</h2>
                <div className="space-y-sm">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-xs">Utilities</p>
                    <div className="flex gap-md">
                      <label className="flex items-center gap-xs text-white text-sm cursor-pointer">
                        <input type="checkbox" checked={hasGas} onChange={e => setHasGas(e.target.checked)} className="w-4 h-4" />
                        Gas
                      </label>
                      <label className="flex items-center gap-xs text-white text-sm cursor-pointer">
                        <input type="checkbox" checked={hasElectric} onChange={e => setHasElectric(e.target.checked)} className="w-4 h-4" />
                        Electric
                      </label>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-xs">Furnished</p>
                    <div className="flex gap-md">
                      {(['furnished', 'unfurnished', 'part-furnished'] as const).map(s => (
                        <label key={s} className="flex items-center gap-xs text-white text-sm cursor-pointer">
                          <input type="radio" name="furnished" checked={furnishedStatus === s} onChange={() => setFurnishedStatus(s)} className="w-4 h-4" />
                          {s === 'part-furnished' ? 'Part-furnished' : s.charAt(0).toUpperCase() + s.slice(1)}
                        </label>
                      ))}
                    </div>
                  </div>
                  {letType === 'hmo' && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-xs">Communal Bathrooms</p>
                      <div className="flex items-center gap-sm">
                        <button
                          type="button"
                          onClick={() => setCommunalBathrooms(Math.max(1, communalBathrooms - 1))}
                          className="w-8 h-8 rounded bg-neutral-700 text-white font-bold text-lg hover:bg-neutral-600 flex items-center justify-center"
                        >−</button>
                        <span className="w-8 text-center text-white font-bold text-lg">{communalBathrooms}</span>
                        <button
                          type="button"
                          onClick={() => setCommunalBathrooms(Math.min(10, communalBathrooms + 1))}
                          className="w-8 h-8 rounded bg-neutral-700 text-white font-bold text-lg hover:bg-neutral-600 flex items-center justify-center"
                        >+</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Section 5: Tenancy */}
              <div className={sectionClass}>
                <h2 className="text-xs font-bold text-white mb-sm uppercase tracking-wider">5️⃣ Tenancy</h2>
                <div>
                  <label className={labelClass}>Bills Included *</label>
                  <div className="flex gap-sm w-48">
                    <button onClick={() => setBillsIncluded(true)} className={`flex-1 px-md py-xs text-sm rounded font-semibold transition ${billsIncluded ? 'bg-blue-600 text-white' : 'border border-neutral-700 text-white hover:bg-neutral-800'}`}>Yes</button>
                    <button onClick={() => setBillsIncluded(false)} className={`flex-1 px-md py-xs text-sm rounded font-semibold transition ${!billsIncluded ? 'bg-blue-600 text-white' : 'border border-neutral-700 text-white hover:bg-neutral-800'}`}>No</button>
                  </div>
                </div>
              </div>

              {/* Section 6: Rooms — HMO only */}
              {letType === 'hmo' && (
                <div className={sectionClass}>
                  <h2 className="text-xs font-bold text-white mb-sm uppercase tracking-wider">6️⃣ Number of Rooms</h2>
                  <div className="grid grid-cols-4 md:grid-cols-8 gap-xs">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(count => (
                      <button
                        key={count}
                        onClick={() => handleRoomCountChange(count)}
                        className={`px-md py-xs rounded text-sm font-semibold transition ${
                          numRooms === count
                            ? 'bg-blue-600 text-white'
                            : 'border border-neutral-700 text-white hover:border-blue-500 hover:bg-neutral-800'
                        }`}
                      >
                        {count}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Section 7: Room Types — HMO only */}
              {letType === 'hmo' && numRooms !== '' && (
                <div className={sectionClass}>
                  <h2 className="text-xs font-bold text-white mb-sm uppercase tracking-wider">7️⃣ Room Types</h2>
                  <div className="space-y-sm">
                    {roomTypes.map((type, index) => (
                      <div key={index} className="flex gap-md items-end">
                        <div className="flex-1">
                          <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-xs">
                            Room {index + 1} <span className="text-blue-400">{getUnitCode(index)}</span>
                          </label>
                          <select
                            value={type}
                            onChange={e => handleRoomTypeChange(index, e.target.value)}
                            className="w-full px-md py-xs border border-neutral-600 rounded text-sm bg-neutral-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">Select type…</option>
                            {roomTypeOptions.map(option => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Review & Create */}
              {isComplete && (
                <div className="rounded border border-green-600 bg-green-50 p-sm">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-sm mb-sm text-xs">
                    <div>
                      <p className="text-green-700 font-semibold mb-xs">{selectedLandlord ? llDisplayName(selectedLandlord) : ''}</p>
                      <p className="text-green-600">{address}</p>
                      <p className="font-mono text-green-600 font-bold">{propertyCode}</p>
                    </div>
                    <div>
                      <p className="text-green-700 font-semibold mb-xs">{letType === 'hmo' ? `${numRooms} rooms · HMO` : 'Single Let'}</p>
                      <p className="text-green-600">Bills {billsIncluded ? 'incl.' : 'excl.'}</p>
                    </div>
                    <div className="col-span-2">
                      <button
                        onClick={handleCreate}
                        disabled={loading}
                        className="w-full px-md py-xs bg-green-600 text-white rounded font-semibold text-xs hover:bg-green-700 disabled:opacity-50 transition"
                      >
                        {loading ? '⏳ Creating…' : '✅ Create Property'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          <Link
            href="/admin/properties"
            className="block w-full px-md py-xs border border-neutral-700 text-neutral-900 bg-white rounded font-semibold text-sm hover:bg-neutral-50 transition text-center"
          >
            Cancel
          </Link>
        </div>
      </main>

      <CouncilInfoModal
        councilInfo={pendingCouncilInfo}
        onAccept={handleAcceptCouncilInfo}
        onReject={handleRejectCouncilInfo}
        loading={councilLookupLoading}
      />
    </div>
  )
}
