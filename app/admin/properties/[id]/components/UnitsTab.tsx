'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

/* ─── Types ─────────────────────────────────────────────── */

interface RoomRow {
  id: string
  name: string
  unit_code: string | null
  property_id: string
  room_type: string | null
  description: string | null
  status: string | null
  currentTenant: { name: string; email: string } | null
  tenancyInfo: { start_date: string; rent_amount: number | null } | null
  tenancyId: string | null
}

interface TenancyDetail {
  id: string
  start_date: string
  end_date: string | null
  rent_amount: number | null
  deposit_amount: number | null
  deposit_held_by: string | null
  deposit_scheme_ref: string | null
  lease_reference: string | null
  person_id: string
  person: {
    id: string
    full_name: string | null
    first_name: string | null
    last_name: string | null
    email: string
    phone: string | null
    occupation: string | null
  } | null
}

interface RoomDetail extends RoomRow {
  tenancy: TenancyDetail | null
}

interface UnitsTabProps {
  propertyId: string
  bedrooms: number
  initialRoomId?: string
}

type View = 'list' | 'room'

/* ─── Helpers ────────────────────────────────────────────── */

function tenantDisplayName(p: TenancyDetail['person']): string {
  if (!p) return '—'
  return p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email
}

function initials(p: TenancyDetail['person']): string {
  if (!p) return '?'
  const name = p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email
  return name.split(' ').slice(0, 2).map((w: string) => w[0]?.toUpperCase()).join('')
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtRent(r: number | null | undefined): string {
  if (!r) return '—'
  return `£${r.toLocaleString()} pcm`
}

function statusPill(room: RoomRow) {
  if (room.currentTenant) {
    const isOnNotice = room.tenancyInfo?.start_date &&
      room.status === 'on_notice'
    if (isOnNotice) {
      return <span className="text-xs font-semibold px-sm py-xs rounded-full bg-amber-100 text-amber-800">On notice</span>
    }
    return <span className="text-xs font-semibold px-sm py-xs rounded-full bg-green-100 text-green-800">Occupied</span>
  }
  return <span className="text-xs font-semibold px-sm py-xs rounded-full bg-neutral-100 text-neutral-500">Vacant</span>
}

/* ─── Component ──────────────────────────────────────────── */

export default function UnitsTab({ propertyId, bedrooms, initialRoomId }: UnitsTabProps) {
  const router = useRouter()
  const supabase = createClient()

  const [rooms, setRooms] = useState<RoomRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Drill-down
  const [view, setView] = useState<View>('list')
  const [selectedRoom, setSelectedRoom] = useState<RoomDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Add / edit modals
  const [isAddingRoom, setIsAddingRoom] = useState(false)
  const [editingRoom, setEditingRoom] = useState<RoomRow | null>(null)
  const [newRoomName, setNewRoomName] = useState('')
  const [newRoomDescription, setNewRoomDescription] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => { loadRooms() }, [propertyId])

  // Auto-open a specific room when initialRoomId is provided (e.g. from All Units deep link)
  useEffect(() => {
    if (initialRoomId && rooms.length > 0) {
      const room = rooms.find(r => r.id === initialRoomId)
      if (room) openRoom(room)
    }
  }, [initialRoomId, rooms])

  /* ── Data loading ── */

  async function loadRooms() {
    setLoading(true)
    const { data: roomsData, error: roomsErr } = await supabase
      .from('rooms')
      .select('id, name, unit_code, property_id, room_type, description, status, created_at, updated_at')
      .eq('property_id', propertyId)
      .order('unit_code', { ascending: true, nullsLast: true })

    if (roomsErr) {
      setError('Failed to load rooms')
      setLoading(false)
      return
    }

    const today = new Date().toISOString().split('T')[0]
    const enriched = await Promise.all(
      (roomsData || []).map(async (room) => {
        const { data: tenancy } = await supabase
          .from('tenancies')
          .select('id, person_id, start_date, end_date, rent_amount, people!person_id(id, full_name, first_name, last_name, email)')
          .eq('room_id', room.id)
          .or(`end_date.is.null,end_date.gte.${today}`)
          .order('end_date', { ascending: false, nullsFirst: true })
          .limit(1)
          .maybeSingle()

        const p = tenancy?.people as any
        const tenantName = p?.full_name || [p?.first_name, p?.last_name].filter(Boolean).join(' ') || p?.email || null

        return {
          ...room,
          currentTenant: tenantName ? { name: tenantName, email: p?.email || '' } : null,
          tenancyInfo: tenancy ? { start_date: tenancy.start_date, rent_amount: tenancy.rent_amount } : null,
          tenancyId: tenancy?.id || null,
        } as RoomRow
      })
    )

    enriched.sort((a, b) =>
      String(a.unit_code || a.name || '').localeCompare(String(b.unit_code || b.name || ''), undefined, { numeric: true })
    )
    setRooms(enriched)
    setLoading(false)
  }

  async function openRoom(room: RoomRow) {
    setDetailLoading(true)
    setSelectedRoom({ ...room, tenancy: null })
    setView('room')

    const today = new Date().toISOString().split('T')[0]
    const { data: tenancyData } = await supabase
      .from('tenancies')
      .select(`
        id, start_date, end_date, rent_amount, deposit_amount,
        deposit_held_by, deposit_scheme_ref, lease_reference, person_id,
        people!person_id(id, full_name, first_name, last_name, email, phone, occupation)
      `)
      .eq('room_id', room.id)
      .or(`end_date.is.null,end_date.gte.${today}`)
      .order('end_date', { ascending: false, nullsFirst: true })
      .limit(1)
      .maybeSingle()

    const raw = tenancyData as any
    const tenancy: TenancyDetail | null = raw ? {
      id: raw.id,
      start_date: raw.start_date,
      end_date: raw.end_date,
      rent_amount: raw.rent_amount,
      deposit_amount: raw.deposit_amount,
      deposit_held_by: raw.deposit_held_by,
      deposit_scheme_ref: raw.deposit_scheme_ref,
      lease_reference: raw.lease_reference,
      person_id: raw.person_id,
      person: raw.people || null,
    } : null

    setSelectedRoom({ ...room, tenancy })
    setDetailLoading(false)
  }

  /* ── CRUD ── */

  async function handleAddRoom() {
    if (!newRoomName.trim()) { setError('Room name is required'); return }
    const { data, error: err } = await supabase
      .from('rooms')
      .insert({ property_id: propertyId, name: newRoomName, description: newRoomDescription || null })
      .select()
    if (err) { setError('Failed to create room'); return }
    if (data) {
      await loadRooms()
      setNewRoomName(''); setNewRoomDescription(''); setIsAddingRoom(false)
      setSuccess(`Room "${newRoomName}" created`)
      setTimeout(() => setSuccess(null), 3000)
    }
  }

  async function handleUpdateRoom() {
    if (!editingRoom?.name.trim()) { setError('Room name is required'); return }
    const { error: err } = await supabase
      .from('rooms').update({ name: editingRoom.name, description: editingRoom.description || null, unit_code: editingRoom.unit_code || null })
      .eq('id', editingRoom.id)
    if (err) { setError('Failed to update room'); return }
    await loadRooms()
    setEditingRoom(null)
    setSuccess('Room updated')
    setTimeout(() => setSuccess(null), 3000)
  }

  async function handleDeleteRoom(roomId: string, roomName: string) {
    if (!confirm(`Delete room "${roomName}"? This cannot be undone.`)) return
    setDeleting(roomId)
    const { error: err } = await supabase.from('rooms').delete().eq('id', roomId)
    if (err) { setError('Failed to delete room'); setDeleting(null); return }
    setRooms(rooms.filter(r => r.id !== roomId))
    setSuccess('Room deleted')
    setTimeout(() => setSuccess(null), 3000)
    setDeleting(null)
    if (selectedRoom?.id === roomId) { setView('list'); setSelectedRoom(null) }
  }

  /* ── Render ── */

  if (loading) {
    return <div className="flex items-center justify-center py-2xl"><p className="text-sm text-neutral-400">Loading rooms…</p></div>
  }

  const tenantName = selectedRoom?.tenancy ? tenantDisplayName(selectedRoom.tenancy.person) : null

  return (
    <div>
      {/* Toast messages */}
      {error && (
        <div className="mb-lg p-md rounded-lg bg-red-50 border border-red-200">
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={() => setError(null)} className="text-xs text-red-500 mt-xs">Dismiss</button>
        </div>
      )}
      {success && (
        <div className="mb-lg p-md rounded-lg bg-green-50 border border-green-200">
          <p className="text-sm text-green-700">✓ {success}</p>
        </div>
      )}

      {/* ── LIST VIEW ── */}
      {view === 'list' && (
        <div>
          <div className="flex items-center justify-between mb-lg">
            <p className="text-sm text-neutral-500">{rooms.length} room{rooms.length !== 1 ? 's' : ''} · {bedrooms} bedroom{bedrooms !== 1 ? 's' : ''} in record</p>
            <button
              onClick={() => setIsAddingRoom(true)}
              className="px-lg py-sm bg-neutral-900 text-white rounded-lg font-semibold text-sm hover:bg-neutral-700 transition"
            >
              + Add room
            </button>
          </div>

          {rooms.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-neutral-200 bg-neutral-50 p-xl text-center">
              <p className="text-sm font-semibold text-neutral-700 mb-sm">No rooms yet</p>
              <p className="text-xs text-neutral-400 mb-lg">Add rooms to start managing this property</p>
              <button onClick={() => setIsAddingRoom(true)} className="px-lg py-sm bg-neutral-900 text-white rounded-lg font-semibold text-sm hover:bg-neutral-700 transition">
                + Add room
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500 border-b border-neutral-200">
                    <th className="px-lg py-sm">Room</th>
                    <th className="px-lg py-sm hidden md:table-cell">Type</th>
                    <th className="px-lg py-sm">Tenant</th>
                    <th className="px-lg py-sm hidden sm:table-cell">Rent</th>
                    <th className="px-lg py-sm hidden lg:table-cell">Since</th>
                    <th className="px-lg py-sm text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rooms.map((room) => (
                    <tr
                      key={room.id}
                      onClick={() => openRoom(room)}
                      className="border-t border-neutral-100 hover:bg-neutral-50 cursor-pointer transition-colors"
                    >
                      <td className="px-lg py-md">
                        <p className="font-semibold text-neutral-900">{room.unit_code || room.name}</p>
                        {room.unit_code && <p className="text-xs text-neutral-400">{room.name}</p>}
                      </td>
                      <td className="px-lg py-md hidden md:table-cell text-neutral-500 text-xs">{room.room_type || '—'}</td>
                      <td className="px-lg py-md">
                        {room.currentTenant
                          ? <span className="font-medium text-neutral-900">{room.currentTenant.name || room.currentTenant.email}</span>
                          : <span className="text-neutral-400 italic">Vacant</span>}
                      </td>
                      <td className="px-lg py-md hidden sm:table-cell text-neutral-600">{fmtRent(room.tenancyInfo?.rent_amount)}</td>
                      <td className="px-lg py-md hidden lg:table-cell text-neutral-400 text-xs">{fmtDate(room.tenancyInfo?.start_date)}</td>
                      <td className="px-lg py-md text-right">{statusPill(room)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── ROOM DETAIL VIEW ── */}
      {view === 'room' && selectedRoom && (
        <div>
          {/* Breadcrumb */}
          <div className="flex items-center gap-xs text-sm mb-xl">
            <button onClick={() => { setView('list'); setSelectedRoom(null) }} className="text-blue-600 hover:underline font-medium">
              ← All rooms
            </button>
            <span className="text-neutral-300">/</span>
            <span className="text-neutral-900 font-semibold">{selectedRoom.unit_code || selectedRoom.name}</span>
          </div>

          {detailLoading ? (
            <div className="flex items-center justify-center py-2xl"><p className="text-sm text-neutral-400">Loading…</p></div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-xl">

              {/* Left: Tenant card */}
              <div className="space-y-lg">
                <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
                  <div className="px-xl py-lg border-b border-neutral-100">
                    <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Tenant</p>
                  </div>

                  {selectedRoom.tenancy?.person ? (
                    <div className="px-xl py-lg">
                      {/* Avatar + name */}
                      <div className="flex items-center gap-lg mb-xl">
                        <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-700 font-semibold text-base flex-shrink-0">
                          {initials(selectedRoom.tenancy.person)}
                        </div>
                        <div>
                          <p className="text-lg font-semibold text-neutral-900">{tenantName}</p>
                          <p className="text-sm text-neutral-400">{selectedRoom.tenancy.person.occupation || 'tenant'}</p>
                        </div>
                      </div>

                      {/* Contact */}
                      <div className="space-y-sm mb-xl">
                        <div className="flex items-center gap-sm">
                          <span className="w-4 text-neutral-300">@</span>
                          <span className="text-sm text-neutral-700">{selectedRoom.tenancy.person.email}</span>
                        </div>
                        {selectedRoom.tenancy.person.phone && (
                          <div className="flex items-center gap-sm">
                            <span className="w-4 text-neutral-300">📞</span>
                            <span className="text-sm text-neutral-700">{selectedRoom.tenancy.person.phone}</span>
                          </div>
                        )}
                      </div>

                      {/* Key tenancy facts */}
                      <div className="grid grid-cols-3 gap-md mb-xl">
                        <div>
                          <p className="text-xs text-neutral-400 mb-xs">Rent</p>
                          <p className="text-sm font-semibold text-neutral-900">{fmtRent(selectedRoom.tenancy.rent_amount)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-neutral-400 mb-xs">Since</p>
                          <p className="text-sm font-semibold text-neutral-900">{fmtDate(selectedRoom.tenancy.start_date)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-neutral-400 mb-xs">End date</p>
                          <p className="text-sm font-semibold text-neutral-900">{fmtDate(selectedRoom.tenancy.end_date) || 'Rolling'}</p>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-wrap gap-sm">
                        <button
                          onClick={() => router.push(`/admin/tenant/${selectedRoom.tenancy!.person?.id}`)}
                          className="px-lg py-sm text-sm font-semibold bg-neutral-900 text-white rounded-lg hover:bg-neutral-700 transition"
                        >
                          Open tenant profile →
                        </button>
                        <button
                          onClick={() => router.push(`/admin/tenant/${selectedRoom.tenancy!.person?.id}?tab=tenancy`)}
                          className="px-lg py-sm text-sm font-semibold border border-neutral-200 text-neutral-700 rounded-lg hover:bg-neutral-50 transition"
                        >
                          View tenancy details
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="px-xl py-xl text-center">
                      <p className="text-neutral-400 text-sm mb-lg">No current tenant</p>
                      <button className="px-lg py-sm text-sm font-semibold bg-neutral-900 text-white rounded-lg hover:bg-neutral-700 transition">
                        Assign tenant
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Room info + actions */}
              <div className="space-y-lg">
                <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
                  <div className="px-xl py-lg border-b border-neutral-100 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Room</p>
                    <button
                      onClick={() => setEditingRoom(selectedRoom)}
                      className="text-xs text-blue-600 hover:underline font-medium"
                    >
                      Edit
                    </button>
                  </div>
                  <div className="px-xl py-lg">
                    <div className="grid grid-cols-2 gap-lg mb-lg">
                      <div>
                        <p className="text-xs text-neutral-400 mb-xs">Unit code</p>
                        <p className="text-sm font-semibold text-neutral-900">{selectedRoom.unit_code || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-neutral-400 mb-xs">Room name</p>
                        <p className="text-sm font-semibold text-neutral-900">{selectedRoom.name}</p>
                      </div>
                      <div>
                        <p className="text-xs text-neutral-400 mb-xs">Room type</p>
                        <p className="text-sm font-semibold text-neutral-900">{selectedRoom.room_type || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-neutral-400 mb-xs">Status</p>
                        <div>{statusPill(selectedRoom)}</div>
                      </div>
                    </div>
                    {selectedRoom.description && (
                      <p className="text-sm text-neutral-500">{selectedRoom.description}</p>
                    )}
                  </div>
                </div>

                {/* Quick links to room page sections */}
                <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
                  <div className="px-xl py-lg border-b border-neutral-100">
                    <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Room dashboard</p>
                  </div>
                  <div className="divide-y divide-neutral-100">
                    {['Overview', 'Maintenance', 'Lettings', 'Photos', 'Compliance', 'Notes'].map((section) => (
                      <button
                        key={section}
                        onClick={() => router.push(`/admin/properties/${propertyId}/rooms/${selectedRoom.id}`)}
                        className="w-full flex items-center justify-between px-xl py-md text-sm text-neutral-700 hover:bg-neutral-50 transition"
                      >
                        <span>{section}</span>
                        <span className="text-neutral-300">→</span>
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => handleDeleteRoom(selectedRoom.id, selectedRoom.name)}
                  disabled={deleting === selectedRoom.id}
                  className="text-xs text-red-400 hover:text-red-600 transition disabled:opacity-50"
                >
                  {deleting === selectedRoom.id ? 'Deleting…' : 'Delete this room'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

            {/* ── ADD ROOM MODAL ── */}
      {isAddingRoom && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-lg">
          <div className="bg-white rounded-xl shadow-xl p-xl max-w-md w-full border border-neutral-200">
            <h3 className="text-lg font-semibold text-neutral-900 mb-lg">Add room</h3>
            <div className="space-y-lg">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-sm block">Room name *</label>
                <input
                  type="text"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="e.g. Room 1, Bedroom 3"
                  className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 text-neutral-900"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-sm block">Description (optional)</label>
                <textarea
                  value={newRoomDescription}
                  onChange={(e) => setNewRoomDescription(e.target.value)}
                  placeholder="e.g. Double room with en-suite"
                  className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 text-neutral-900"
                  rows={3}
                />
              </div>
            </div>
            <div className="flex gap-md mt-xl">
              <button onClick={() => { setIsAddingRoom(false); setNewRoomName(''); setNewRoomDescription(''); setError(null) }} className="flex-1 px-lg py-sm border border-neutral-200 text-neutral-700 rounded-lg font-semibold text-sm hover:bg-neutral-50 transition">Cancel</button>
              <button onClick={handleAddRoom} className="flex-1 px-lg py-sm bg-neutral-900 text-white rounded-lg font-semibold text-sm hover:bg-neutral-700 transition">Create room</button>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT ROOM MODAL ── */}
      {editingRoom && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-lg">
          <div className="bg-white rounded-xl shadow-xl p-xl max-w-md w-full border border-neutral-200">
            <h3 className="text-lg font-semibold text-neutral-900 mb-lg">Edit room</h3>
            <div className="space-y-lg">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-sm block">Room name *</label>
                <input
                  type="text"
                  value={editingRoom.name}
                  onChange={(e) => setEditingRoom({ ...editingRoom, name: e.target.value })}
                  className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 text-neutral-900"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-sm block">Unit code</label>
                <input
                  type="text"
                  value={editingRoom.unit_code || ''}
                  onChange={(e) => setEditingRoom({ ...editingRoom, unit_code: e.target.value })}
                  placeholder="e.g. CR-001-R1"
                  className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 text-neutral-900"
                />
                <p className="text-xs text-amber-600 mt-xs">⚠ Only update if essential — unit codes rarely change.</p>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-sm block">Description</label>
                <textarea
                  value={editingRoom.description || ''}
                  onChange={(e) => setEditingRoom({ ...editingRoom, description: e.target.value })}
                  className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 text-neutral-900"
                  rows={3}
                />
              </div>
            </div>
            <div className="flex gap-md mt-xl">
              <button onClick={() => { setEditingRoom(null); setError(null) }} className="flex-1 px-lg py-sm border border-neutral-200 text-neutral-700 rounded-lg font-semibold text-sm hover:bg-neutral-50 transition">Cancel</button>
              <button onClick={handleUpdateRoom} className="flex-1 px-lg py-sm bg-neutral-900 text-white rounded-lg font-semibold text-sm hover:bg-neutral-700 transition">Save changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
