'use client'

import { use, useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import PageHero, { HeroButton } from '@/components/PageHero'
import { adminFetch } from '@/lib/adminFetch'
import { one, type PageSearchParams } from '@/lib/pageSearchParams'
import BackButton from '@/app/components/BackButton'
import EditPersonModal from '../components/EditPersonModal'
import { displayName, landlordName, nameFields } from '@/lib/people'
import NameInput, { emptyName, toFullName, type NameValue } from '@/app/components/NameInput'
import { sortPropertiesNumerically } from '@/lib/sortProperties'

type Tab = 'tenants' | 'contractors' | 'cleaners' | 'landlords' | 'office'
const TAB_FROM_URL: Record<string, Tab> = { tenants: 'tenants', contractors: 'contractors', cleaners: 'cleaners', landlords: 'landlords', staff: 'office', office: 'office', administrators: 'office' }

interface Person {
  id: string
  email: string
  salutation?: string
  phone?: string
  company?: string
  trade_types?: string[] | null
  landlord_comms_enabled?: boolean
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

export default function PeopleManagement({ searchParams }: { searchParams: PageSearchParams }) {
  const urlTab = TAB_FROM_URL[one(use(searchParams).tab) ?? ''] ?? 'tenants'
  const router = useRouter()
  const supabase = createClient()

  // Shared state
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>(urlTab)
  useEffect(() => { setActiveTab(urlTab) }, [urlTab])   // the rail's People links
  const [q, setQ] = useState('')
  const [menu, setMenu] = useState<string | null>(null)
  const [tenancyOf, setTenancyOf] = useState<Map<string, any>>(new Map())
  const [ownedBy, setOwnedBy] = useState<Map<string, string[]>>(new Map())
  const [emergency, setEmergency] = useState<Map<string, any>>(new Map())
  const [ecBusy, setEcBusy] = useState('')
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
      const { data: propsData } = await supabase.from('properties').select('id, name, address, landlord_id')
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

      // each tenant's current (or agreed) tenancy, each landlord's properties, who does emergency call-outs
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
      const { data: tens } = await supabase.from('tenancies').select('person_id, start_date, end_date, notice_received_date, let_cancelled_at, rooms(name), properties(id, name, address)')
        .is('let_cancelled_at', null).or(`end_date.is.null,end_date.gte.${today}`).order('start_date')
      setTenancyOf(new Map(((tens || []) as any[]).map(t => [t.person_id, t])))
      const owned = new Map<string, string[]>()
      for (const pr of sortPropertiesNumerically((propsData || []) as any[]) as any[]) if (pr.landlord_id) owned.set(pr.landlord_id, [...(owned.get(pr.landlord_id) ?? []), String(pr.name ?? '').split('\n')[0]])
      setOwnedBy(owned)
      const ec = await adminFetch('/api/admin/emergencies?only=list').then(r => r.json()).catch(() => ({ list: [] }))
      setEmergency(new Map(((ec.list ?? []) as any[]).map(c => [c.person_id, c])))

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

  async function toggleEmergency(personId: string, on: boolean) {
    setEcBusy(personId)
    const r = await adminFetch('/api/admin/emergencies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'toggle_contractor', personId, on }) })
    const d = await r.json().catch(() => ({}))
    setEcBusy('')
    if (!r.ok) { setError(d.error ?? 'Could not change that'); return }
    setEmergency(prev => { const n = new Map(prev); const cur = n.get(personId); n.set(personId, { ...(cur ?? { trades: d.trades ?? ['general'] }), person_id: personId, active: on }); return n })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar left={<BackButton href="/admin" />} />
        <PageHero eyebrow="People" title="People" subtitle="Loading…" />
      </div>
    )
  }

  const byRole = (...roles: string[]) => people.filter(p => roles.includes(p.role))
  const tenants = byRole('tenant'), contractors = byRole('contractor'), cleaners = byRole('cleaner'), office = byRole('administrator', 'admin', 'lettings')
  const needle = q.trim().toLowerCase()
  const match = (p: any, extra = '') => !needle || [displayName(p), p.full_name, p.email, p.phone, p.company, extra].some(v => String(v ?? '').toLowerCase().includes(needle))
  const firstLine = (v: unknown) => String(v ?? '').split('\n')[0]
  const ecOn = (id: string) => !!emergency.get(id)?.active
  const counts: Record<Tab, number> = { tenants: tenants.length, contractors: contractors.length, cleaners: cleaners.length, landlords: landlords.length, office: office.length }
  const LABEL: Record<Tab, string> = { tenants: 'Tenants', contractors: 'Contractors', cleaners: 'Cleaners', landlords: 'Landlords', office: 'Office' }
  const viewAs = (p: Person) => p.role === 'tenant' ? `/tenant?as=${p.id}` : p.role === 'contractor' ? `/contractor?as=${p.id}` : p.role === 'cleaner' ? `/cleaner?as=${p.id}` : p.role === 'lettings' ? `/lettings?as=${p.id}` : p.role === 'landlord' ? `/landlord?as=${p.id}` : null
  const profile = (p: Person) => p.role === 'tenant' ? `/admin/tenant/${p.id}` : p.role === 'landlord' ? `/admin/landlord/${p.id}` : p.role === 'contractor' ? `/admin/contractor/${p.id}` : `/admin/person/${p.id}`
  const startAdd = (role: string) => { setFormData({ ...formData, email: '', role, property_id: '', salutation: '', first_name: '', middle_name: '', last_name: '', phone: '' }); setShowAddPerson(true); setShowAddLandlord(false) }
  const tone = (role: string) => role === 'tenant' ? 'bg-sky-100 text-sky-800' : role === 'contractor' ? 'bg-amber-100 text-amber-800' : role === 'cleaner' ? 'bg-teal-100 text-teal-800' : role === 'landlord' ? 'bg-violet-100 text-violet-800' : 'bg-neutral-200 text-neutral-800'
  const initials = (p: any) => (displayName(p) !== '—' ? displayName(p) : p.email || '?').split(/\s+/).slice(0, 2).map((w: string) => w[0]?.toUpperCase()).join('')

  /** One person, one row: who, how to reach them, the details that matter for their role, and actions. */
  const Row = ({ p, detail, extra }: { p: Person; detail?: React.ReactNode; extra?: React.ReactNode }) => (
    <li className="relative grid grid-cols-[40px_minmax(0,1fr)_auto] md:grid-cols-[40px_minmax(0,1.3fr)_minmax(0,1.2fr)_150px_auto] items-center gap-x-md gap-y-0.5 px-lg py-sm hover:bg-neutral-50">
      <span className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold ${tone(p.role)}`}>{initials(p)}</span>
      <Link href={profile(p)} className="min-w-0 after:absolute after:inset-0 after:content-['']">
        <span className="block truncate text-sm font-semibold text-neutral-900">{p.role === 'landlord' ? landlordName(p as any) : [(p as any).salutation, displayName(p)].filter(x => x && x !== '—').join(' ') || p.email}</span>
        <span className="block truncate text-xs text-neutral-500">{p.email}</span>
      </Link>
      <span className="hidden md:block min-w-0 text-sm text-neutral-700">{detail}</span>
      <span className="hidden md:block text-xs tabular-nums text-neutral-600">{(p as any).phone || <span className="text-neutral-300">No phone</span>}</span>
      <span className="relative z-10 flex items-center justify-end gap-xs" data-row-menu>
        {extra}
        <span title={notifyOn.has(p.id) ? 'Notifications on' : 'Notifications off'} className={`hidden sm:inline-block h-2 w-2 rounded-full ${notifyOn.has(p.id) ? 'bg-green-500' : 'bg-neutral-300'}`} />
        <button type="button" aria-label="More" onClick={() => setMenu(menu === p.id ? null : p.id)} className="rounded-lg px-sm py-xs text-lg leading-none text-neutral-500 hover:bg-neutral-200">⋯</button>
        {menu === p.id && (
          <span className="absolute right-0 top-full z-40 mt-1 w-48 overflow-hidden rounded-xl border border-neutral-200 bg-white py-xs text-sm shadow-lg">
            <Link href={profile(p)} className="block px-md py-xs font-semibold hover:bg-neutral-50">Open profile</Link>
            {viewAs(p) && <Link href={viewAs(p)!} className="block px-md py-xs hover:bg-neutral-50">See their app (view as)</Link>}
            {p.role !== 'landlord' && <button type="button" onClick={() => { setMenu(null); setSelectedPerson(p); setIsEditModalOpen(true) }} className="block w-full px-md py-xs text-left hover:bg-neutral-50">Edit name & contact</button>}
            <button type="button" onClick={() => { setMenu(null); handleDeletePerson(p.id) }} className="block w-full border-t border-neutral-100 px-md py-xs text-left text-red-700 hover:bg-red-50">Delete…</button>
          </span>
        )}
      </span>
      {detail && <span className="col-start-2 col-span-2 md:hidden truncate text-xs text-neutral-600">{detail}</span>}
    </li>
  )
  const List = ({ children, empty }: { children: React.ReactNode[]; empty: string }) => children.length
    ? <ul className="divide-y divide-neutral-100 rounded-2xl border border-neutral-200 bg-white">{children}</ul>
    : <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center text-sm text-neutral-500">{needle ? 'Nobody matches that search.' : empty}</div>

  // tenants by property (from their tenancies), then anyone without a current tenancy
  const tenantGroups = (() => {
    const g = new Map<string, { name: string; address: string; rows: { p: Person; room: string; note: string }[] }>()
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
    for (const p of tenants) {
      const t = tenancyOf.get(p.id)
      const key = t?.properties?.id ?? 'none'
      if (!match(p, `${t?.rooms?.name ?? ''} ${t?.properties?.name ?? ''}`)) continue
      if (!g.has(key)) g.set(key, { name: t ? firstLine(t.properties?.name) : 'No current tenancy', address: t ? String(t.properties?.address ?? '').replace(/\n/g, ', ') : 'Past tenants, applicants who became tenants, or not set up yet', rows: [] })
      const note = !t ? '' : t.start_date > today ? `Moving in ${new Date(`${t.start_date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : t.notice_received_date ? `On notice · out ${t.end_date ? new Date(`${t.end_date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '?'}` : ''
      g.get(key)!.rows.push({ p, room: t?.rooms?.name ?? '', note })
    }
    const groups = [...g.entries()].map(([id, v]) => ({ id, ...v }))
    const real = sortPropertiesNumerically(groups.filter(x => x.id !== 'none').map(x => ({ ...x, name: x.name })) as any[]) as any[]
    for (const x of real) x.rows.sort((a: any, b: any) => a.room.localeCompare(b.room, undefined, { numeric: true }))
    return [...real, ...groups.filter(x => x.id === 'none')]
  })()

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl" onClick={e => { if (menu && !(e.target as HTMLElement).closest('[data-row-menu]')) setMenu(null) }}>
      <AppBar left={<BackButton href="/admin" />} />
      <PageHero
        eyebrow="People"
        title={LABEL[activeTab]}
        subtitle={activeTab === 'tenants' ? 'Everyone renting from us, by property and room. Tap anyone for their profile.' : activeTab === 'contractors' ? 'Tick “Emergency call-outs” for anyone CROS may text out of hours — set their trades, hours and fee in Emergencies.' : activeTab === 'cleaners' ? 'Your cleaners.' : activeTab === 'landlords' ? 'Landlords and the properties they own with us.' : 'The office team: administrators and lettings.'}
        stats={[
          { label: 'Tenants', value: tenants.length },
          { label: 'Contractors', value: contractors.length },
          { label: 'Emergency call-outs', value: contractors.filter(c => ecOn(c.id)).length, tone: contractors.some(c => ecOn(c.id)) ? 'good' : 'warn' },
          { label: 'Landlords', value: landlords.length },
        ]}
        actions={activeTab === 'tenants' ? <HeroButton primary onClick={() => startAdd('tenant')}>+ Register tenant</HeroButton>
          : activeTab === 'landlords' ? <HeroButton primary onClick={() => { setShowAddLandlord(v => !v); setShowAddPerson(false) }}>+ Add landlord</HeroButton>
          : <HeroButton primary onClick={() => startAdd(activeTab === 'contractors' ? 'contractor' : activeTab === 'cleaners' ? 'cleaner' : 'lettings')}>+ Add {activeTab === 'contractors' ? 'contractor' : activeTab === 'cleaners' ? 'cleaner' : 'office member'}</HeroButton>}
        tabs={(['tenants', 'contractors', 'cleaners', 'landlords', 'office'] as Tab[]).map(t => ({ key: t, label: `${LABEL[t]} · ${counts[t]}`, active: activeTab === t, onClick: () => { setActiveTab(t); setShowAddPerson(false); setShowAddLandlord(false); setMenu(null); window.history.replaceState(null, '', `/admin/people?tab=${t}`) } }))}
      />

      <main className="mx-auto max-w-6xl px-lg py-xl space-y-md">
        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-md text-sm text-red-900">{error}</div>}
        {success && <div className="rounded-xl border border-green-200 bg-green-50 p-md text-sm text-green-900">{success}</div>}
        {landlordSuccessMessage && <div className="rounded-xl border border-green-200 bg-green-50 p-md text-sm text-green-900">{landlordSuccessMessage}</div>}

        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={`Search ${LABEL[activeTab].toLowerCase()} by name, email, phone${activeTab === 'tenants' ? ', room or property' : ''}…`}
          className="w-full rounded-xl border border-neutral-200 bg-white px-md py-sm text-sm" />

        {/* ── add forms ── */}
        {activeTab === 'tenants' && (
          <>
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

          </>
        )}
        {activeTab === 'landlords' && (
          <>
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

          </>
        )}
        {showAddPerson && ['contractors', 'cleaners', 'office'].includes(activeTab) && (
          <form onSubmit={handleAddPerson} className="rounded-2xl border border-neutral-200 bg-white p-lg space-y-md">
            <h3 className="text-base font-bold text-neutral-900">Add {activeTab === 'contractors' ? 'a contractor' : activeTab === 'cleaners' ? 'a cleaner' : 'an office member'}</h3>
            <NameInput required titleRequired
              value={{ salutation: formData.salutation, first_name: formData.first_name, last_name: formData.last_name }}
              onChange={n => setFormData({ ...formData, salutation: n.salutation, first_name: n.first_name, last_name: n.last_name })}
              inputClass="w-full rounded-lg border border-neutral-300 bg-white px-md py-sm text-sm" labelClass="block text-xs font-semibold text-neutral-600 mb-xs" />
            <div className="grid gap-md sm:grid-cols-3">
              <label className="block text-xs font-semibold text-neutral-600">Email *<input type="email" required value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} className="mt-xs w-full rounded-lg border border-neutral-300 px-md py-sm text-sm font-normal" /></label>
              <label className="block text-xs font-semibold text-neutral-600">Mobile<input type="tel" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} className="mt-xs w-full rounded-lg border border-neutral-300 px-md py-sm text-sm font-normal" placeholder="07…" /></label>
              {activeTab === 'office' && (
                <label className="block text-xs font-semibold text-neutral-600">Role<select value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value })} className="mt-xs w-full rounded-lg border border-neutral-300 bg-white px-md py-sm text-sm font-normal"><option value="lettings">Lettings</option><option value="administrator">Administrator</option></select></label>
              )}
            </div>
            <div className="flex gap-sm">
              <button type="submit" className="rounded-xl bg-neutral-900 px-lg py-sm text-sm font-bold text-white">Add</button>
              <button type="button" onClick={() => setShowAddPerson(false)} className="rounded-xl border border-neutral-300 px-lg py-sm text-sm font-semibold">Cancel</button>
            </div>
          </form>
        )}

        {/* ── lists ── */}
        {activeTab === 'tenants' && (tenantGroups.length ? tenantGroups.map(g => (
          <section key={g.id} className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
            <header className="flex items-baseline justify-between gap-md border-b border-neutral-100 bg-neutral-50 px-lg py-sm">
              <span className="min-w-0"><span className="font-bold text-neutral-900">{g.name}</span><span className="ml-sm truncate text-xs text-neutral-500">{g.address}</span></span>
              <span className="shrink-0 text-xs text-neutral-500">{g.rows.length} tenant{g.rows.length === 1 ? '' : 's'}</span>
            </header>
            <ul className="divide-y divide-neutral-100">
              {g.rows.map(({ p, room, note }: any) => <Row key={p.id} p={p} detail={<>{room || <span className="text-neutral-400">—</span>}{note && <span className="ml-sm rounded-full bg-amber-50 px-sm py-0.5 text-[11px] font-semibold text-amber-800">{note}</span>}</>} />)}
            </ul>
          </section>
        )) : <List empty="No tenants yet.">{[]}</List>)}

        {activeTab === 'contractors' && (
          <List empty="No contractors yet.">{contractors.filter(p => match(p, (p.trade_types ?? []).join(' '))).map(p => (
            <Row key={p.id} p={p}
              detail={(p.trade_types ?? []).length ? (p.trade_types ?? []).join(', ') : <span className="text-neutral-400">Trades not set</span>}
              extra={
                <label className={`hidden sm:flex cursor-pointer items-center gap-xs rounded-full border px-sm py-0.5 text-[11px] font-semibold ${ecOn(p.id) ? 'border-red-300 bg-red-50 text-red-800' : 'border-neutral-200 text-neutral-500'}`} title="CROS may text them for out-of-hours emergencies">
                  <input type="checkbox" className="h-3 w-3" disabled={ecBusy === p.id} checked={ecOn(p.id)} onChange={e => toggleEmergency(p.id, e.target.checked)} />
                  🚨 Emergency call-outs
                </label>
              } />
          ))}</List>
        )}
        {activeTab === 'contractors' && contractors.some(c => ecOn(c.id)) && (
          <p className="text-xs text-neutral-500">Set each one’s trades, hours, call-out fee and preference in <Link href="/admin/emergencies?tab=list" className="font-semibold text-blue-700 hover:underline">Emergencies › Emergency contractors</Link>. Without a mobile number they can’t be texted.</p>
        )}

        {activeTab === 'cleaners' && <List empty="No cleaners yet.">{cleaners.filter(p => match(p)).map(p => <Row key={p.id} p={p} detail="Cleaner" />)}</List>}

        {activeTab === 'landlords' && (
          <List empty="No landlords yet.">{(landlords as any[]).filter(p => match(p, (ownedBy.get(p.id) ?? []).join(' '))).map(p => (
            <Row key={p.id} p={{ ...p, role: 'landlord' }}
              detail={(ownedBy.get(p.id) ?? []).length ? <span title={(ownedBy.get(p.id) ?? []).join(', ')}>{(ownedBy.get(p.id) ?? []).slice(0, 2).join(', ')}{(ownedBy.get(p.id) ?? []).length > 2 ? ` +${(ownedBy.get(p.id) ?? []).length - 2} more` : ''}</span> : <span className="text-neutral-400">No properties linked</span>}
              extra={<span className={`hidden sm:inline-block rounded-full px-sm py-0.5 text-[11px] font-semibold ${p.landlord_comms_enabled ? 'bg-green-50 text-green-800' : 'bg-neutral-100 text-neutral-500'}`} title="Landlord emails">{p.landlord_comms_enabled ? 'Comms on' : 'Comms off'}</span>} />
          ))}</List>
        )}
        {activeTab === 'landlords' && <p className="text-xs text-neutral-500">Statements are in <Link href="/admin/statements" className="font-semibold text-blue-700 hover:underline">Finance › Statements</Link>.</p>}

        {activeTab === 'office' && <List empty="No office team yet.">{office.filter(p => match(p)).map(p => <Row key={p.id} p={p} detail={p.role === 'lettings' ? 'Lettings' : 'Administrator'} />)}</List>}

        {selectedPerson && (
          <EditPersonModal
            person={selectedPerson}
            isOpen={isEditModalOpen}
            onClose={() => { setIsEditModalOpen(false); setSelectedPerson(null) }}
            onSave={(updatedPerson) => { setPeople(people.map(p => p.id === updatedPerson.id ? { ...p, ...updatedPerson } as Person : p)); setIsEditModalOpen(false); setSelectedPerson(null) }}
          />
        )}
      </main>
    </div>
  )
}
