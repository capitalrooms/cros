'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import AppBar from '@/components/AppBar'
import Link from 'next/link'
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading'

type Tab = 'occupied' | 'available'

interface Property {
  id: string
  name: string
  address: string
}

interface Room {
  id: string
  name: string
  property_id: string
  status: 'occupied' | 'available' | 'on_notice'
}

interface Tenancy {
  id: string
  person_id: string
  room_id: string
  start_date: string
  end_date: string | null
  status: 'active' | 'on_notice' | 'available'
  rent_amount: number
  communication_preference: 'email' | 'text'
  opt_in_maintenance: boolean
  opt_in_viewings: boolean
  opt_in_appointments: boolean
  opt_in_cleaning: boolean
  person?: {
    id: string
    full_name: string
    email: string
    phone: string
  }
  room?: Room
  property?: Property
}

interface AvailableRoom {
  id: string
  name: string
  property_id: string
  property_name: string
  property_address: string
  current_asking_rent: number | null
  available_date: string | null
  marketing_status: string
  days_on_market: number | null
}

interface TenantPerson {
  full_name: string
  email: string
  phone: string
}

export default function LettingsPage() {
  const router = useRouter()
  const supabase = createClient()

  // Shared state
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('occupied')
  const [properties, setProperties] = useState<Property[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [tenancies, setTenancies] = useState<Tenancy[]>([])
  const [availableRooms, setAvailableRooms] = useState<AvailableRoom[]>([])

  // Add tenancy form state
  const [showAddTenancy, setShowAddTenancy] = useState(false)
  const [selectedProperty, setSelectedProperty] = useState<string>('')
  const [selectedRoom, setSelectedRoom] = useState<string>('')
  const [newTenant, setNewTenant] = useState<TenantPerson>({
    full_name: '',
    email: '',
    phone: '',
  })
  const [newTenancy, setNewTenancy] = useState({
    start_date: new Date().toISOString().split('T')[0],
    status: 'active' as 'active' | 'on_notice' | 'available',
    rent_amount: 0,
    communication_preference: 'email' as 'email' | 'text',
    opt_in_maintenance: true,
    opt_in_viewings: true,
    opt_in_appointments: true,
    opt_in_cleaning: true,
  })

  // Notice state
  const [noticeTenancy, setNoticeTenancy] = useState<Tenancy | null>(null)
  const [noticeDate, setNoticeDate] = useState('')
  const [savingNotice, setSavingNotice] = useState(false)

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      if (!data || (data.assignment?.role !== 'administrator' && data.assignment?.role !== 'admin')) {
        router.push('/login')
        return
      }

      await loadData()
    }
    init()
  }, [router])

  async function loadData() {
    // Fetch properties
    const { data: propsData } = await supabase.from('properties').select('id, name, address').order('name')

    // Fetch rooms
    const { data: roomsData } = await supabase.from('rooms').select('id, name, property_id, status').order('name')

    // Fetch tenancies
    const { data: tenanciesData } = await supabase
      .from('tenancies')
      .select('*, people(id, full_name, email, phone), rooms(id, name, property_id, status), properties(id, name, address)')
      .order('start_date', { ascending: false })

    // Fetch available rooms
    const { data: availableData } = await supabase
      .from('rooms')
      .select('id, name, property_id, current_asking_rent, available_date, marketing_status, days_on_market, properties(name, address)')
      .eq('status', 'available')
      .order('available_date', { ascending: true })

    setProperties(propsData || [])
    setRooms(roomsData || [])
    setTenancies((tenanciesData as any) || [])

    if (availableData) {
      const transformed = availableData.map((room: any) => ({
        id: room.id,
        name: room.name,
        property_id: room.property_id,
        property_name: room.properties?.name || 'Unknown',
        property_address: room.properties?.address || '',
        current_asking_rent: room.current_asking_rent,
        available_date: room.available_date,
        marketing_status: room.marketing_status,
        days_on_market: room.days_on_market,
      }))
      setAvailableRooms(transformed)
    }

    setLoading(false)
  }

  const handleAddTenancy = async () => {
    if (!selectedRoom || !newTenant.full_name || !newTenant.email) {
      alert('Please fill in all required fields')
      return
    }

    try {
      // 1. Create or find person
      let personId: string
      const { data: existingPerson } = await supabase
        .from('people')
        .select('id')
        .eq('email', newTenant.email)
        .single()

      if (existingPerson) {
        personId = existingPerson.id
        await supabase
          .from('people')
          .update({
            full_name: newTenant.full_name,
            phone: newTenant.phone,
          })
          .eq('id', personId)
      } else {
        const { data: newPerson, error: personError } = await supabase
          .from('people')
          .insert([
            {
              full_name: newTenant.full_name,
              email: newTenant.email,
              phone: newTenant.phone,
              role: 'tenant',
            },
          ])
          .select()
          .single()

        if (personError) throw personError
        personId = newPerson.id
      }

      // 2. Create tenancy
      const { error: tenancyError } = await supabase.from('tenancies').insert([
        {
          person_id: personId,
          room_id: selectedRoom,
          start_date: newTenancy.start_date,
          status: newTenancy.status,
          rent_amount: newTenancy.rent_amount,
          communication_preference: newTenancy.communication_preference,
          opt_in_maintenance: newTenancy.opt_in_maintenance,
          opt_in_viewings: newTenancy.opt_in_viewings,
          opt_in_appointments: newTenancy.opt_in_appointments,
          opt_in_cleaning: newTenancy.opt_in_cleaning,
        },
      ])

      if (tenancyError) throw tenancyError

      await loadData()
      setShowAddTenancy(false)
      setSelectedProperty('')
      setSelectedRoom('')
      setNewTenant({ full_name: '', email: '', phone: '' })
      setNewTenancy({
        start_date: new Date().toISOString().split('T')[0],
        status: 'active',
        rent_amount: 0,
        communication_preference: 'email',
        opt_in_maintenance: true,
        opt_in_viewings: true,
        opt_in_appointments: true,
        opt_in_cleaning: true,
      })
      alert('✅ Tenancy created')
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown error'))
    }
  }

  const openNotice = (tenancy: Tenancy) => {
    const d = new Date()
    d.setMonth(d.getMonth() + 1)
    setNoticeDate(tenancy.end_date || d.toISOString().split('T')[0])
    setNoticeTenancy(tenancy)
  }

  const handleSetNotice = async () => {
    if (!noticeTenancy || !noticeDate) return
    setSavingNotice(true)
    try {
      const { error } = await supabase.from('tenancies').update({ end_date: noticeDate }).eq('id', noticeTenancy.id)
      if (error) throw error
      setNoticeTenancy(null)
      setNoticeDate('')
      await loadData()
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setSavingNotice(false)
    }
  }

  const handleCancelNotice = async (tenancyId: string) => {
    if (!confirm('Clear the move-out date? The room will stop being marketed as available.')) return
    try {
      const { error } = await supabase.from('tenancies').update({ end_date: null }).eq('id', tenancyId)
      if (error) throw error
      await loadData()
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown error'))
    }
  }

  const handleDeleteTenancy = async (tenancyId: string) => {
    if (!confirm('Delete this tenancy?')) return
    try {
      const { error } = await supabase.from('tenancies').delete().eq('id', tenancyId)
      if (error) throw error
      await loadData()
      alert('✅ Tenancy deleted')
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown error'))
    }
  }

  const filteredRooms = selectedProperty ? rooms.filter((r) => r.property_id === selectedProperty) : []

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-'
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  if (loading) return <GenericPageSkeleton />

  const activeTenancies = tenancies.filter((t) => t.status === 'active')
  const onNoticeTenancies = tenancies.filter((t) => t.status === 'on_notice')

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar right={<Link href="/admin" className="min-w-0 truncate font-semibold text-white hover:text-white/80">Dashboard</Link>} />

      <main className="mx-auto max-w-6xl px-lg py-2xl">
        <div className="mb-2xl">
          <h1 className="text-3xl font-bold text-neutral-900">🚪 Lettings</h1>
          <p className="mt-sm text-sm text-neutral-600 mb-lg">Manage occupied rooms and available properties</p>

          {/* Tab buttons */}
          <div className="flex gap-sm border-b border-neutral-300">
            <button
              onClick={() => setActiveTab('occupied')}
              className={`px-lg py-md font-semibold transition ${
                activeTab === 'occupied'
                  ? 'border-b-2 border-neutral-900 text-neutral-900'
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              👥 Occupied
              {(activeTenancies.length + onNoticeTenancies.length > 0) && (
                <span className="ml-sm inline-block rounded-full bg-neutral-900 text-white px-sm py-0 text-xs font-bold">
                  {activeTenancies.length + onNoticeTenancies.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('available')}
              className={`px-lg py-md font-semibold transition ${
                activeTab === 'available'
                  ? 'border-b-2 border-neutral-900 text-neutral-900'
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              🔑 Available
              {availableRooms.length > 0 && (
                <span className="ml-sm inline-block rounded-full bg-neutral-900 text-white px-sm py-0 text-xs font-bold">
                  {availableRooms.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* OCCUPIED TAB */}
        {activeTab === 'occupied' && (
          <div className="space-y-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-neutral-900">Active & On Notice</h2>
              <button
                onClick={() => setShowAddTenancy(true)}
                className="rounded-lg bg-neutral-900 px-lg py-md text-sm font-bold text-white hover:bg-neutral-800"
              >
                + Add Tenancy
              </button>
            </div>

            {/* Add Tenancy Modal */}
            {showAddTenancy && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                <div className="rounded-2xl bg-white p-lg max-w-2xl w-full mx-lg max-h-[90vh] overflow-y-auto">
                  <h2 className="text-xl font-bold text-neutral-900 mb-lg">Add Tenancy</h2>

                  <div className="space-y-lg">
                    <div>
                      <h3 className="font-semibold text-neutral-900 mb-md">1. Select Room</h3>
                      <div className="space-y-md">
                        <div>
                          <label className="block text-sm font-medium text-neutral-700 mb-xs">Property *</label>
                          <select
                            value={selectedProperty}
                            onChange={(e) => {
                              setSelectedProperty(e.target.value)
                              setSelectedRoom('')
                            }}
                            className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm"
                          >
                            <option value="">Choose property...</option>
                            {properties.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} • {p.address}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-neutral-700 mb-xs">Room *</label>
                          <select
                            value={selectedRoom}
                            onChange={(e) => setSelectedRoom(e.target.value)}
                            disabled={!selectedProperty}
                            className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm disabled:opacity-50"
                          >
                            <option value="">Choose room...</option>
                            {filteredRooms.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name} • {r.status}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="font-semibold text-neutral-900 mb-md">2. Tenant Contact Info</h3>
                      <div className="space-y-sm">
                        <input
                          type="text"
                          placeholder="Full name *"
                          value={newTenant.full_name}
                          onChange={(e) => setNewTenant({ ...newTenant, full_name: e.target.value })}
                          className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm"
                        />
                        <input
                          type="email"
                          placeholder="Email *"
                          value={newTenant.email}
                          onChange={(e) => setNewTenant({ ...newTenant, email: e.target.value })}
                          className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm"
                        />
                        <input
                          type="tel"
                          placeholder="Phone"
                          value={newTenant.phone}
                          onChange={(e) => setNewTenant({ ...newTenant, phone: e.target.value })}
                          className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm"
                        />
                      </div>
                    </div>

                    <div>
                      <h3 className="font-semibold text-neutral-900 mb-md">3. Tenancy Details</h3>
                      <div className="space-y-sm">
                        <div className="grid grid-cols-2 gap-sm">
                          <div>
                            <label className="block text-xs font-medium text-neutral-700 mb-xs">Start Date</label>
                            <input
                              type="date"
                              value={newTenancy.start_date}
                              onChange={(e) => setNewTenancy({ ...newTenancy, start_date: e.target.value })}
                              className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-neutral-700 mb-xs">Rent (£pcm)</label>
                            <input
                              type="number"
                              placeholder="0"
                              value={newTenancy.rent_amount}
                              onChange={(e) => setNewTenancy({ ...newTenancy, rent_amount: Number(e.target.value) })}
                              className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-md">
                      <button
                        onClick={handleAddTenancy}
                        className="flex-1 rounded-lg bg-green-600 px-lg py-sm text-sm font-bold text-white hover:bg-green-700"
                      >
                        Add Tenancy
                      </button>
                      <button
                        onClick={() => setShowAddTenancy(false)}
                        className="rounded-lg border border-neutral-300 px-lg py-sm text-sm font-semibold hover:bg-neutral-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Notice Modal */}
            {noticeTenancy && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                <div className="rounded-2xl bg-white p-lg max-w-md w-full mx-lg">
                  <h2 className="text-xl font-bold text-neutral-900 mb-lg">Set Move-Out Date</h2>
                  <p className="text-sm text-neutral-600 mb-lg">
                    When should {noticeTenancy.person?.full_name} move out?
                  </p>

                  <input
                    type="date"
                    value={noticeDate}
                    onChange={(e) => setNoticeDate(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm mb-lg"
                  />

                  <div className="flex gap-md">
                    <button
                      onClick={handleSetNotice}
                      disabled={savingNotice}
                      className="flex-1 rounded-lg bg-blue-600 px-lg py-sm text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {savingNotice ? 'Saving...' : 'Set Notice'}
                    </button>
                    <button
                      onClick={() => setNoticeTenancy(null)}
                      className="rounded-lg border border-neutral-300 px-lg py-sm text-sm font-semibold hover:bg-neutral-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTenancies.length === 0 && onNoticeTenancies.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center">
                <p className="text-sm text-neutral-500">No active tenancies</p>
              </div>
            ) : (
              <div className="space-y-lg">
                {/* Active Tenancies */}
                {activeTenancies.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold text-neutral-900 mb-sm">Active Tenancies ({activeTenancies.length})</h3>
                    <div className="space-y-sm">
                      {activeTenancies.map((tenancy) => (
                        <div key={tenancy.id} className="rounded-lg border border-neutral-200 bg-white p-md">
                          <div className="flex items-start justify-between gap-md mb-sm">
                            <div className="min-w-0">
                              <p className="font-bold text-neutral-900">{tenancy.person?.full_name}</p>
                              <p className="text-xs text-neutral-600">
                                {tenancy.room?.name}, {tenancy.property?.name}
                              </p>
                              <p className="text-xs text-neutral-500 mt-xs">
                                £{tenancy.rent_amount}/month • Since {formatDate(tenancy.start_date)}
                              </p>
                            </div>
                            <div className="flex gap-sm shrink-0">
                              <button
                                onClick={() => openNotice(tenancy)}
                                className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                              >
                                Set Notice
                              </button>
                              <button
                                onClick={() => handleDeleteTenancy(tenancy.id)}
                                className="text-xs font-semibold text-red-600 hover:text-red-800"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* On Notice Tenancies */}
                {onNoticeTenancies.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold text-orange-900 mb-sm">On Notice ({onNoticeTenancies.length})</h3>
                    <div className="space-y-sm">
                      {onNoticeTenancies.map((tenancy) => (
                        <div key={tenancy.id} className="rounded-lg border border-orange-200 bg-orange-50 p-md">
                          <div className="flex items-start justify-between gap-md">
                            <div className="min-w-0">
                              <p className="font-bold text-neutral-900">{tenancy.person?.full_name}</p>
                              <p className="text-xs text-neutral-600">
                                {tenancy.room?.name}, {tenancy.property?.name}
                              </p>
                              <p className="text-xs text-orange-700 font-semibold mt-xs">
                                Moving out: {formatDate(tenancy.end_date)}
                              </p>
                            </div>
                            <button
                              onClick={() => handleCancelNotice(tenancy.id)}
                              className="text-xs font-semibold text-red-600 hover:text-red-800 shrink-0"
                            >
                              Cancel Notice
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* AVAILABLE TAB */}
        {activeTab === 'available' && (
          <div>
            <h2 className="text-xl font-bold text-neutral-900 mb-lg">Available Rooms</h2>

            {availableRooms.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center">
                <p className="text-sm text-neutral-500">No available rooms</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-neutral-200 bg-white overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-neutral-200 bg-neutral-50">
                      <th className="px-lg py-md text-left text-sm font-semibold text-neutral-900">Property & Room</th>
                      <th className="px-lg py-md text-left text-sm font-semibold text-neutral-900">Available Date</th>
                      <th className="px-lg py-md text-left text-sm font-semibold text-neutral-900">Rent (£pcm)</th>
                      <th className="px-lg py-md text-center text-sm font-semibold text-neutral-900">Days on Market</th>
                    </tr>
                  </thead>
                  <tbody>
                    {availableRooms.map((room, idx) => (
                      <tr key={room.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-neutral-50'}>
                        <td className="px-lg py-md text-sm text-neutral-900">
                          <p className="font-medium">{room.name}</p>
                          <p className="text-xs text-neutral-600">{room.property_address}</p>
                        </td>
                        <td className="px-lg py-md text-sm text-neutral-600">{formatDate(room.available_date)}</td>
                        <td className="px-lg py-md text-sm font-medium text-neutral-900">
                          £{room.current_asking_rent?.toLocaleString() || '-'}
                        </td>
                        <td className="px-lg py-md text-sm text-center text-neutral-600">
                          {room.days_on_market || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
