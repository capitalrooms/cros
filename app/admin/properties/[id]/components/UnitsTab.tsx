'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

interface Room {
  id: string
  name: string
  unit_code?: string | null
  property_id: string
  room_type?: string | null
  description: string | null
  created_at: string
  updated_at: string
  currentTenant?: {
    full_name?: string
    email?: string
  }
  tenancyInfo?: {
    start_date: string
    rent_amount: number | null
  }
  tenancyId?: string | null
}

interface UnitsTabProps {
  propertyId: string
  bedrooms: number
}

interface TenantInfo {
  id: string
  name: string
  email: string
  phone: string
  start_date: string
  end_date: string | null
  rent_monthly: number
}

export default function UnitsTab({ propertyId, bedrooms }: UnitsTabProps) {
  const router = useRouter()
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [isAddingRoom, setIsAddingRoom] = useState(false)
  const [editingRoom, setEditingRoom] = useState<Room | null>(null)
  const [selectedRoomForDetails, setSelectedRoomForDetails] = useState<Room | null>(null)
  const [currentTenant, setCurrentTenant] = useState<TenantInfo | null>(null)
  const [newRoomName, setNewRoomName] = useState('')
  const [newRoomDescription, setNewRoomDescription] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const supabase = createClient()

  useEffect(() => {
    loadRooms()
  }, [propertyId])

  async function loadRooms() {
    setLoading(true)
    const { data: roomsData, error: roomsErr } = await supabase
      .from('rooms')
      .select('id, name, unit_code, property_id, room_type, description, created_at, updated_at')
      .eq('property_id', propertyId)
      .order('unit_code', { ascending: true, nullsLast: true })

    if (roomsErr) {
      setError('Failed to load rooms')
      console.error(roomsErr)
      setLoading(false)
      return
    }

    // Fetch current tenancy info for each room
    const roomsWithTenants = await Promise.all(
      (roomsData || []).map(async (room) => {
        const { data: tenancy, error: tenancyErr } = await supabase
          .from('tenancies')
          .select(`
            id,
            person_id,
            start_date,
            end_date,
            rent_amount,
            people(id, full_name, email)
          `)
          .eq('room_id', room.id)
          .is('end_date', null)
          .maybeSingle()

        if (tenancyErr) {
          console.error(`Error loading tenancy for room ${room.id}:`, tenancyErr)
        }

        return {
          ...room,
          currentTenant: tenancy?.people || null,
          tenancyInfo: tenancy ? {
            start_date: tenancy.start_date,
            rent_amount: tenancy.rent_amount
          } : null,
          tenancyId: tenancy?.id || null
        }
      })
    )

    // Always show units in natural order (Room 1, 2, … 10) — by unit_code when
    // set, otherwise by name, numeric-aware so it never comes out jumbled.
    roomsWithTenants.sort((a: any, b: any) =>
      String(a.unit_code || a.name || '').localeCompare(
        String(b.unit_code || b.name || ''),
        undefined,
        { numeric: true, sensitivity: 'base' }
      )
    )
    setRooms(roomsWithTenants)
    setLoading(false)
  }

  async function handleAddRoom() {
    if (!newRoomName.trim()) {
      setError('Room name is required')
      return
    }

    const { data, error: err } = await supabase
      .from('rooms')
      .insert({
        property_id: propertyId,
        name: newRoomName,
        description: newRoomDescription || null
      })
      .select()

    if (err) {
      setError('Failed to create room')
      console.error(err)
      return
    }

    if (data) {
      setRooms([...rooms, data[0]])
      setNewRoomName('')
      setNewRoomDescription('')
      setIsAddingRoom(false)
      setSuccess(`Room "${newRoomName}" created`)
      setTimeout(() => setSuccess(null), 3000)
    }
  }

  async function handleUpdateRoom() {
    if (!editingRoom || !editingRoom.name.trim()) {
      setError('Room name is required')
      return
    }

    const { error: err } = await supabase
      .from('rooms')
      .update({
        name: editingRoom.name,
        description: editingRoom.description || null
      })
      .eq('id', editingRoom.id)

    if (err) {
      setError('Failed to update room')
      console.error(err)
      return
    }

    setRooms(rooms.map(r => r.id === editingRoom.id ? editingRoom : r))
    setEditingRoom(null)
    setSuccess(`Room updated`)
    setTimeout(() => setSuccess(null), 3000)
  }

  async function handleDeleteRoom(roomId: string, roomName: string) {
    if (!confirm(`Delete room "${roomName}"? This cannot be undone.`)) return

    setDeleting(roomId)
    const { error: err } = await supabase
      .from('rooms')
      .delete()
      .eq('id', roomId)

    if (err) {
      setError('Failed to delete room')
      console.error(err)
      setDeleting(null)
      return
    }

    setRooms(rooms.filter(r => r.id !== roomId))
    setSuccess(`Room deleted`)
    setTimeout(() => setSuccess(null), 3000)
    setDeleting(null)
  }

  async function loadRoomDetails(room: Room) {
    setSelectedRoomForDetails(room)

    // Fetch current tenant info (including on-notice tenancies)
    const { data: tenantData } = await supabase
      .from('tenancies')
      .select(`
        id,
        start_date,
        end_date,
        rent_monthly,
        status,
        people(id, email, phone),
        person_id
      `)
      .eq('room_id', room.id)
      .or('end_date.is.null,status.eq.on_notice')  // Current or on-notice tenant
      .single()

    if (tenantData && tenantData.people) {
      setCurrentTenant({
        id: tenantData.people.id,
        name: tenantData.people.email?.split('@')[0] || 'Unknown',
        email: tenantData.people.email || '',
        phone: tenantData.people.phone || '',
        start_date: tenantData.start_date,
        end_date: tenantData.end_date,
        rent_monthly: tenantData.rent_monthly || 0
      })
    } else {
      setCurrentTenant(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-xl">
        <div className="text-sm text-neutral-400">Loading rooms...</div>
      </div>
    )
  }

  return (
    <div className="space-y-xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Property Units</h2>
          <p className="text-sm text-neutral-400 mt-xs">{rooms.length} of {bedrooms} bedrooms configured</p>
        </div>
        <button
          onClick={() => setIsAddingRoom(true)}
          className="px-lg py-md bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 transition"
        >
          + Add Room
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="p-lg rounded-lg bg-red-950 border border-red-800">
          <p className="text-sm font-semibold text-red-400">{error}</p>
        </div>
      )}
      {success && (
        <div className="p-lg rounded-lg bg-green-950 border border-green-800">
          <p className="text-sm font-semibold text-green-400">✓ {success}</p>
        </div>
      )}

      {/* Add Room Modal */}
      {isAddingRoom && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-lg">
          <div className="bg-neutral-900 rounded-xl shadow-lg p-lg max-w-md w-full border border-neutral-700">
            <h3 className="text-lg font-semibold text-white mb-lg">Add New Room</h3>

            <div className="space-y-lg">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">
                  Room Name *
                </label>
                <input
                  type="text"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="e.g., Bedroom 1, Bathroom, Kitchen"
                  className="w-full px-md py-sm border border-neutral-700 bg-neutral-900 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">
                  Description (Optional)
                </label>
                <textarea
                  value={newRoomDescription}
                  onChange={(e) => setNewRoomDescription(e.target.value)}
                  placeholder="e.g., En-suite with shower, Double bedroom with bay window"
                  className="w-full px-md py-sm border border-neutral-700 bg-neutral-900 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                />
              </div>
            </div>

            <div className="flex gap-md mt-lg">
              <button
                onClick={() => {
                  setIsAddingRoom(false)
                  setNewRoomName('')
                  setNewRoomDescription('')
                  setError(null)
                }}
                className="flex-1 px-lg py-md border border-neutral-700 text-white rounded-lg font-semibold text-sm hover:bg-neutral-900 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleAddRoom}
                className="flex-1 px-lg py-md bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 transition"
              >
                Create Room
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Room Modal */}
      {editingRoom && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-lg">
          <div className="bg-neutral-900 rounded-xl shadow-lg p-lg max-w-md w-full border border-neutral-700">
            <h3 className="text-lg font-semibold text-white mb-lg">Edit Room</h3>

            <div className="space-y-lg">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">
                  Room Name *
                </label>
                <input
                  type="text"
                  value={editingRoom.name}
                  onChange={(e) => setEditingRoom({ ...editingRoom, name: e.target.value })}
                  className="w-full px-md py-sm border border-neutral-700 bg-neutral-900 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">
                  Description (Optional)
                </label>
                <textarea
                  value={editingRoom.description || ''}
                  onChange={(e) => setEditingRoom({ ...editingRoom, description: e.target.value })}
                  className="w-full px-md py-sm border border-neutral-700 bg-neutral-900 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                />
              </div>
            </div>

            <div className="flex gap-md mt-lg">
              <button
                onClick={() => {
                  setEditingRoom(null)
                  setError(null)
                }}
                className="flex-1 px-lg py-md border border-neutral-700 text-white rounded-lg font-semibold text-sm hover:bg-neutral-900 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateRoom}
                className="flex-1 px-lg py-md bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 transition"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Room Details Modal */}
      {selectedRoomForDetails && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-lg">
          <div className="bg-neutral-900 rounded-xl shadow-lg p-lg max-w-md w-full border border-neutral-700">
            <div className="flex items-start justify-between mb-lg">
              <h3 className="text-lg font-semibold text-white">{selectedRoomForDetails.name}</h3>
              <button
                onClick={() => {
                  setSelectedRoomForDetails(null)
                  setCurrentTenant(null)
                }}
                className="text-2xl text-neutral-400 hover:text-white"
              >
                ×
              </button>
            </div>

            {selectedRoomForDetails.description && (
              <p className="text-sm text-neutral-300 mb-lg pb-lg border-b border-neutral-700">
                {selectedRoomForDetails.description}
              </p>
            )}

            {currentTenant ? (
              <div className="space-y-lg">
                <div className="bg-neutral-900 p-lg rounded-lg border border-neutral-700">
                  <h4 className="text-sm font-semibold text-white mb-md">Current Tenant</h4>
                  <div className="space-y-sm text-sm">
                    <div>
                      <p className="text-neutral-400">Name</p>
                      <p className="text-white font-semibold">{currentTenant.name}</p>
                    </div>
                    <div>
                      <p className="text-neutral-400">Email</p>
                      <p className="text-blue-400">{currentTenant.email}</p>
                    </div>
                    <div>
                      <p className="text-neutral-400">Phone</p>
                      <p className="text-white">{currentTenant.phone || '—'}</p>
                    </div>
                    <div>
                      <p className="text-neutral-400">Monthly Rent</p>
                      <p className="text-white font-semibold">£{currentTenant.rent_monthly}</p>
                    </div>
                    <div>
                      <p className="text-neutral-400">Start Date</p>
                      <p className="text-white">{new Date(currentTenant.start_date).toLocaleDateString('en-GB')}</p>
                    </div>
                    {currentTenant.end_date && (
                      <div>
                        <p className="text-neutral-400">End Date</p>
                        <p className="text-white">{new Date(currentTenant.end_date).toLocaleDateString('en-GB')}</p>
                      </div>
                    )}
                  </div>
                  <button className="w-full mt-lg px-lg py-md bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 transition">
                    View Tenant Profile
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-neutral-900 p-lg rounded-lg border border-neutral-700 text-center">
                <p className="text-sm text-neutral-400">No current tenant</p>
              </div>
            )}

            <button
              onClick={() => {
                setSelectedRoomForDetails(null)
                setCurrentTenant(null)
              }}
              className="w-full mt-lg px-lg py-md border border-neutral-700 text-white rounded-lg font-semibold text-sm hover:bg-neutral-900 transition"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Rooms List */}
      {rooms.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-neutral-700 bg-neutral-900 p-xl text-center">
          <div className="text-3xl mb-md opacity-50">📋</div>
          <p className="text-sm font-semibold text-white mb-md">No rooms created yet</p>
          <p className="text-xs text-neutral-400 mb-lg">Add the first room to start managing this property</p>
          <button
            onClick={() => setIsAddingRoom(true)}
            className="px-lg py-md bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 transition mx-auto"
          >
            + Add Room
          </button>
        </div>
      ) : (
        <div className="space-y-xs">
          {rooms.map((room) => (
            <div
              key={room.id}
              role="button"
              tabIndex={0}
              onClick={() => router.push(`/admin/properties/${propertyId}/rooms/${room.id}`)}
              onKeyDown={(e) => { if (e.key === 'Enter') router.push(`/admin/properties/${propertyId}/rooms/${room.id}`) }}
            >
              <div className="rounded-lg border border-neutral-700 bg-neutral-900 p-md hover:shadow-md hover:border-neutral-600 transition cursor-pointer grid grid-cols-[100px_120px_180px_90px_100px_1fr] gap-md items-center">
                {/* Col 1: Unit Code */}
                <div>
                  <p className="font-semibold text-white text-sm truncate">{room.unit_code || room.name}</p>
                  {room.unit_code && room.name && (
                    <p className="text-xs text-neutral-500 truncate">{room.name}</p>
                  )}
                </div>

                {/* Col 2: Room Type */}
                <div>
                  {room.room_type && (
                    <p className="text-xs text-neutral-400 truncate">{room.room_type}</p>
                  )}
                </div>

                {/* Col 3: Tenant Name */}
                <div>
                  {room.currentTenant && room.tenancyId ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        router.push(`/admin/properties/${propertyId}/rooms/${room.id}/tenancy/${room.tenancyId}`)
                      }}
                      className="text-left"
                    >
                      <p className="text-sm text-blue-400 font-semibold truncate hover:text-blue-300 cursor-pointer">
                        {room.currentTenant.full_name || room.currentTenant.email}
                      </p>
                    </button>
                  ) : room.currentTenant ? (
                    <p className="text-sm text-blue-400 font-semibold truncate">
                      {room.currentTenant.full_name || room.currentTenant.email}
                    </p>
                  ) : (
                    <p className="text-sm text-neutral-500 italic">Available</p>
                  )}
                </div>

                {/* Col 4: Rent */}
                <div>
                  {room.tenancyInfo && (
                    <p className="text-sm text-neutral-400">£{room.tenancyInfo.rent_amount || '—'}</p>
                  )}
                </div>

                {/* Col 5: Since Date */}
                <div>
                  {room.tenancyInfo && (
                    <p className="text-xs text-neutral-500">
                      {new Date(room.tenancyInfo.start_date).toLocaleDateString('en-GB')}
                    </p>
                  )}
                </div>

                {/* Col 6: Buttons */}
                <div className="flex gap-sm justify-end">
                  <button
                    className="px-md py-xs text-green-400 hover:text-green-300 font-semibold text-xs whitespace-nowrap"
                    onClick={(e) => {
                      e.stopPropagation()
                      router.push(`/admin/properties/${propertyId}/rooms/${room.id}`)
                    }}
                  >
                    Dashboard
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingRoom(room) }}
                    className="px-md py-xs text-blue-400 hover:text-blue-300 font-semibold text-xs"
                  >
                    Edit
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteRoom(room.id, room.name) }}
                    disabled={deleting === room.id}
                    className="px-md py-xs text-red-400 hover:text-red-300 font-semibold text-xs disabled:opacity-50"
                  >
                    {deleting === room.id ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
