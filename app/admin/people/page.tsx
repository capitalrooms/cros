'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'
import EditPersonModal from '../components/EditPersonModal'
import { displayName, landlordName, nameFields } from '@/lib/people'
import NameInput, { emptyName, toFullName, type NameValue } from '@/app/components/NameInput'
import { sortPropertiesNumerically } from '@/lib/sortProperties'

type Tab = 'tenants' | 'staff' | 'landlords' | 'administrators'

interface Person {
  id: string
  email: string
  first_name?: string
  last_name?: string
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
  first_name?: string
  last_name?: string
  joint_salutation?: string
  joint_first_name?: string
  joint_last_name?: string
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
  const [formData, setFormData] = useState({
    email: '', role: 'tenant', property_id: '', salutation: '', first_name: '', middle_name: '', last_name: '', phone: '',
    // Extended details
    date_of_birth: '', nationality: '', occupation: '', employer_name: '', annual_income: '',
    previous_address: '', how_heard: '',
    emergency_contact_name: '', emergency_contact_phone: '', emergency_contact_relationship: '',
    guarantor_name: '', guarantor_email: '', guarantor_phone: '',
    notes: '',
  })
  const [showExtendedDetails, setShowExtendedDetails] = useState(false)

  // Edit Person modal
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)

  // Landlords tab state
  const [landlords, setLandlords] = useState<Landlord[]>([])
  const [showAddLandlord, setShowAddLandlord] = useState(false)
  const [emergencyNm, setEmergencyNm] = useState<NameValue>(emptyName())
  const [guarantorNm, setGuarantorNm] = useState<NameValue>(emptyName())
  const [landlordForm, setLandlordForm] = useState({ email: '', salutation: '', first_name: '', last_name: '', company: '', company_number: '', selectedProperties: [] as string[] })
  const [landlord2Form, setLandlord2Form] = useState({ salutation: '', first_name: '', last_name: '', email: '' })
  const [hasJointLandlord, setHasJointLandlord] = useState(false)
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

      setProperties(sortPropertiesNumerically(Object.values(propMap)))

      // Load landlords
      const { data: landlordData } = await supabase
        .from('people')
        .select('*')
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
          ...nameFields(formData.first_name, formData.last_name, formData.role === 'tenant' ? formData.middle_name : undefined),
          salutation: formData.salutation || null,
          phone: formData.phone || null,
          date_of_birth: formData.date_of_birth || null,
          nationality: formData.nationality || null,
          occupation: formData.occupation || null,
          annual_income: formData.annual_income || null,
          role: formData.role,
          property_id: formData.property_id || null,
        },
      ])

      if (err) throw err

      setSuccess(`User ${formData.email} added successfully`)
      setEmergencyNm(emptyName()); setGuarantorNm(emptyName())
      setFormData({
        email: '', role: 'tenant', property_id: '', salutation: '', first_name: '', middle_name: '', last_name: '', phone: '',
        date_of_birth: '', nationality: '', occupation: '', employer_name: '', annual_income: '',
        previous_address: '', how_heard: '',
        emergency_contact_name: '', emergency_contact_phone: '', emergency_contact_relationship: '',
        guarantor_name: '', guarantor_email: '', guarantor_phone: '',
        notes: '',
      })
      setShowExtendedDetails(false)
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
    setError('')
    if (!landlordForm.email || !landlordForm.first_name) {
      setError('Please fill in email and first name')
      return
    }
    const withJoint = hasJointLandlord && landlord2Form.first_name.trim() !== ''

    try {
      const insert: Record<string, unknown> = {
        email: landlordForm.email.trim(),
        ...nameFields(landlordForm.first_name, landlordForm.last_name),
        salutation: landlordForm.salutation || null,
        // a landlord who lets through their company: the person is the contact, the company owns the property
        company: landlordForm.company.trim() || null,
        company_number: landlordForm.company_number.trim() || null,
        role: 'landlord',
      }
      if (withJoint) {
        insert.joint_salutation = landlord2Form.salutation || null
        insert.joint_first_name = landlord2Form.first_name.trim()
        insert.joint_last_name = landlord2Form.last_name.trim() || null
        insert.joint_email = landlord2Form.email.trim() || null
      }

      const { data: landlord, error } = await supabase
        .from('people')
        .insert(insert)
        .select()
        .single()

      if (error) {
        if (/joint_/.test(error.message)) {
          throw new Error('joint landlord fields are not set up in the database yet — run migration 182 in the Supabase SQL Editor, then try again')
        }
        if (/duplicate key|already exists|people_email/i.test(error.message)) {
          throw new Error(`a person with the email ${landlordForm.email.trim()} already exists`)
        }
        throw new Error(error.message)
      }

      for (const propertyId of landlordForm.selectedProperties) {
        if (propertyId === 'unassigned') continue
        await supabase
          .from('properties')
          .update({ landlord_id: landlord.id })
          .eq('id', propertyId)
      }

      setLandlordSuccessMessage(`✓ Landlord added: ${landlordName(landlord)}`)
      setLandlordForm({ email: '', salutation: '', first_name: '', last_name: '', company: '', company_number: '', selectedProperties: [] })
      setLandlord2Form({ salutation: '', first_name: '', last_name: '', email: '' })
      setHasJointLandlord(false)
      setShowAddLandlord(false)

      const { data: landlordData } = await supabase
        .from('people')
        .select('*')
        .eq('role', 'landlord')
        .order('created_at', { ascending: false })

      setLandlords(landlordData || [])
      setTimeout(() => setLandlordSuccessMessage(''), 4000)
    } catch (err) {
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message
      setError(msg ? `Failed to add landlord: ${msg}` : 'Failed to add landlord')
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
        <AppBar left={<BackButton href="/admin" />} />
        <p className="p-xl text-sm text-neutral-400">Loading…</p>
      </div>
    )
  }

  const staffPeople = people.filter((p) => p.role === 'contractor' || p.role === 'cleaner' || p.role === 'lettings')
  const adminPeople = people.filter((p) => p.role === 'administrator')

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin" />} />
      <PageHero title="People" subtitle={<>Manage tenants, contractors, cleaners, landlords, and administrators across all properties</>} />

      <main className="mx-auto max-w-6xl px-lg py-xl">
        <div className="mb-2xl">

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
                  setFormData({ email: '', role: 'tenant', property_id: '', first_name: '', last_name: '' })
                  setShowAddPerson(true)
                }}
                className="rounded-lg bg-neutral-900 px-md py-sm text-sm font-semibold text-white hover:bg-neutral-800"
              >
                + Add Tenant
              </button>
            </div>

            {showAddPerson && (
              <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden">
                {/* Form header */}
                <div className="px-xl py-lg border-b border-neutral-100 bg-neutral-50">
                  <h3 className="text-base font-bold text-neutral-900">Register new tenant</h3>
                  <p className="text-xs text-neutral-400 mt-0.5">Core fields required · extended details can be added now or filled in later</p>
                </div>

                <form onSubmit={handleAddPerson} className="px-xl py-lg space-y-xl">

                  {/* ── CORE DETAILS ── */}
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-md">Identity</p>
                    <NameInput className="mb-md" required titleRequired withMiddle
                      value={{ salutation: formData.salutation, first_name: formData.first_name, middle_name: formData.middle_name, last_name: formData.last_name }}
                      onChange={n => setFormData({ ...formData, salutation: n.salutation, first_name: n.first_name, middle_name: n.middle_name ?? '', last_name: n.last_name })}
                      inputClass="w-full rounded-lg border border-neutral-300 bg-white px-md py-sm text-sm"
                      labelClass="block text-xs font-semibold text-neutral-600 mb-xs" />
                    <div className="grid grid-cols-2 gap-md">
                      <div>
                        <label className="block text-xs font-semibold text-neutral-600 mb-xs">Email <span className="text-red-500">*</span></label>
                        <input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })}
                          className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm" placeholder="jane@example.com" required />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-neutral-600 mb-xs">Mobile phone <span className="text-red-500">*</span></label>
                        <input type="tel" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })}
                          className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm" placeholder="07700 900000" required />
                      </div>
                    </div>
                  </div>

                  {/* ── EXTENDED DETAILS toggle ── */}
                  <div>
                    <button type="button" onClick={() => setShowExtendedDetails(v => !v)}
                      className="flex items-center gap-sm text-sm font-semibold text-blue-600 hover:text-blue-800 transition">
                      <span className={`transition-transform ${showExtendedDetails ? 'rotate-90' : ''}`}>▶</span>
                      {showExtendedDetails ? 'Hide extended details' : 'Add extended details'}
                      <span className="text-xs font-normal text-neutral-400 ml-xs">— date of birth, employment, address, emergency contact, guarantor, notes</span>
                    </button>

                    {showExtendedDetails && (
                      <div className="mt-lg space-y-xl">

                        {/* Personal */}
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-md">Personal details</p>
                          <div className="grid grid-cols-2 gap-md">
                            <div>
                              <label className="block text-xs font-semibold text-neutral-600 mb-xs">Date of birth</label>
                              <input type="date" value={formData.date_of_birth} onChange={e => setFormData({ ...formData, date_of_birth: e.target.value })}
                                className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm" />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-neutral-600 mb-xs">Nationality</label>
                              <input type="text" value={formData.nationality} onChange={e => setFormData({ ...formData, nationality: e.target.value })}
                                className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm" placeholder="e.g. British" />
                            </div>
                          </div>
                        </div>

                        {/* Employment */}
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-md">Employment</p>
                          <div className="grid grid-cols-2 gap-md mb-md">
                            <div>
                              <label className="block text-xs font-semibold text-neutral-600 mb-xs">Occupation / job title</label>
                              <input type="text" value={formData.occupation} onChange={e => setFormData({ ...formData, occupation: e.target.value })}
                                className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm" placeholder="e.g. Software Engineer" />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-neutral-600 mb-xs">Employer name</label>
                              <input type="text" value={formData.employer_name} onChange={e => setFormData({ ...formData, employer_name: e.target.value })}
                                className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm" placeholder="e.g. Acme Ltd" />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-neutral-600 mb-xs">Annual income (£)</label>
                            <input type="number" value={formData.annual_income} onChange={e => setFormData({ ...formData, annual_income: e.target.value })}
                              className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm" placeholder="e.g. 32000" />
                            <p className="text-[11px] text-neutral-400 mt-xs">Used for affordability checks. Rule of thumb: annual income ≥ 30× monthly rent.</p>
                          </div>
                        </div>

                        {/* Current / previous address */}
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-md">Current / previous address</p>
                          <textarea value={formData.previous_address} onChange={e => setFormData({ ...formData, previous_address: e.target.value })}
                            rows={3} placeholder="Address line 1&#10;Address line 2&#10;Postcode"
                            className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm resize-none" />
                        </div>

                        {/* How heard */}
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-md">Source</p>
                          <div>
                            <label className="block text-xs font-semibold text-neutral-600 mb-xs">How did they hear about us?</label>
                            <select value={formData.how_heard} onChange={e => setFormData({ ...formData, how_heard: e.target.value })}
                              className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm bg-white">
                              <option value="">— Select —</option>
                              {['Rightmove','Zoopla','SpareRoom','OpenRent','Referral / word of mouth','Social media','Direct inquiry','Viewing event','Other'].map(s => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Emergency contact */}
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-md">Emergency contact</p>
                          <div className="grid grid-cols-3 gap-md">
                            <div className="col-span-3">
                              <NameInput value={emergencyNm} onChange={n => { setEmergencyNm(n); setFormData({ ...formData, emergency_contact_name: toFullName(n) }) }}
                                inputClass="w-full rounded-lg border border-neutral-300 bg-white px-md py-sm text-sm" labelClass="block text-xs font-semibold text-neutral-600 mb-xs" />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-neutral-600 mb-xs">Phone</label>
                              <input type="tel" value={formData.emergency_contact_phone} onChange={e => setFormData({ ...formData, emergency_contact_phone: e.target.value })}
                                className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm" placeholder="07700 000000" />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-neutral-600 mb-xs">Relationship</label>
                              <input type="text" value={formData.emergency_contact_relationship} onChange={e => setFormData({ ...formData, emergency_contact_relationship: e.target.value })}
                                className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm" placeholder="e.g. Parent" />
                            </div>
                          </div>
                        </div>

                        {/* Guarantor */}
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-md">Guarantor <span className="normal-case font-normal text-neutral-400">(if applicable)</span></p>
                          <div className="grid grid-cols-3 gap-md">
                            <div className="col-span-3">
                              <NameInput value={guarantorNm} onChange={n => { setGuarantorNm(n); setFormData({ ...formData, guarantor_name: toFullName(n) }) }} withMiddle
                                inputClass="w-full rounded-lg border border-neutral-300 bg-white px-md py-sm text-sm" labelClass="block text-xs font-semibold text-neutral-600 mb-xs" />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-neutral-600 mb-xs">Email</label>
                              <input type="email" value={formData.guarantor_email} onChange={e => setFormData({ ...formData, guarantor_email: e.target.value })}
                                className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm" placeholder="guarantor@example.com" />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-neutral-600 mb-xs">Phone</label>
                              <input type="tel" value={formData.guarantor_phone} onChange={e => setFormData({ ...formData, guarantor_phone: e.target.value })}
                                className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm" placeholder="07700 000000" />
                            </div>
                          </div>
                        </div>

                        {/* Notes */}
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-md">Notes</p>
                          <textarea value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })}
                            rows={3} placeholder="Any additional notes about this tenant…"
                            className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm resize-none" />
                        </div>

                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-md pt-sm border-t border-neutral-100">
                    <button type="submit"
                      className="rounded-lg bg-green-600 px-xl py-sm text-sm font-semibold text-white hover:bg-green-700 transition">
                      Add Tenant
                    </button>
                    <button type="button" onClick={() => { setShowAddPerson(false); setShowExtendedDetails(false) }}
                      className="rounded-lg border border-neutral-300 px-xl py-sm text-sm font-semibold text-neutral-700 hover:bg-neutral-50 transition">
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
                              <div key={tenant.id} className="flex items-center justify-between gap-md px-lg py-md hover:bg-neutral-50 cursor-pointer"
                                onClick={() => router.push(`/admin/tenant/${tenant.id}`)}>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-neutral-900">{displayName(tenant) || tenant.email}</p>
                                  <p className="text-xs text-neutral-500">{(tenant.first_name || tenant.full_name) ? tenant.email : ''}</p>
                                </div>
                                <div className="flex shrink-0 items-center gap-sm">
                                  <NotifyBadge on={notifyOn.has(tenant.id)} />
                                  <Link
                                    href={`/tenant?as=${tenant.id}`}
                                    onClick={e => e.stopPropagation()}
                                    title="View tenant dashboard as this person"
                                    className="text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-sm py-xs rounded-lg transition-colors"
                                  >
                                    👁
                                  </Link>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleDeletePerson(tenant.id) }}
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
                  setFormData({ email: '', role: 'contractor', property_id: '', salutation: '', first_name: '', last_name: '' })
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
                  <div className="grid grid-cols-[100px_1fr_1fr] gap-md">
                    <div>
                      <label className="block text-sm font-semibold text-neutral-700 mb-xs">Salutation</label>
                      <select
                        value={formData.salutation}
                        onChange={(e) => setFormData({ ...formData, salutation: e.target.value })}
                        className="w-full rounded border border-neutral-300 px-md py-sm text-sm bg-white"
                      >
                        <option value="">—</option>
                        {['Mr','Mrs','Ms','Miss','Dr','Prof','Rev','Mx'].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-neutral-700 mb-xs">First Name</label>
                      <input type="text" value={formData.first_name} onChange={(e) => setFormData({ ...formData, first_name: e.target.value })} className="w-full rounded border border-neutral-300 px-md py-sm text-sm" placeholder="Jane" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-neutral-700 mb-xs">Last Name</label>
                      <input type="text" value={formData.last_name} onChange={(e) => setFormData({ ...formData, last_name: e.target.value })} className="w-full rounded border border-neutral-300 px-md py-sm text-sm" placeholder="Doe" />
                    </div>
                  </div>
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
                  <div
                    key={person.id}
                    onClick={() => router.push(`/admin/person/${person.id}`)}
                    className="w-full flex items-center justify-between gap-md px-lg py-md hover:bg-neutral-50 transition cursor-pointer"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-neutral-900">{displayName(person) || person.email}</p>
                      <p className="text-xs text-neutral-500 mt-xs">
                        {person.role === 'contractor' ? '👷 Contractor' : person.role === 'cleaner' ? '🧹 Cleaner' : '🔑 Lettings'}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-sm">
                      <NotifyBadge on={notifyOn.has(person.id)} />
                      <Link
                        href={
                          person.role === 'contractor' ? `/contractor?as=${person.id}` :
                          person.role === 'cleaner'    ? `/cleaner?as=${person.id}` :
                          person.role === 'lettings'   ? `/lettings?as=${person.id}` :
                          `/admin/view-as/${person.id}`
                        }
                        onClick={e => e.stopPropagation()}
                        title={`View ${person.role} dashboard as this person`}
                        className="text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-sm py-xs rounded-lg transition-colors"
                      >
                        👁
                      </Link>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeletePerson(person.id) }}
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
                <div className="grid gap-md md:grid-cols-4 mb-md">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-xs">Salutation</label>
                    <select
                      value={landlordForm.salutation}
                      onChange={(e) => setLandlordForm({ ...landlordForm, salutation: e.target.value })}
                      className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm bg-white"
                    >
                      <option value="">—</option>
                      {['Mr','Mrs','Ms','Miss','Dr','Prof','Rev','Mx'].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-xs">First Name</label>
                    <input
                      type="text"
                      placeholder="John"
                      value={landlordForm.first_name}
                      onChange={(e) => setLandlordForm({ ...landlordForm, first_name: e.target.value })}
                      className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-xs">Last Name</label>
                    <input
                      type="text"
                      placeholder="Smith"
                      value={landlordForm.last_name}
                      onChange={(e) => setLandlordForm({ ...landlordForm, last_name: e.target.value })}
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
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-xs">Company <span className="font-normal text-neutral-400">— if they own the property through a company</span></label>
                    <input
                      type="text"
                      placeholder="e.g. Ananya Property Holding Ltd"
                      value={landlordForm.company}
                      onChange={(e) => setLandlordForm({ ...landlordForm, company: e.target.value })}
                      className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-xs">Company number <span className="font-normal text-neutral-400">(optional)</span></label>
                    <input
                      type="text"
                      placeholder="e.g. 12345678"
                      value={landlordForm.company_number}
                      onChange={(e) => setLandlordForm({ ...landlordForm, company_number: e.target.value })}
                      className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm"
                    />
                  </div>
                </div>

                {/* Joint landlord */}
                <div className="mb-md">
                  {hasJointLandlord ? (
                    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-md">
                      <div className="flex items-center justify-between mb-md">
                        <span className="text-xs font-semibold text-neutral-700">Joint landlord <span className="font-normal text-neutral-400">— shares this landlord entry; both names appear on agreements and statements</span></span>
                        <button type="button" onClick={() => { setHasJointLandlord(false); setLandlord2Form({ salutation: '', first_name: '', last_name: '', email: '' }) }}
                          className="text-xs text-neutral-400 hover:text-red-500">Remove</button>
                      </div>
                      <div className="grid gap-md md:grid-cols-4">
                        <div>
                          <label className="block text-xs font-semibold text-neutral-700 mb-xs">Salutation</label>
                          <select value={landlord2Form.salutation} onChange={e => setLandlord2Form({ ...landlord2Form, salutation: e.target.value })}
                            className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm bg-white">
                            <option value="">—</option>
                            {['Mr','Mrs','Ms','Miss','Dr','Prof','Rev','Mx'].map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-neutral-700 mb-xs">First Name</label>
                          <input type="text" placeholder="Jane" value={landlord2Form.first_name}
                            onChange={e => setLandlord2Form({ ...landlord2Form, first_name: e.target.value })}
                            className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-neutral-700 mb-xs">Last Name</label>
                          <input type="text" placeholder="Smith" value={landlord2Form.last_name}
                            onChange={e => setLandlord2Form({ ...landlord2Form, last_name: e.target.value })}
                            className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-neutral-700 mb-xs">Email (optional)</label>
                          <input type="email" placeholder="jane@example.com" value={landlord2Form.email}
                            onChange={e => setLandlord2Form({ ...landlord2Form, email: e.target.value })}
                            className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm" />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setHasJointLandlord(true)}
                      className="text-xs text-neutral-500 hover:text-neutral-900 border border-dashed border-neutral-300 rounded-lg px-md py-xs font-semibold transition-colors w-full text-left">
                      + Add joint landlord
                    </button>
                  )}
                </div>

                <div className="mb-md">
                  <label className="block text-xs font-semibold text-neutral-700 mb-md">Select Properties <span className="font-normal text-neutral-400">(optional — can be assigned later)</span></label>
                  <div className="grid gap-sm md:grid-cols-2 max-h-[300px] overflow-y-auto">
                    {properties.filter(p => p.id !== 'unassigned').map((prop) => (
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

                {error && (
                  <div className="rounded-xl bg-red-50 border border-red-200 p-md text-sm text-red-700 mb-md">{error}</div>
                )}
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
                  <div key={landlord.id}
                    onClick={() => router.push(`/admin/landlord/${landlord.id}`)}
                    className="rounded-2xl border border-neutral-200 bg-white p-lg hover:border-neutral-400 transition-colors cursor-pointer">
                    <div className="flex items-start justify-between gap-md">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-bold text-neutral-900">{landlordName(landlord) !== '—' ? landlordName(landlord) : landlord.email}</h3>
                        <p className="text-sm text-neutral-600">{landlord.email}</p>
                        <p className="text-xs text-neutral-500 mt-xs">
                          Added {new Date(landlord.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-sm">
                        <Link
                          href={`/landlord?as=${landlord.id}`}
                          onClick={e => e.stopPropagation()}
                          title="View landlord dashboard as this person"
                          className="text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-sm py-xs rounded-lg transition-colors"
                        >
                          👁
                        </Link>
                        <span className="text-xs font-semibold text-neutral-700 bg-neutral-100 px-md py-xs rounded-full">
                          Landlord
                        </span>
                      </div>
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
                  setFormData({ email: '', role: 'administrator', property_id: '', salutation: '', first_name: '', last_name: '' })
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
                      <p className="text-sm font-medium text-neutral-900">{displayName(person) || person.email}</p>
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

        {/* Edit Person Modal */}
        {selectedPerson && (
          <EditPersonModal
            person={selectedPerson}
            isOpen={isEditModalOpen}
            onClose={() => {
              setIsEditModalOpen(false)
              setSelectedPerson(null)
            }}
            onSave={(updatedPerson) => {
              setPeople(people.map(p => p.id === updatedPerson.id ? updatedPerson : p))
              setIsEditModalOpen(false)
              setSelectedPerson(null)
            }}
          />
        )}
      </main>
    </div>
  )
}
