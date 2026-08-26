'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import Link from 'next/link'
import CouncilInfoModal from './components/CouncilInfoModal'

export default function NewPropertyPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 1: Property Details
  const [address, setAddress] = useState('')
  const [propertyCode, setPropertyCode] = useState('')
  const [propertyType, setPropertyType] = useState<'hmo' | 'single_let'>('hmo')
  const [councilTaxBand, setCouncilTaxBand] = useState('')
  const [councilLookupLoading, setCouncilLookupLoading] = useState(false)
  const [councilInfo, setCouncilInfo] = useState<any>(null)
  const [showCouncilModal, setShowCouncilModal] = useState(false)
  const [pendingCouncilInfo, setPendingCouncilInfo] = useState<any>(null)

  // Step 2: Landlord Details
  const [landlordName, setLandlordName] = useState('')
  const [landlordEmail, setLandlordEmail] = useState('')
  const [landlordPhone, setLandlordPhone] = useState('')

  // Step 3: Property Features
  const [hasGas, setHasGas] = useState(true)
  const [hasElectric, setHasElectric] = useState(true)
  const [furnishedStatus, setFurnishedStatus] = useState<'furnished' | 'unfurnished' | 'part-furnished'>('unfurnished')
  const [communalBathrooms, setCommunalBathrooms] = useState(0)

  // Step 4: Tenancy Settings
  const [billsIncluded, setBillsIncluded] = useState(true)
  const noticePeriod = 2 // Standard UK notice period

  // Step 4: Structure
  const [numRooms, setNumRooms] = useState<number | ''>('')

  // Step 5: Room Types
  const [roomTypes, setRoomTypes] = useState<string[]>([])

  // Helper: Generate property code from address
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

    // Auto-lookup council info if address looks valid
    if (value.length > 10) {
      lookupCouncilInfo(value)
    }
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

  const handleRoomCountChange = (count: number) => {
    setNumRooms(count)
    setRoomTypes(Array(count).fill(''))
  }

  const handleRoomTypeChange = (index: number, type: string) => {
    const newTypes = [...roomTypes]
    newTypes[index] = type
    setRoomTypes(newTypes)
  }

  const getUnitCode = (roomIndex: number): string => {
    return `${propertyCode}${String(roomIndex + 1).padStart(2, '0')}`
  }

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

  const isComplete =
    address.trim() &&
    propertyCode &&
    landlordName.trim() &&
    landlordEmail.trim() &&
    numRooms !== '' &&
    roomTypes.every(t => t)

  const handleCreate = async () => {
    if (!isComplete) {
      setError('All fields are required')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()

      // Create property
      const { data: property, error: propErr } = await supabase
        .from('properties')
        .insert({
          name: address,
          address: address,
          property_code: propertyCode,
          property_type: propertyType,
          landlord_name: landlordName,
          landlord_email: landlordEmail,
          landlord_phone: landlordPhone,
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
          notice_period_months: parseInt(noticePeriod.toString())
        })
        .select()
        .single()

      if (propErr) throw propErr
      if (!property) throw new Error('Failed to create property')

      // Create rooms
      const roomsToCreate = roomTypes.map((type, index) => ({
        property_id: property.id,
        name: `Room ${index + 1}`,
        unit_code: getUnitCode(index),
        room_type: type
      }))

      const { error: roomsErr } = await supabase
        .from('rooms')
        .insert(roomsToCreate)

      if (roomsErr) throw roomsErr

      router.push(`/admin/properties/${property.id}`)
    } catch (err: any) {
      setError(err.message || 'Failed to create property')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar
        right={<BackButton href="/admin/properties" />}
      />

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
          {/* Council Info Accepted Indicator */}
          {councilInfo && !councilLookupLoading && (
            <div className="rounded border border-green-600 bg-green-50 p-xs">
              <p className="text-xs font-semibold text-green-900">✓ {councilInfo.council_name} • Bins: {councilInfo.bin_collection_day}</p>
            </div>
          )}

          {/* Section 1: Property Details */}
          <div className="rounded-lg border border-neutral-700 bg-neutral-900 p-md">
            <h2 className="text-xs font-bold text-white mb-sm uppercase tracking-wider">1️⃣ Property Details</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm">
                  Full Address *
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => handleAddressChange(e.target.value)}
                  placeholder="e.g., 451 St. Davids Square, London"
                  className="w-full px-lg py-md border border-neutral-700 rounded-lg text-sm bg-neutral-800 text-neutral-50 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500 autofill:bg-neutral-800 autofill:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm">
                  Property Code (Auto) *
                </label>
                <div className="flex gap-sm">
                  <input
                    type="text"
                    value={propertyCode}
                    onChange={(e) => setPropertyCode(e.target.value.toUpperCase())}
                    maxLength="10"
                    className="flex-1 px-lg py-md border border-neutral-700 rounded-lg text-sm bg-neutral-800 text-white font-mono font-bold focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <div className="text-2xl">✏️</div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm">
                  Property Type *
                </label>
                <select
                  value={propertyType}
                  onChange={(e) => setPropertyType(e.target.value as 'hmo' | 'single_let')}
                  className="w-full px-lg py-md border border-neutral-700 rounded-lg text-sm bg-neutral-800 text-neutral-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="hmo">House</option>
                  <option value="single_let">Flat</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm">
                  Council Tax Band
                </label>
                <input
                  type="text"
                  value={councilTaxBand}
                  onChange={(e) => setCouncilTaxBand(e.target.value.toUpperCase())}
                  placeholder="e.g., D"
                  maxLength="1"
                  className="w-full px-md py-xs text-sm border border-neutral-700 rounded bg-neutral-800 text-neutral-50 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500 [-webkit-autofill]:!bg-neutral-800 [-webkit-autofill]:!text-neutral-50"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Landlord Details */}
          <div className="rounded-lg border border-neutral-700 bg-neutral-900 p-md">
            <h2 className="text-xs font-bold text-white mb-sm uppercase tracking-wider">2️⃣ Landlord</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-lg">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm">
                  Landlord Name *
                </label>
                <input
                  type="text"
                  value={landlordName}
                  onChange={(e) => setLandlordName(e.target.value)}
                  placeholder="Full name"
                  className="w-full px-md py-xs text-sm border border-neutral-700 rounded bg-neutral-800 text-neutral-50 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500 [-webkit-autofill]:!bg-neutral-800 [-webkit-autofill]:!text-neutral-50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm">
                  Email *
                </label>
                <input
                  type="email"
                  value={landlordEmail}
                  onChange={(e) => setLandlordEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="w-full px-md py-xs text-sm border border-neutral-700 rounded bg-neutral-800 text-neutral-50 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500 [-webkit-autofill]:!bg-neutral-800 [-webkit-autofill]:!text-neutral-50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm">
                  Phone
                </label>
                <input
                  type="tel"
                  value={landlordPhone}
                  onChange={(e) => setLandlordPhone(e.target.value)}
                  placeholder="Phone number"
                  className="w-full px-md py-xs text-sm border border-neutral-700 rounded bg-neutral-800 text-neutral-50 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500 [-webkit-autofill]:!bg-neutral-800 [-webkit-autofill]:!text-neutral-50"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Property Features */}
          <div className="rounded-lg border border-neutral-700 bg-neutral-900 p-md">
            <h2 className="text-xs font-bold text-white mb-sm uppercase tracking-wider">3️⃣ Features</h2>

            <div className="space-y-sm">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-xs">Utilities *</p>
                <div className="flex gap-md">
                  <label className="flex items-center gap-xs text-white text-sm cursor-pointer">
                    <input type="checkbox" checked={hasGas} onChange={(e) => setHasGas(e.target.checked)} className="w-4 h-4" />
                    Gas
                  </label>
                  <label className="flex items-center gap-xs text-white text-sm cursor-pointer">
                    <input type="checkbox" checked={hasElectric} onChange={(e) => setHasElectric(e.target.checked)} className="w-4 h-4" />
                    Electric
                  </label>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-xs">Furnished *</p>
                <div className="flex gap-md">
                  {(['furnished', 'unfurnished', 'part-furnished'] as const).map((status) => (
                    <label key={status} className="flex items-center gap-xs text-white text-sm cursor-pointer">
                      <input type="radio" name="furnished" checked={furnishedStatus === status} onChange={() => setFurnishedStatus(status)} className="w-4 h-4" />
                      {status === 'part-furnished' ? 'Part-furnished' : status.charAt(0).toUpperCase() + status.slice(1)}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-xs">Communal Bathrooms</p>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={communalBathrooms}
                  onChange={(e) => setCommunalBathrooms(parseInt(e.target.value) || 0)}
                  className="w-32 px-md py-xs text-sm border border-neutral-700 rounded bg-neutral-800 text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0"
                />
              </div>
            </div>
          </div>

          {/* Section 4: Tenancy Settings */}
          <div className="rounded-lg border border-neutral-700 bg-neutral-900 p-md">
            <h2 className="text-xs font-bold text-white mb-sm uppercase tracking-wider">4️⃣ Tenancy</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm">
                  Bills Included *
                </label>
                <div className="flex gap-sm">
                  <button
                    onClick={() => setBillsIncluded(true)}
                    className={`flex-1 px-md py-xs text-sm rounded font-semibold transition ${
                      billsIncluded
                        ? 'bg-blue-600 text-white border border-blue-600'
                        : 'border border-neutral-700 text-white hover:bg-neutral-800'
                    }`}
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setBillsIncluded(false)}
                    className={`flex-1 px-md py-xs text-sm rounded font-semibold transition ${
                      !billsIncluded
                        ? 'bg-blue-600 text-white border border-blue-600'
                        : 'border border-neutral-700 text-white hover:bg-neutral-800'
                    }`}
                  >
                    No
                  </button>
                </div>
              </div>            </div>
          </div>

          {/* Section 4: Room Structure */}
          <div className="rounded-lg border border-neutral-700 bg-neutral-900 p-md">
            <h2 className="text-xs font-bold text-white mb-sm uppercase tracking-wider">5️⃣ Rooms</h2>

            <div className="grid grid-cols-4 md:grid-cols-8 gap-xs">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((count) => (
                <button
                  key={count}
                  onClick={() => handleRoomCountChange(count)}
                  className={`px-md py-xs rounded text-sm font-semibold transition ${
                    numRooms === count
                      ? 'bg-blue-600 text-white border border-blue-600'
                      : 'border border-neutral-700 text-white hover:border-blue-500 hover:bg-neutral-800'
                  }`}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>

          {/* Section 5: Room Types */}
          {numRooms !== '' && (
            <div className="rounded-lg border border-neutral-700 bg-neutral-900 p-md">
              <h2 className="text-xs font-bold text-white mb-sm uppercase tracking-wider">6️⃣ Types</h2>

              <div className="space-y-sm">
                {roomTypes.map((type, index) => (
                  <div key={index} className="flex gap-md items-end">
                    <div className="flex-1">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-xs">
                        Room {index + 1} <span className="text-blue-400">{getUnitCode(index)}</span>
                      </label>
                      <select
                        value={type}
                        onChange={(e) => handleRoomTypeChange(index, e.target.value)}
                        className="w-full px-md py-xs border border-neutral-600 rounded text-sm bg-neutral-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Select type...</option>
                        {roomTypeOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
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
                  <p className="text-green-700 font-semibold mb-xs">{landlordName}</p>
                  <p className="text-green-600 text-xs">{address}</p>
                  <p className="font-mono text-green-600 font-bold">{propertyCode}</p>
                </div>
                <div>
                  <p className="text-green-700 font-semibold mb-xs">{numRooms} rooms</p>
                  <p className="text-green-600">{propertyType === 'hmo' ? 'House' : 'Flat'}</p>
                  <p className="text-green-600">Bills {billsIncluded ? 'incl.' : 'excl.'}</p>
                </div>
                <div className="col-span-2 md:col-span-2">
                  <button
                    onClick={handleCreate}
                    disabled={loading}
                    className="w-full px-md py-xs bg-green-600 text-white rounded font-semibold text-xs hover:bg-green-700 disabled:opacity-50 transition"
                  >
                    {loading ? '⏳ Creating...' : '✅ Create Property'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <Link
            href="/admin/properties"
            className="block w-full px-md py-xs border border-neutral-700 text-neutral-900 bg-white rounded font-semibold text-sm hover:bg-neutral-50 transition text-center"
          >
            Cancel
          </Link>
        </div>
      </main>

      {/* Council Info Modal */}
      <CouncilInfoModal
        councilInfo={pendingCouncilInfo}
        onAccept={handleAcceptCouncilInfo}
        onReject={handleRejectCouncilInfo}
        loading={councilLookupLoading}
      />
    </div>
  )
}
