'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

interface Room {
  id: string
  name: string
  property_id: string
}

interface Property {
  id: string
  name: string
  address: string
}

export default function SendOfferForm() {
  const [loading, setLoading] = useState(false)
  const [rooms, setRooms] = useState<Room[]>([])
  const [properties, setProperties] = useState<{ [key: string]: Property }>({})

  const [selectedRoom, setSelectedRoom] = useState('')
  const [applicantEmail, setApplicantEmail] = useState('')
  const [applicantName, setApplicantName] = useState('')
  const [advertisedRent, setAdvertisedRent] = useState('')
  const [moveInDate, setMoveInDate] = useState('')
  const [requestDeposit, setRequestDeposit] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    async function loadRooms() {
      try {
        const supabase = createClient()

        // Load rooms
        const { data: roomsData, error: roomsError } = await supabase
          .from('rooms')
          .select('id, name, property_id')
          .order('name')

        if (roomsError) {
          console.error('Rooms error:', roomsError)
          setRooms([])
        } else {
          setRooms((roomsData as any) || [])
        }

        // Load properties
        const { data: propsData, error: propsError } = await supabase
          .from('properties')
          .select('id, name, address')

        if (propsError) {
          console.error('Properties error:', propsError)
          setProperties({})
        } else {
          const propsIndex: { [key: string]: Property } = {}
          ;(propsData as any)?.forEach((prop: Property) => {
            propsIndex[prop.id] = prop
          })
          setProperties(propsIndex)
        }
      } catch (err) {
        console.error('Error loading rooms:', err)
        setRooms([])
        setProperties({})
      }
    }

    loadRooms()
  }, [])

  // Ensure component renders even if loading fails
  if (!loading && rooms.length === 0) {
    // Don't show error state, just render empty form
    // This prevents the component from disappearing entirely
  }

  const handleSendOffer = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!selectedRoom || !applicantEmail || !advertisedRent) {
      setError('Please select a room, enter applicant email, and specify advertised rent')
      return
    }

    const room = rooms.find((r) => r.id === selectedRoom)
    if (!room) {
      setError('Room not found')
      return
    }

    setSending(true)

    try {
      const response = await fetch('/api/lettings/send-offer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: selectedRoom,
          propertyId: room.property_id,
          applicantEmail,
          applicantName,
          advertisedRent: parseFloat(advertisedRent),
          moveInDate: moveInDate || null,
          requestDeposit,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        setError(result.error || 'Failed to send offer')
        setSending(false)
        return
      }

      setSuccess(`✓ Offer sent to ${applicantEmail}`)
      setSelectedRoom('')
      setApplicantEmail('')
      setApplicantName('')
      setAdvertisedRent('')
      setMoveInDate('')
      setRequestDeposit(false)
      setSending(false)
    } catch (err) {
      console.error('Send offer error:', err)
      setError('An error occurred. Please try again.')
      setSending(false)
    }
  }

  const selectedRoomData = rooms.find((r) => r.id === selectedRoom)
  const selectedProperty = selectedRoomData
    ? properties[selectedRoomData.property_id]
    : null

  return (
    <div className="bg-neutral-900 rounded-2xl p-xl border-2 border-neutral-950 text-white">
      <h2 className="text-2xl font-bold text-white mb-md">
        📧 Send Offer Letter
      </h2>
      <p className="text-sm text-white/60 mb-lg">
        Send a personalized application link to an applicant
      </p>

      {error && (
        <div className="mb-lg p-md rounded-lg bg-red-100 border border-red-300 text-red-900 text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-lg p-md rounded-lg bg-green-100 border border-green-300 text-green-900 text-sm">
          {success}
        </div>
      )}

      <form onSubmit={handleSendOffer} className="space-y-md">
        <div>
          <label className="block text-sm font-medium text-white mb-xs">
            Select Room <span className="text-red-500">*</span>
          </label>
          <select
            value={selectedRoom}
            onChange={(e) => setSelectedRoom(e.target.value)}
            className="w-full min-w-0 px-md py-sm rounded-xl border border-neutral-600 bg-neutral-900 text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          >
            <option value="">Choose a room...</option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name} ({properties[room.property_id]?.name})
              </option>
            ))}
          </select>
        </div>

        {selectedRoomData && selectedProperty && (
          <div className="bg-neutral-800 p-md rounded-xl border border-neutral-700">
            <div className="text-sm text-white/80">
              <div>
                <strong className="text-white">Room:</strong> {selectedRoomData.name}
              </div>
              <div>
                <strong className="text-white">Property:</strong> {selectedProperty.name}, {selectedProperty.address}
              </div>
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-white mb-xs">
            Advertised Rent (pcm) <span className="text-red-500">*</span>
          </label>
          <div className="flex items-center gap-xs">
            <span className="text-white/70 font-medium">£</span>
            <input
              type="number"
              value={advertisedRent}
              onChange={(e) => setAdvertisedRent(e.target.value)}
              placeholder="850"
              step="0.01"
              min="0"
              className="w-full min-w-0 px-md py-sm rounded-xl border border-neutral-600 bg-neutral-900 text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            <span className="text-white/70 font-medium whitespace-nowrap">pcm</span>
          </div>
          {advertisedRent && (
            <p className="mt-xs text-xs text-white/60">
              Holding deposit: £{(parseFloat(advertisedRent) / 4.33).toFixed(2)} (1 week's rent)
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-white mb-xs">
            Applicant Email <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            value={applicantEmail}
            onChange={(e) => setApplicantEmail(e.target.value)}
            placeholder="applicant@email.com"
            className="w-full min-w-0 px-md py-sm rounded-xl border border-neutral-600 bg-neutral-900 text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-white mb-xs">
            Applicant Name (optional)
          </label>
          <input
            type="text"
            value={applicantName}
            onChange={(e) => setApplicantName(e.target.value)}
            placeholder="e.g., Jane Doe"
            className="w-full min-w-0 px-md py-sm rounded-xl border border-neutral-600 bg-neutral-900 text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-white mb-xs">
            Suggested Move-In Date (optional)
          </label>
          <input
            type="date"
            value={moveInDate}
            onChange={(e) => setMoveInDate(e.target.value)}
            className="w-full min-w-0 px-md py-sm rounded-xl border border-neutral-600 bg-neutral-900 text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-md p-md rounded-xl bg-blue-950/50 border border-blue-800">
          <input
            type="checkbox"
            id="requestDeposit"
            checked={requestDeposit}
            onChange={(e) => setRequestDeposit(e.target.checked)}
            className="w-4 h-4 cursor-pointer"
          />
          <label htmlFor="requestDeposit" className="text-sm font-medium text-white cursor-pointer flex-1">
            🏦 Request Holding Deposit to Reserve Room
          </label>
        </div>

        {requestDeposit && advertisedRent && (
          <div className="p-md rounded-lg bg-green-50 border border-green-200">
            <p className="text-xs text-green-900">
              <strong>Holding Deposit Amount:</strong> £{(parseFloat(advertisedRent) / 4.33).toFixed(2)} (1 week's rent)
            </p>
            <p className="text-xs text-green-900 mt-xs">
              Applicant will receive payment instructions in the email.
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={sending || !selectedRoom || !applicantEmail}
          className="w-full py-md px-lg rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {sending ? 'Sending...' : 'Send Offer Letter'}
        </button>
      </form>

      <p className="text-xs text-white/50 mt-lg">
        💡 The applicant will receive an email with a personalized link to complete their application.
        The link expires in 30 days.
      </p>
    </div>
  )
}
