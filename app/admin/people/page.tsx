'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AppBar from '@/components/AppBar'

type Tab = 'tenants' | 'staff' | 'landlords' | 'administrators'

interface Person {
  id: string
  email: string
  full_name?: string
  name?: string
  role: string
  property_id?: string
  room_id?: string
  created_at: string
}

interface Property {
  id: string
  name: string
  address: string
  rooms: { id: string; name: string; tenants: Person[] }[]
}

interface Landlord {
  id: string
  email: string
  full_name?: string
  name?: string
  created_at: string
  properties?: Array<{ id: string; name: string; address: string }>
}

interface Statement {
  id: string
  statement_reference: string
  statement_date: string
  net_to_landlord: number
  property_id: string
  landlord_id: string
  properties?: { name: string; address: string }
}

function NotifyBadge({ on }: { on: boolean }) {
  return (
    <span
      className={`shrink-0 rounded-full px-sm py-xs text-[11px] font-semibold ${
        on ? 'bg-green-100 text-green-800' : 'bg-neutral-100 text-neutral-400'
      }`}
      title={on ? 'Notifications on' : 'Notifications off'}
    >
      {on ? '🔔 On' : '🔕 Off'}
    </span>
  )
}

export default function PeopleManagement() {
  const router = useRouter()
  const supabase = createClient()

  // Shared state
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('tenants')
  const [people, setPeople] = useState<Person[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [notifyOn, setNotifyOn] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Add Person form
  const [showAddPerson, setShowAddPerson] = useState(false)
  const [formData, setFormData] = useState({ email: '', role: 'tenant', property_id: '', name: '', full_name: '' })

  // Landlords tab state
  const [landlords, setLandlords] = useState<Landlord[]>([])
  const [showAddLandlord, setShowAddLandlord] = useState(false)
  const [landlordForm, setLandlordForm] = useState({ email: '', name: '', selectedProperties: [] as string[] })
  const [landlordSuccessMessage, setLandlordSuccessMessage] = useState('')
  const [statements, setStatements] = useState<Statement[]>([])

  // Initialize data
  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      if (!data || (data.assignment?.role !== 'administrator' && data.assignment?.role !== 'admin')) {
        router.push('/login')
        return
      }

      const { data: peopleData } = await supabase.from('people').select('*').order('created_at', { ascending: false })
      const { data: propsData } = await supabase.from('properties').select('id, name, address')
      const { data: roomsData } = await supabase.from('rooms').select('id, name, property_id')
      const { data: subsData } = await supabase.from('push_subscriptions').select('person_id, email')

      setPeople(peopleData || [])

      // Who has push notifications
      const on = new Set<string>()
      const byEmail = new Map((peopleData || []).map((p: any) => [p.email, p.id]))
      ;(subsData || []).forEach((s: any) => {
        if (s.person_id) on.add(s.person_id)
        else if (s.email && byEmail.has(s.email)) on.add(byEmail.get(s.email)!)
      })
      setNotifyOn(on)

      // Organize properties by rooms (for tenant view)
      const propMap: Record<string, Property> = {}
      const roomMap = Object.fromEntries((roomsData || []).map((r: any) => [r.id, r]))
      const propsMap = Object.fromEntries((propsData || []).map((p: any) => [p.id, p]))

      ;(peopleData || []).forEach((person: any) => {
        if (person.role !== 'tenant') return
        const propId = person.property_id || 'unassigned'
        const propName = propId === 'unassigned' ? 'Unassigned Tenants' : propsMap[propId]?.name || 'Property'

        if (!propMap[propId]) {
          propMap[propId] = {
            id: propId,
            name: propName,
            address: propId === 'unassigned' ? 'No property assigned' : propsMap[propId]?.address || '',
            rooms: [],
          }
        }

        const roomId = person.room_id || 'common'
        const roomName = roomId === 'common' ? 'Common area' : roomMap[roomId]?.name || 'Room'

        const roomIndex = propMap[propId].rooms.findIndex((r) => r.id === roomId)
        if (roomIndex === -1) {
          propMap[propId].rooms.push({ id: roomId, name: roomName, tenants: [person] })
        } else {
          propMap[propId].rooms[roomIndex].tenants.push(person)
        }
      })

      const roomNum = (name: string) => {
        const m = name.match(/\d+/)
        return m ? parseInt(m[0], 10) : 9999
      }
      Object.values(propMap).forEach((p) =>
        p.rooms.sort((a, b) => roomNum(a.name) - roomNum(b.name) || a.name.localeCompare(b.name))
      )

      setProperties(Object.values(propMap).sort((a, b) => a.name.localeCompare(b.name)))

      // Load landlords
      const { data: landlordData } = await supabase
        .from('people')
        .select('id, email, name, full_name, created_at')
        .eq('role', 'landlord')
        .order('created_at', { ascending: false })

      setLandlords(landlordData || [])

      // Load statements
      const { data: statementsData } = await supabase
        .from('landlord_statements')
        .select('id, statement_reference, statement_date, net_to_landlord, property_id, landlord_id, properties(name, address)')
        .order('statement_date', { ascending: false })

      setStatements((statementsData as any) || [])

      setLoading(false)
    }

    init()
  }, [router])

  // ==========================================================================
  // Add Person Handler
  // ==========================================================================

  async function handleAddPerson(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!formData.email || !formData.role) {
      setError('Email and role are required')
      return
    }

    try {
      const { error: err } = await supabase.from('people').insert([
        {
          email: formData.email,
          full_name: formData.full_name || formData.name || null,
          name: formData.name || null,
          role: formData.role,
          property_id: formData.property_id || null,
        },
      ])

      if (err) throw err

      setSuccess(`User ${formData.email} added successfully`)
      setFormData({ email: '', role: 'tenant', property_id: '', name: '', full_name: '' })
      setShowAddPerson(false)

      // Refresh
      const { data } = await supabase.from('people').select('*').order('created_at', { ascending: false })
      setPeople(data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add user')
    }
  }

  async function handleDeletePerson(id: string) {
    if (!confirm('Are you sure you want to delete this person?')) return

    try {
      const { error: err } = await supabase.from('people').delete().eq('id', id)
      if (err) throw err

      setSuccess('User deleted successfully')
      const { data } = await supabase.from('people').select('*').order('created_at', { ascending: false })
      setPeople(data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user')
    }
  }

  // ==========================================================================
  // Landlord Handlers
  // ==========================================================================

  async function handleAddLandlord() {
    if (!landlordForm.email || !landlordForm.name) {
      setError('Please fill in email and name')
      return
    }

    if (landlordForm.selectedProperties.length === 0) {
      setError('Please select at least one property')
      return
    }

    try {
      const { data: landlord, error } = await supabase
        .from('people')
        .insert({
          email: landlordForm.email,
          full_name: landlordForm.name,
          name: landlordForm.name,
          role: 'landlord',
        })
        .select()
        .single()

      if (error) throw error

      // Assign properties
      for (const propertyId of landlordForm.selectedProperties) {
        await supabase.from('landlord_properties').insert({
          landlord_id: landlord.id,
          property_id: propertyId,
        })
      }

      setLandlordSuccessMessage(`✓ Landlord added! Email: ${landlordForm.email}`)
      setLandlordForm({ email: '', name: '', selectedProperties: [] })
      setShowAddLandlord(false)

      // Refresh landlords
      const { data: landlordData } = await supabase
        .from('people')
        .select('id, email, name, full_name, created_at')
        .eq('role', 'landlord')
        .order('created_at', { ascending: false })

      setLandlords(landlordData || [])
      setTimeout(() => setLandlordSuccessMessage(''), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add landlord')
    }
  }

  const toggleLandlordProperty = (propertyId: string) => {
    setLandlordForm((prev) => ({
      ...prev,
      selectedProperties: prev.selectedProperties.includes(propertyId)
        ? prev.selectedProperties.filter((id) => id !== propertyId)
        : [...prev.selectedProperties, propertyId],
    }))
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar />
        <p className="p-xl text-sm text-neutral-400">Loading…</p>
      </div>
    )
  }

  const staffPeople = people.filter((p) => p.role === 'contractor' || p.role === 'cleaner')
  const adminPeople = people.filter((p) => p.role === 'administrator')

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar right={<Link href="/admin" className="min-w-0 truncate font-semibold text-white hover:text-white/80">Dashboard</Link>} />

      <main className="mx-auto max-w-6xl px-lg py-2xl">
        <div className="mb-2xl">
          <h1 className="text-3xl font-bold text-neutral-900 mb-sm">👥 People</h1>
          <p className="text-sm text-neutral-600 mb-lg">
            Manage tenants, contractors, cleaners, landlords, and administrators across all properties
          </p>

          {error && (
            <div className="mb-md rounded-xl border border-red-200 bg-red-50 p-md text-sm text-red-900">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-md rounded-xl border border-green-200 bg-green-50 p-md text-sm text-green-900">
              {success}
            </div>
          )}

          {/* Tab buttons */}
          <div className="flex gap-sm border-b border-neutral-300">
            {(['tenants', 'staff', 'landlords', 'administrators'] as const).map((tab) => {
              const labels = { tenants: '🏠 Tenants', staff: '👷 Staff', landlords: '🤝 Landlords', administrators: '⚙️ Admins' }
              const counts = {
                tenants: people.filter((p) => p.role === 'tenant').length,
                staff: staffPeople.length,
                landlords: landlords.length,
                administrators: adminPeople.length,
              }
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-lg py-md font-semibold transition ${
                    activeTab === tab
                      ? 'border-b-2 border-neutral-900 text-neutral-900'
                      : 'text-neutral-500 hover:text-neutral-700'
                  }`}
                >
                  {labels[tab]}
                  {counts[tab] > 0 && (
                    <span className="ml-sm inline-block rounded-full bg-neutral-900 text-white px-sm py-0 text-xs font-bold">
                      {counts[tab]}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* TENANTS TAB */}
        {activeTab === 'tenants' && (
          <div className="space-y-lg">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-neutral-900">Tenants by property</h2>
              <button
                onClick={() => {
                  setFormData({ email: '', role: 'tenant', property_id: '', name: '', full_name: '' })
                  setShowAddPerson(true)
                }}
                className="rounded-lg bg-neutral-900 px-md py-sm text-sm font-semibold text-white hover:bg-neutral-800"
              >
                + Add Tenant
              </button>
            </div>

            {showAddPerson && (
              <div className="rounded-2xl border border-neutral-200 bg-white p-lg">
                <h3 className="text-lg font-bold text-neutral-900 mb-md">Add New Tenant</h3>
                <form onSubmit={handleAddPerson} className="space-y-md">
                  <div className="grid grid-cols-2 gap-md">
                    <div>
                      <label className="block text-sm font-semibold text-neutral-700 mb-xs">Email</label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full rounded border border-neutral-300 px-md py-sm text-sm"
                        placeholder="tenant@example.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-neutral-700 mb-xs">Full Name</label>
                      <input
                        type="text"
                        value={formData.full_name}
                        onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                        className="w-full rounded border border-neutral-300 px-md py-sm text-sm"
                        placeholder="Jane Doe"
                      />
                    </div>
                  </div>
                  <div className="flex gap-md">
                    <button
                      type="submit"
                      className="rounded-lg bg-green-600 px-lg py-sm text-sm font-semibold text-white hover:bg-green-700"
                    >
                      Add Tenant
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddPerson(false)}
                      className="rounded-lg border border-neutral-300 px-lg py-sm text-sm font-semibold hover:bg-neutral-50"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {properties.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center">
                <p className="text-sm text-neutral-500">No tenants assigned yet</p>
              </div>
            ) : (
              <div className="space-y-lg">
                {properties.map((prop) => (
                  <div key={prop.id} className="rounded-2xl border border-neutral-200 bg-white overflow-hidden">
                    <div className="border-b border-neutral-200 bg-neutral-50 px-lg py-md">
                      <h3 className="font-bold text-neutral-900">{prop.name}</h3>
                      <p className="text-xs text-neutral-600 mt-xs">{prop.address}</p>
                    </div>
                    <div className="divide-y divide-neutral-200">
                      {prop.rooms.length === 0 ? (
                        <div className="px-lg py-md text-xs text-neutral-500">No rooms</div>
                      ) : (
                        prop.rooms.map((room) => (
                          <div key={room.id}>
                            <div className="px-lg py-md bg-neutral-50 text-xs font-semibold text-neutral-700">{room.name}</div>
                            {room.tenants.map((tenant) => (
                              <div key={tenant.id} className="flex items-center justify-between gap-md px-lg py-md hover:bg-neutral-50">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-neutral-900">{tenant.full_name || tenant.email}</p>
                                  <p className="text-xs text-neutral-500">{tenant.full_name ? tenant.email : ''}</p>
                                </div>
                                <div className="flex shrink-0 items-center gap-md">
                                  <NotifyBadge on={notifyOn.has(tenant.id)} />
                                  <button
                                    onClick={() => handleDeletePerson(tenant.id)}
                                    className="text-xs text-red-600 hover:text-red-700"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* STAFF TAB */}
        {activeTab === 'staff' && (
          <div className="space-y-lg">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-neutral-900">Contractors & Cleaners</h2>
              <button
                onClick={() => {
                  setFormData({ email: '', role: 'contractor', property_id: '', name: '', full_name: '' })
                  setShowAddPerson(true)
                }}
                className="rounded-lg bg-neutral-900 px-md py-sm text-sm font-semibold text-white hover:bg-neutral-800"
              >
                + Add Staff
              </button>
            </div>

            {showAddPerson && (
              <div className="rounded-2xl border border-neutral-200 bg-white p-lg">
                <h3 className="text-lg font-bold text-neutral-900 mb-md">Add New Staff Member</h3>
                <form onSubmit={handleAddPerson} className="space-y-md">
                  <div className="grid grid-cols-2 gap-md">
                    <div>
                      <label className="block text-sm font-semibold text-neutral-700 mb-xs">Email</label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full rounded border border-neutral-300 px-md py-sm text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-neutral-700 mb-xs">Role</label>
                      <select
                        value={formData.role}
                        onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                        className="w-full rounded border border-neutral-300 px-md py-sm text-sm"
                      >
                        <option value="contractor">Contractor</option>
                        <option value="cleaner">Cleaner</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-md">
                    <button
                      type="submit"
                      className="rounded-lg bg-green-600 px-lg py-sm text-sm font-semibold text-white hover:bg-green-700"
                    >
                      Add Staff
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddPerson(false)}
                      className="rounded-lg border border-neutral-300 px-lg py-sm text-sm font-semibold hover:bg-neutral-50"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {staffPeople.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center">
                <p className="text-sm text-neutral-500">No staff members added yet</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-neutral-200 bg-white divide-y divide-neutral-200">
                {staffPeople.map((person) => (
                  <div key={person.id} className="flex items-center justify-between gap-md px-lg py-md hover:bg-neutral-50">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-neutral-900">{person.full_name || person.email}</p>
                      <p className="text-xs text-neutral-500 mt-xs">{person.role === 'contractor' ? '👷 Contractor' : '🧹 Cleaner'}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-md">
                      <NotifyBadge on={notifyOn.has(person.id)} />
                      <button
                        onClick={() => handleDeletePerson(person.id)}
                        className="text-xs text-red-600 hover:text-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* LANDLORDS TAB */}
        {activeTab === 'landlords' && (
          <div className="space-y-lg">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-neutral-900">Landlords</h2>
                <p className="text-sm text-neutral-600 mt-xs">Manage landlords and their assigned properties. Statements below.</p>
              </div>
              <button
                onClick={() => setShowAddLandlord(!showAddLandlord)}
                className="rounded-lg bg-neutral-900 px-md py-sm text-sm font-semibold text-white hover:bg-neutral-800"
              >
                + Add Landlord
              </button>
            </div>

            {landlordSuccessMessage && (
              <div className="rounded-xl bg-green-100 p-md text-sm text-green-700 font-semibold">{landlordSuccessMessage}</div>
            )}

            {showAddLandlord && (
              <div className="rounded-2xl border-2 border-neutral-900 bg-white p-lg">
                <h3 className="text-lg font-bold text-neutral-900 mb-md">Add New Landlord</h3>
                <div className="grid gap-md md:grid-cols-2 mb-md">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-xs">Name</label>
                    <input
                      type="text"
                      placeholder="e.g. John Smith"
                      value={landlordForm.name}
                      onChange={(e) => setLandlordForm({ ...landlordForm, name: e.target.value })}
                      className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-xs">Email</label>
                    <input
                      type="email"
                      placeholder="john@example.com"
                      value={landlordForm.email}
                      onChange={(e) => setLandlordForm({ ...landlordForm, email: e.target.value })}
                      className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm"
                    />
                  </div>
                </div>

                <div className="mb-md">
                  <label className="block text-xs font-semibold text-neutral-700 mb-md">Select Properties</label>
                  <div className="grid gap-sm md:grid-cols-2 max-h-[300px] overflow-y-auto">
                    {properties.map((prop) => (
                      <label
                        key={prop.id}
                        className="flex items-start gap-sm p-md border border-neutral-200 rounded-lg cursor-pointer hover:bg-neutral-50"
                      >
                        <input
                          type="checkbox"
                          checked={landlordForm.selectedProperties.includes(prop.id)}
                          onChange={() => toggleLandlordProperty(prop.id)}
                          className="mt-xs"
                        />
                        <div>
                          <p className="font-semibold text-sm text-neutral-900">{prop.name}</p>
                          <p className="text-xs text-neutral-600">{prop.address}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-neutral-500 mt-md">
                    {landlordForm.selectedProperties.length} properties selected
                  </p>
                </div>

                <div className="flex gap-md">
                  <button
                    onClick={handleAddLandlord}
                    className="rounded-xl bg-neutral-900 px-lg py-sm text-sm font-bold text-white hover:bg-neutral-800"
                  >
                    Add Landlord
                  </button>
                  <button
                    onClick={() => setShowAddLandlord(false)}
                    className="rounded-xl border border-neutral-300 px-lg py-sm text-sm font-semibold hover:bg-neutral-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {landlords.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center">
                <p className="text-sm text-neutral-500">No landlords added yet</p>
              </div>
            ) : (
              <div className="space-y-md">
                {landlords.map((landlord) => (
                  <div key={landlord.id} className="rounded-2xl border border-neutral-200 bg-white p-lg hover:border-neutral-300 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-neutral-900">{landlord.full_name || landlord.name || landlord.email}</h3>
                        <p className="text-sm text-neutral-600">{landlord.email}</p>
                        <p className="text-xs text-neutral-500 mt-sm">
                          Added {new Date(landlord.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-neutral-700 bg-neutral-100 px-md py-xs rounded-full">
                        Landlord
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-2xl pt-lg border-t border-neutral-200">
              <h3 className="text-lg font-bold text-neutral-900 mb-md">Landlord Statements</h3>
              <p className="text-sm text-neutral-600 mb-lg">
                View all landlord statements. For detailed statement management and creation, use the full Statements page:
              </p>
              <Link
                href="/admin/statements"
                className="inline-block rounded-lg bg-neutral-900 px-lg py-md text-sm font-semibold text-white hover:bg-neutral-800"
              >
                → Manage Statements
              </Link>

              {statements.length === 0 ? (
                <div className="mt-lg rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center">
                  <p className="text-sm text-neutral-500">No statements uploaded yet</p>
                </div>
              ) : (
                <div className="mt-lg rounded-2xl border border-neutral-200 bg-white divide-y divide-neutral-200 max-h-[400px] overflow-y-auto">
                  {statements.map((stmt) => (
                    <div key={stmt.id} className="px-lg py-md hover:bg-neutral-50">
                      <div className="flex items-start justify-between gap-md">
                        <div className="min-w-0">
                          <p className="font-semibold text-neutral-900">{stmt.properties?.name || 'Unknown Property'}</p>
                          <p className="text-xs text-neutral-600 mt-xs">Ref: {stmt.statement_reference}</p>
                          <p className="text-xs text-neutral-500 mt-xs">
                            {new Date(stmt.statement_date).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold text-neutral-900">£{stmt.net_to_landlord.toFixed(2)}</p>
                          <p className="text-xs text-neutral-600">Net to landlord</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ADMINISTRATORS TAB */}
        {activeTab === 'administrators' && (
          <div className="space-y-lg">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-neutral-900">Administrators</h2>
              <button
                onClick={() => {
                  setFormData({ email: '', role: 'administrator', property_id: '', name: '', full_name: '' })
                  setShowAddPerson(true)
                }}
                className="rounded-lg bg-neutral-900 px-md py-sm text-sm font-semibold text-white hover:bg-neutral-800"
              >
                + Add Admin
              </button>
            </div>

            {showAddPerson && (
              <div className="rounded-2xl border border-neutral-200 bg-white p-lg">
                <h3 className="text-lg font-bold text-neutral-900 mb-md">Add New Administrator</h3>
                <form onSubmit={handleAddPerson} className="space-y-md">
                  <div>
                    <label className="block text-sm font-semibold text-neutral-700 mb-xs">Email</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full rounded border border-neutral-300 px-md py-sm text-sm"
                    />
                  </div>
                  <div className="flex gap-md">
                    <button
                      type="submit"
                      className="rounded-lg bg-green-600 px-lg py-sm text-sm font-semibold text-white hover:bg-green-700"
                    >
                      Add Admin
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddPerson(false)}
                      className="rounded-lg border border-neutral-300 px-lg py-sm text-sm font-semibold hover:bg-neutral-50"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {adminPeople.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center">
                <p className="text-sm text-neutral-500">No administrators added yet</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-neutral-200 bg-white divide-y divide-neutral-200">
                {adminPeople.map((person) => (
                  <div key={person.id} className="flex items-center justify-between gap-md px-lg py-md hover:bg-neutral-50">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-neutral-900">{person.full_name || person.email}</p>
                      <p className="text-xs text-neutral-500">Administrator</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-md">
                      <NotifyBadge on={notifyOn.has(person.id)} />
                      <button
                        onClick={() => handleDeletePerson(person.id)}
                        className="text-xs text-red-600 hover:text-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
