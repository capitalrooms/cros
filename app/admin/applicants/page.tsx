'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import AppBar from '@/components/AppBar'
import PageHero, { HeroButton } from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'
import { sortPropertiesNumerically } from '@/lib/sortProperties'
import NameInput, { type NameValue, emptyName, toFullName, toLegalName } from '@/app/components/NameInput'
import HoldingDepositModal from '@/components/HoldingDepositModal'

const STAGES = [
  { key: 'invited',            label: 'Invited',            color: 'bg-neutral-100 text-neutral-600',  dot: 'bg-neutral-400' },
  { key: 'applied',            label: 'Applied',            color: 'bg-blue-50 text-blue-700',         dot: 'bg-blue-500' },
  { key: 'offer_sent',         label: 'Offer sent',         color: 'bg-amber-50 text-amber-700',       dot: 'bg-amber-500' },
  { key: 'referencing',        label: 'Referencing',        color: 'bg-violet-50 text-violet-700',     dot: 'bg-violet-500' },
  { key: 'referencing_passed', label: 'Ref. passed',        color: 'bg-sky-50 text-sky-700',           dot: 'bg-sky-500' },
  { key: 'docs_uploaded',      label: 'Docs uploaded',      color: 'bg-teal-50 text-teal-700',         dot: 'bg-teal-600' },
  { key: 'converted',          label: 'Let agreed ✓',        color: 'bg-green-50 text-green-700',       dot: 'bg-green-500' },
] as const

type Stage = typeof STAGES[number]['key']

interface Applicant {
  id: string
  full_name: string   // kept for API compat — built from name fields
  name: NameValue
  email: string
  phone: string | null
  pipeline_stage: Stage
  submitted_at: string
  created_at: string
  updated_at: string
  advertised_rent: number | null
  offered_rent: number | null
  preferred_start_date: string | null
  admin_notes: string | null
  viewing_id: string | null
  offer_id: string | null
  converted_person_id: string | null
  // Form fields — all returned by select('*')
  bio?: string | null
  profession?: string | null
  profession_description?: string | null
  salary?: string | null
  interests?: string | null
  sociability?: string | null
  house_preferences?: string | null
  communication_style?: string | null
  room_requirements?: string | null
  room_conditions?: string | null
  rent_offer_type?: string | null
  preferred_term?: string | null
  current_address?: string | null
  date_of_birth?: string | null
  linkedin_url?: string | null
  previous_addresses?: unknown
  guarantor_needed?: 'no' | 'yes' | 'not_sure' | null   // migration 202
  guarantor_name?: string | null
  guarantor_email?: string | null
  guarantor_phone?: string | null
  rooms?: { name: string; current_asking_rent: number | null }
  properties?: { name: string; address: string }
  viewings?: { viewing_date: string; viewing_slot: string | null }
}

const stageInfo = (key: string) => STAGES.find(s => s.key === key) || STAGES[0]

export default function ApplicantsPage() {
  const router = useRouter()
  const [applicants, setApplicants] = useState<Applicant[]>([])
  const [properties, setProperties] = useState<any[]>([])
  const [rooms, setRooms] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Filters
  const [stageFilter, setStageFilter] = useState<Stage | 'all'>('all')
  const [search, setSearch] = useState('')

  // Add applicant form
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ full_name: '', name: emptyName(), email: '', phone: '', property_id: '', room_id: '' })
  const [addError, setAddError] = useState('')
  const [addSaving, setAddSaving] = useState(false)
  const [filteredAddRooms, setFilteredAddRooms] = useState<any[]>([])

  // Stage advance
  const [advancing, setAdvancing] = useState<string | null>(null)
  const [depositFor, setDepositFor] = useState<string | null>(null)
  const [depositBanner, setDepositBanner] = useState('')
  const [lettingFiles, setLettingFiles] = useState<Record<string, string>>({})   // applicant id → their tenancy's letting file

  // Accept offer & send reserve email
  const [acceptingSending, setAcceptingSending] = useState<string | null>(null)
  const [acceptSentFor, setAcceptSentFor] = useState<Set<string>>(new Set())

  // Convert to tenant
  const [converting, setConverting] = useState<string | null>(null)

  // Detail expand
  const [expanded, setExpanded] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [savingNote, setSavingNote] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const user = await getCurrentUser()
      if (!user || !['lettings','administrator','admin'].includes(user.assignment?.role)) {
        router.push('/login')
        return
      }
      await loadAll()
    }
    init()
  }, [router])

  // Filter rooms when property changes in add form
  const pendingRoom = useRef<string | null>(null)
  useEffect(() => {
    if (!addForm.property_id) { setFilteredAddRooms([]); return }
    const list = rooms.filter(r => r.property_id === addForm.property_id)
    setFilteredAddRooms(list)
    const keep = pendingRoom.current && list.some(r => r.id === pendingRoom.current) ? pendingRoom.current : ''
    if (list.length) pendingRoom.current = null
    setAddForm(f => ({ ...f, room_id: keep }))
  }, [addForm.property_id, rooms])

  // The Lettings overview links here with ?open=<applicant> — open that applicant's row
  const openedFromLink = useRef(false)
  useEffect(() => {
    if (openedFromLink.current || !applicants.length) return
    const id = new URLSearchParams(window.location.search).get('open')
    if (!id || !applicants.some(a => a.id === id)) return
    openedFromLink.current = true
    setExpanded(id)
    setTimeout(() => document.getElementById(`applicant-${id}`)?.scrollIntoView({ block: 'center' }), 100)
  }, [applicants])

  // "+ Add letting" on a room page links here with ?add=1&property_id=…&room_id=… — open the form prefilled.
  const prefilled = useRef(false)
  useEffect(() => {
    if (prefilled.current || !rooms.length) return
    const q = new URLSearchParams(window.location.search)
    if (q.get('add') !== '1') return
    prefilled.current = true
    pendingRoom.current = q.get('room_id')
    setShowAdd(true)
    setAddForm(f => ({ ...f, property_id: q.get('property_id') || '' }))
  }, [rooms])

  async function loadAll() {
    const sb = createClient()

    const [{ data: aData }, { data: pData }, { data: rData }] = await Promise.all([
      sb.from('applicants')
        .select('*, rooms(name, current_asking_rent), properties(name, address), viewings(viewing_date, viewing_slot)')
        .order('created_at', { ascending: false }),
      sb.from('properties').select('id, name, address').order('name'),
      sb.from('rooms').select('id, name, property_id').order('name'),
    ])

    setApplicants((aData || []) as Applicant[])
    const letAgreed = (aData || []).filter((a: any) => a.pipeline_stage === 'converted').map((a: any) => a.id)
    if (letAgreed.length) {
      const { data: ts } = await sb.from('tenancies').select('id, applicant_id').in('applicant_id', letAgreed).is('let_cancelled_at', null)
      setLettingFiles(Object.fromEntries((ts || []).map((t: any) => [t.applicant_id, t.id])))
    }
    setProperties(sortPropertiesNumerically(pData || []))
    setRooms(rData || [])

    // Seed local notes state
    const noteMap: Record<string, string> = {}
    ;(aData || []).forEach((a: any) => { noteMap[a.id] = a.admin_notes || '' })
    setNotes(noteMap)

    setLoading(false)
  }

  const filtered = useMemo(() => {
    return applicants.filter(a => {
      if (stageFilter !== 'all' && a.pipeline_stage !== stageFilter) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        const propName = (a.properties as any)?.name || ''
        const roomName = (a.rooms as any)?.name || ''
        return (
          a.full_name.toLowerCase().includes(q) ||
          a.email.toLowerCase().includes(q) ||
          (a.phone || '').includes(q) ||
          propName.toLowerCase().includes(q) ||
          roomName.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [applicants, stageFilter, search])

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = { all: applicants.length }
    STAGES.forEach(s => { counts[s.key] = applicants.filter(a => a.pipeline_stage === s.key).length })
    return counts
  }, [applicants])

  async function advanceStage(applicant: Applicant, newStage: Stage, force = false) {
    setAdvancing(applicant.id)
    try {
      const res = await fetch(`/api/applicants/${applicant.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pipeline_stage: newStage, ...(force ? { force: true } : {}) }),
      })
      if (!res.ok) {
        const err = await res.json()
        alert(err.error || 'Failed to advance stage')
        return
      }
      setApplicants(prev => prev.map(a => a.id === applicant.id ? { ...a, pipeline_stage: newStage } : a))
    } finally {
      setAdvancing(null)
    }
  }

  async function acceptOffer(applicant: Applicant) {
    setAcceptingSending(applicant.id)
    try {
      const res = await fetch(`/api/applicants/${applicant.id}/accept-offer`, { method: 'POST', headers: { 'Content-Type': 'application/json' } })
      const data = await res.json()
      if (!res.ok) { alert(data.error || 'Failed to send'); return }
      setAcceptSentFor(prev => new Set([...prev, applicant.id]))
      setApplicants(prev => prev.map(a => a.id === applicant.id ? { ...a, pipeline_stage: 'offer_sent' } : a))
    } finally {
      setAcceptingSending(null)
    }
  }

  async function convertToTenant(applicant: Applicant) {
    if (!confirm(`Convert ${applicant.full_name} to a tenant? This will create (or link to) their tenant record.`)) return
    setConverting(applicant.id)
    try {
      const res = await fetch(`/api/applicants/${applicant.id}/convert`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      const data = await res.json()
      if (!res.ok) { alert(data.error || 'Conversion failed'); return }
      setApplicants(prev => prev.map(a => a.id === applicant.id ? { ...a, pipeline_stage: 'converted', converted_person_id: data.personId } : a))
      // Next step after referencing: the move-in pack (agreement, check-in balance, certificates, guides)
      if (data.tenancyId) { setLettingFiles(m => ({ ...m, [applicant.id]: data.tenancyId })); router.push(`/admin/lettings/${data.tenancyId}?from=/admin/applicants`) }
      else if (confirm(`Converted! Go to their tenant profile now?`)) router.push(`/admin/tenant/${data.personId}`)
    } finally {
      setConverting(null)
    }
  }

  async function saveNote(applicantId: string) {
    setSavingNote(applicantId)
    try {
      await fetch(`/api/applicants/${applicantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_notes: notes[applicantId] || null }),
      })
    } finally {
      setSavingNote(null)
    }
  }

  async function handleAdd() {
    const fullName = toFullName(addForm.name) || addForm.full_name
    if (!fullName.trim() || !addForm.email.trim() || !addForm.room_id) {
      setAddError('Name, email, and room are required')
      return
    }
    setAddSaving(true)
    setAddError('')
    try {
      const sb = createClient()
      const { data, error: err } = await sb
        .from('applicants')
        .insert({
          full_name:      (toLegalName(addForm.name) || fullName).trim(),
          salutation:     addForm.name.salutation || null,
          first_name:     addForm.name.first_name.trim() || null,
          middle_name:    addForm.name.middle_name?.trim() || null,
          last_name:      addForm.name.last_name.trim() || null,
          email:          addForm.email.trim().toLowerCase(),
          phone:          addForm.phone.trim() || null,
          room_id:        addForm.room_id,
          property_id:    addForm.property_id,
          pipeline_stage: 'applied',
        })
        .select('*, rooms(name), properties(name, address)')
        .single()
      if (err || !data) { setAddError(err?.message || 'Failed to add applicant'); return }
      setApplicants(prev => [data as Applicant, ...prev])
      setNotes(prev => ({ ...prev, [data.id]: '' }))
      setAddForm({ full_name: '', name: emptyName(), email: '', phone: '', property_id: '', room_id: '' })
      setShowAdd(false)
    } finally {
      setAddSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar left={<BackButton href="/admin" />} />
        <div className="flex items-center justify-center pt-3xl">
          <p className="text-sm text-neutral-500">Loading applicants…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar left={<BackButton href="/admin" />} />
        <div className="mx-auto max-w-6xl px-lg py-xl">
          <div className="rounded-xl bg-red-50 border border-red-200 p-lg text-sm text-red-700">{error}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin" />} />
      <PageHero
        title="Applicants"
        subtitle="From application to let agreed — recording the holding deposit creates the tenancy and opens its letting file"
        stats={[
          { label: 'Applied', value: applicants.filter(a => a.pipeline_stage === 'applied').length },
          { label: 'Offer sent', value: applicants.filter(a => a.pipeline_stage === 'offer_sent').length, tone: 'warn' },
          { label: 'Referencing', value: applicants.filter(a => ['referencing', 'referencing_passed', 'docs_uploaded'].includes(a.pipeline_stage)).length, tone: 'info' },
          { label: 'Let agreed', value: applicants.filter(a => a.pipeline_stage === 'converted').length, tone: 'good' },
        ]}
        actions={<HeroButton primary onClick={() => setShowAdd(!showAdd)}>+ Add applicant</HeroButton>}
      />

      <main className="mx-auto max-w-6xl px-lg py-xl">
        {/* Add form */}
        {showAdd && (
          <div className="mb-xl rounded-2xl border-2 border-neutral-900 bg-white p-lg">
            <h2 className="text-base font-bold text-neutral-900 mb-md">Add Applicant Directly</h2>
            <div className="grid gap-md sm:grid-cols-2">
              <div className="sm:col-span-2">
                <NameInput
                  value={addForm.name}
                  onChange={n => setAddForm(f => ({ ...f, name: n, full_name: toFullName(n) }))}
                  required titleRequired withMiddle
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-600 mb-xs uppercase tracking-wide">Email *</label>
                <input type="email" value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} placeholder="jane@example.com" className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-600 mb-xs uppercase tracking-wide">Phone</label>
                <input type="tel" value={addForm.phone} onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))} placeholder="07700 000000" className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-600 mb-xs uppercase tracking-wide">Property</label>
                <select value={addForm.property_id} onChange={e => setAddForm(f => ({ ...f, property_id: e.target.value }))} className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm">
                  <option value="">Select property…</option>
                  {properties.map(p => <option key={p.id} value={p.id}>{p.name || p.address}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-neutral-600 mb-xs uppercase tracking-wide">Room *</label>
                <select value={addForm.room_id} onChange={e => setAddForm(f => ({ ...f, room_id: e.target.value }))} className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm">
                  <option value="">Select room…</option>
                  {filteredAddRooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            </div>
            {addError && <p className="mt-sm text-xs text-red-600">{addError}</p>}
            <div className="mt-md flex gap-sm">
              <button onClick={handleAdd} disabled={addSaving} className="rounded-xl bg-neutral-900 px-lg py-sm text-sm font-bold text-white hover:bg-neutral-700 disabled:opacity-50">
                {addSaving ? 'Saving…' : 'Add Applicant'}
              </button>
              <button onClick={() => setShowAdd(false)} className="rounded-xl border border-neutral-300 px-lg py-sm text-sm font-semibold hover:bg-neutral-50">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="mb-md relative">
          <span className="absolute left-md top-1/2 -translate-y-1/2 text-neutral-400 text-sm pointer-events-none">🔍</span>
          <input
            type="text"
            placeholder="Search by name, email, phone, or property…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-xl border border-neutral-300 bg-white pl-[2.5rem] pr-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
          />
        </div>

        {/* Stage filter tabs */}
        <div className="mb-lg flex flex-wrap gap-sm">
          <button
            onClick={() => setStageFilter('all')}
            className={`rounded-xl px-md py-sm text-sm font-semibold transition-all ${stageFilter === 'all' ? 'bg-neutral-900 text-white' : 'border border-neutral-300 text-neutral-700 hover:border-neutral-400'}`}
          >
            All ({stageCounts.all})
          </button>
          {STAGES.filter(s => stageCounts[s.key] > 0 || stageFilter === s.key).map(s => (
            <button
              key={s.key}
              onClick={() => setStageFilter(s.key)}
              className={`rounded-xl px-md py-sm text-sm font-semibold transition-all ${stageFilter === s.key ? 'bg-neutral-900 text-white' : 'border border-neutral-300 text-neutral-700 hover:border-neutral-400'}`}
            >
              {s.label} ({stageCounts[s.key]})
            </button>
          ))}
        </div>

        {/* Applicants list */}
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center">
            <p className="text-sm text-neutral-500">{applicants.length === 0 ? 'No applicants yet — they appear here when someone clicks an invite link or is added manually.' : 'No applicants match this filter.'}</p>
          </div>
        ) : (
          <div className="space-y-sm">
            {filtered.map(applicant => {
              const stage = stageInfo(applicant.pipeline_stage)
              const prop  = (applicant.properties as any)
              const room  = (applicant.rooms as any)
              const view  = (applicant.viewings as any)
              const isOpen = expanded === applicant.id
              const stageIdx   = STAGES.findIndex(s => s.key === applicant.pipeline_stage)
              const nextStage  = STAGES[stageIdx + 1] as typeof STAGES[number] | undefined
              const isConverted = applicant.pipeline_stage === 'converted'

              return (
                <div key={applicant.id} id={`applicant-${applicant.id}`} className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
                  {/* Row header */}
                  <button
                    className="w-full text-left px-lg py-md hover:bg-neutral-50 transition-colors"
                    onClick={() => setExpanded(isOpen ? null : applicant.id)}
                  >
                    <div className="flex items-center gap-md flex-wrap">
                      {/* Stage dot */}
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${stage.dot}`} />

                      {/* Name + email */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-neutral-900 truncate">{applicant.full_name}</p>
                        <p className="text-xs text-neutral-500 truncate">{applicant.email}{applicant.phone ? ` · ${applicant.phone}` : ''}</p>
                      </div>

                      {/* Property + room */}
                      {prop && (
                        <div className="hidden sm:block text-right min-w-0">
                          <p className="text-xs font-medium text-neutral-700 truncate">{prop.name || prop.address}</p>
                          {room && <p className="text-xs text-neutral-400 truncate">{room.name}</p>}
                        </div>
                      )}

                      {/* Viewing date */}
                      {view && (
                        <p className="hidden md:block text-xs text-neutral-400 whitespace-nowrap">
                          Viewed {new Date(view.viewing_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </p>
                      )}

                      {/* Stage badge */}
                      <span className={`text-xs font-semibold px-sm py-xs rounded-full whitespace-nowrap ${stage.color}`}>
                        {stage.label}
                      </span>

                      {/* Chevron */}
                      <span className="text-neutral-400 text-sm flex-shrink-0">{isOpen ? '▲' : '▼'}</span>
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {isOpen && (
                    <div className="border-t border-neutral-100 px-lg py-md space-y-md">
                      <DetailsToCopy a={applicant} />
                      {/* Pipeline progress bar */}
                      <div>
                        <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Pipeline</p>
                        <div className="flex items-center gap-xs flex-wrap">
                          {STAGES.map((s, i) => {
                            const isCurrentOrPast = STAGES.findIndex(x => x.key === applicant.pipeline_stage) >= i
                            return (
                              <div key={s.key} className="flex items-center gap-xs">
                                <span className={`text-xs px-sm py-xs rounded-full font-medium ${isCurrentOrPast ? s.color : 'bg-neutral-100 text-neutral-400'}`}>
                                  {s.label}
                                </span>
                                {i < STAGES.length - 1 && <span className={`text-xs ${isCurrentOrPast ? 'text-neutral-400' : 'text-neutral-200'}`}>›</span>}
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      {/* ── Application details ── */}
                      <div className="space-y-md">

                        {/* Room + rent snapshot */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-md text-xs">
                          {prop && (
                            <div>
                              <p className="font-semibold text-neutral-500 uppercase tracking-wide mb-xs">Property</p>
                              <p className="text-neutral-900">{prop.address || prop.name}</p>
                              {room && <p className="text-neutral-500">{room.name}</p>}
                            </div>
                          )}
                          {room?.current_asking_rent && (
                            <div>
                              <p className="font-semibold text-neutral-500 uppercase tracking-wide mb-xs">Asking rent</p>
                              <p className="text-neutral-900">£{room.current_asking_rent.toLocaleString()} pcm</p>
                              {applicant.rent_offer_type === 'below_asking' && applicant.offered_rent && (
                                <p className="text-amber-700 font-semibold">Offered: £{Number(applicant.offered_rent).toLocaleString()}</p>
                              )}
                            </div>
                          )}
                          {applicant.preferred_start_date && (
                            <div>
                              <p className="font-semibold text-neutral-500 uppercase tracking-wide mb-xs">Move-in</p>
                              <p className="text-neutral-900">{new Date(applicant.preferred_start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                              {applicant.preferred_term && <p className="text-neutral-500">{applicant.preferred_term}</p>}
                            </div>
                          )}
                          <div>
                            <p className="font-semibold text-neutral-500 uppercase tracking-wide mb-xs">Applied</p>
                            <p className="text-neutral-900">{new Date(applicant.submitted_at || applicant.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                          </div>
                        </div>

                        {/* Personal & professional */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-md text-xs border-t border-neutral-100 pt-md">
                          {applicant.profession && (
                            <div>
                              <p className="font-semibold text-neutral-500 uppercase tracking-wide mb-xs">Profession</p>
                              <p className="text-neutral-900">{applicant.profession}</p>
                              {applicant.salary && <p className="text-neutral-500">{applicant.salary}</p>}
                            </div>
                          )}
                          {applicant.current_address && (
                            <div>
                              <p className="font-semibold text-neutral-500 uppercase tracking-wide mb-xs">Current address</p>
                              <p className="text-neutral-900">{applicant.current_address}</p>
                            </div>
                          )}
                          {applicant.date_of_birth && (
                            <div>
                              <p className="font-semibold text-neutral-500 uppercase tracking-wide mb-xs">Date of birth</p>
                              <p className="text-neutral-900">{new Date(applicant.date_of_birth).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                            </div>
                          )}
                          {applicant.linkedin_url && (
                            <div>
                              <p className="font-semibold text-neutral-500 uppercase tracking-wide mb-xs">LinkedIn</p>
                              <a href={applicant.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate block">{applicant.linkedin_url.replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//,'')}</a>
                            </div>
                          )}
                        </div>

                        {/* About them */}
                        {(applicant.bio || applicant.profession_description || applicant.interests) && (
                          <div className="space-y-sm border-t border-neutral-100 pt-md">
                            {applicant.bio && (
                              <div>
                                <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-xs">About them</p>
                                <p className="text-sm text-neutral-800 leading-relaxed">{applicant.bio}</p>
                              </div>
                            )}
                            {applicant.profession_description && (
                              <div>
                                <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-xs">Their work</p>
                                <p className="text-sm text-neutral-800 leading-relaxed">{applicant.profession_description}</p>
                              </div>
                            )}
                            {applicant.interests && (
                              <div>
                                <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-xs">Interests</p>
                                <p className="text-sm text-neutral-800 leading-relaxed">{applicant.interests}</p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Living with them */}
                        {(applicant.sociability || applicant.house_preferences || applicant.communication_style) && (
                          <div className="space-y-sm border-t border-neutral-100 pt-md">
                            <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">What they're like to live with</p>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-md text-xs">
                              {applicant.sociability && (
                                <div>
                                  <p className="text-neutral-500 mb-xs">Sociability</p>
                                  <p className="text-neutral-900 capitalize">{applicant.sociability}</p>
                                </div>
                              )}
                              {applicant.house_preferences && (
                                <div className="sm:col-span-1">
                                  <p className="text-neutral-500 mb-xs">House preferences</p>
                                  <p className="text-neutral-900">{applicant.house_preferences}</p>
                                </div>
                              )}
                              {applicant.communication_style && (
                                <div>
                                  <p className="text-neutral-500 mb-xs">Communication</p>
                                  <p className="text-neutral-900">{applicant.communication_style}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Room requirements */}
                        {(applicant.room_requirements || applicant.room_conditions) && (
                          <div className="space-y-sm border-t border-neutral-100 pt-md">
                            <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">About the room</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-md text-xs">
                              {applicant.room_requirements && (
                                <div>
                                  <p className="text-neutral-500 mb-xs">Requirements</p>
                                  <p className="text-neutral-900">{applicant.room_requirements}</p>
                                </div>
                              )}
                              {applicant.room_conditions && (
                                <div>
                                  <p className="text-neutral-500 mb-xs">Conditions</p>
                                  <p className="text-neutral-900">{applicant.room_conditions}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Rental history */}
                        {applicant.previous_addresses && Array.isArray(applicant.previous_addresses) && (applicant.previous_addresses as any[]).filter((a: any) => a.address).length > 0 && (
                          <div className="border-t border-neutral-100 pt-md">
                            <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Rental history</p>
                            <div className="space-y-sm">
                              {(applicant.previous_addresses as any[]).filter((a: any) => a.address).map((addr: any, i: number) => (
                                <div key={i} className="text-xs rounded-lg bg-neutral-50 border border-neutral-100 px-md py-sm">
                                  <p className="font-medium text-neutral-900">{addr.address}</p>
                                  <p className="text-neutral-500 mt-xs">
                                    {[addr.movedIn && `From ${addr.movedIn}`, addr.movedOut && `to ${addr.movedOut}`, addr.reasonLeft && `· ${addr.reasonLeft}`].filter(Boolean).join(' ')}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Admin notes */}
                      <div>
                        <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-xs">Admin notes</label>
                        <div className="flex gap-sm items-end">
                          <textarea
                            rows={2}
                            value={notes[applicant.id] ?? ''}
                            onChange={e => setNotes(prev => ({ ...prev, [applicant.id]: e.target.value }))}
                            placeholder="Internal notes (never shown to applicant)…"
                            className="flex-1 rounded-xl border border-neutral-200 px-md py-sm text-sm resize-none focus:outline-none focus:ring-2 focus:ring-neutral-900"
                          />
                          <button
                            onClick={() => saveNote(applicant.id)}
                            disabled={savingNote === applicant.id}
                            className="rounded-xl border border-neutral-300 px-md py-sm text-xs font-semibold hover:bg-neutral-50 disabled:opacity-50 whitespace-nowrap"
                          >
                            {savingNote === applicant.id ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-wrap gap-sm pt-xs border-t border-neutral-100">
                        {/* Links */}
                        <a href={`mailto:${applicant.email}`} className="text-xs font-semibold border border-neutral-300 rounded-lg px-md py-sm hover:bg-neutral-50">✉ Email</a>
                        <CopyButton label="Copy email" value={applicant.email} />
                        {applicant.phone && (
                          <>
                            <a href={`tel:${applicant.phone}`} className="text-xs font-semibold border border-neutral-300 rounded-lg px-md py-sm hover:bg-neutral-50">📱 Call</a>
                            <CopyButton label={`Copy ${applicant.phone}`} value={applicant.phone} />
                          </>
                        )}
                        {lettingFiles[applicant.id] ? (
                          <a href={`/admin/lettings/${lettingFiles[applicant.id]}?from=/admin/applicants`} className="text-xs font-semibold border border-blue-700 bg-blue-700 text-white rounded-lg px-md py-sm hover:bg-blue-600">
                            Open letting file →
                          </a>
                        ) : applicant.converted_person_id && (
                          <a href={`/admin/tenant/${applicant.converted_person_id}`} className="text-xs font-semibold border border-blue-200 text-blue-700 rounded-lg px-md py-sm hover:bg-blue-50">
                            View tenant profile →
                          </a>
                        )}

                        {/* Holding deposit — records it and tells the landlord and housemates (after review) */}
                        {!isConverted && ['applied', 'offer_sent', 'referencing'].includes(applicant.pipeline_stage) && (
                          <button
                            onClick={() => setDepositFor(applicant.id)}
                            className="text-xs font-semibold border border-green-700 text-green-800 rounded-lg px-md py-sm hover:bg-green-50"
                          >
                            💷 Holding deposit received
                          </button>
                        )}

                        {/* Accept offer — only shown on 'applied' stage */}
                        {applicant.pipeline_stage === 'applied' && (
                          <button
                            onClick={() => acceptOffer(applicant)}
                            disabled={acceptingSending === applicant.id || acceptSentFor.has(applicant.id)}
                            className="text-xs font-semibold border border-emerald-700 bg-emerald-700 text-white rounded-lg px-md py-sm hover:bg-emerald-600 disabled:opacity-50 ml-auto"
                          >
                            {acceptingSending === applicant.id
                              ? 'Sending…'
                              : acceptSentFor.has(applicant.id)
                                ? '✓ Offer sent'
                                : '✓ Accept offer & send reserve email'}
                          </button>
                        )}

                        {/* Stage advance — generic for all other transitions */}
                        {!isConverted && nextStage && applicant.pipeline_stage !== 'applied' && (
                          <button
                            onClick={() => advanceStage(applicant, nextStage.key as Stage)}
                            disabled={advancing === applicant.id}
                            className={`text-xs font-semibold border border-neutral-900 bg-neutral-900 text-white rounded-lg px-md py-sm hover:bg-neutral-700 disabled:opacity-50 ${applicant.pipeline_stage !== 'applied' ? 'ml-auto' : ''}`}
                          >
                            {advancing === applicant.id ? 'Updating…' : `→ Mark as ${nextStage.label}`}
                          </button>
                        )}

                        {/* Move to any stage without sending anything (e.g. already referencing, offer agreed by phone) */}
                        {!isConverted && (
                          <label className="flex items-center gap-xs text-xs text-neutral-600">
                            Stage
                            <select value={applicant.pipeline_stage} disabled={advancing === applicant.id}
                              onChange={e => { const to = e.target.value as Stage; if (to !== applicant.pipeline_stage && confirm(`Move ${applicant.full_name} to “${STAGES.find(x => x.key === to)?.label}”? No email is sent.`)) advanceStage(applicant, to, true) }}
                              className="rounded-lg border border-neutral-300 bg-white px-sm py-xs text-xs font-semibold text-neutral-800">
                              {STAGES.filter(x => x.key !== 'converted').map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
                            </select>
                            <span className="text-neutral-400">(no email)</span>
                          </label>
                        )}

                        {/* Set up tenancy */}
                        {applicant.pipeline_stage === 'docs_uploaded' && !isConverted && (
                          <a
                            href={`/admin/applicants/${applicant.id}/create-tenancy`}
                            className="text-xs font-semibold border border-green-700 bg-green-700 text-white rounded-lg px-md py-sm hover:bg-green-600 inline-block"
                          >
                            Set up tenancy →
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>

      {depositFor && (
        <HoldingDepositModal
          applicantId={depositFor}
          onClose={() => setDepositFor(null)}
          onDone={(summary, tenancyId) => {
            setDepositFor(null)
            // let agreed: the tenancy now exists — straight to its letting file
            if (tenancyId) { router.push(`/admin/lettings/${tenancyId}?from=/admin/applicants&done=${encodeURIComponent(summary)}`); return }
            setApplicants(prev => prev.map(a => a.id === depositFor && ['applied', 'offer_sent'].includes(a.pipeline_stage) ? { ...a, pipeline_stage: 'referencing' as Stage } : a))
            setDepositBanner(summary)
          }}
        />
      )}
      {depositBanner && (
        <div className="fixed bottom-lg left-1/2 -translate-x-1/2 z-50 max-w-xl rounded-xl border border-green-200 bg-green-50 px-lg py-sm text-sm font-semibold text-green-800 shadow-lg">
          {depositBanner}
          <button onClick={() => setDepositBanner('')} className="ml-md text-green-700">×</button>
        </div>
      )}
    </div>
  )
}

// Copies to the clipboard (e.g. to paste into the referencing provider) and says so for a moment
function CopyButton({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async e => {
        e.stopPropagation()
        try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { window.prompt('Copy:', value) }
      }}
      className="text-xs font-semibold border border-neutral-300 rounded-lg px-md py-sm hover:bg-neutral-50"
    >
      {copied ? '✓ Copied' : `📋 ${label}`}
    </button>
  )
}

// Everything the office needs to copy out — into Homeppl, an email or a call — with a Copy on each line and one for
// all of it. (The row above is a button, and browsers don't let you select text inside a button.)
function DetailsToCopy({ a }: { a: Applicant }) {
  const room = (a.rooms as any), prop = (a.properties as any)
  const rent = a.rent_offer_type === 'below_asking' && a.offered_rent ? a.offered_rent : a.advertised_rent ?? room?.current_asking_rent ?? null
  const dob = a.date_of_birth ? new Date(a.date_of_birth + 'T12:00:00').toLocaleDateString('en-GB') : ''
  const start = a.preferred_start_date ? new Date(a.preferred_start_date + 'T12:00:00').toLocaleDateString('en-GB') : ''
  const rows: [string, string][] = [
    ['Full name', a.full_name ?? ''],
    ['Email', a.email ?? ''],
    ['Mobile', a.phone ?? ''],
    ['Date of birth', dob],
    ['Current address', a.current_address ?? ''],
    ['Work', [a.profession, a.salary ? `salary ${a.salary}` : ''].filter(Boolean).join(' · ')],
    ['Room', [room?.name, prop?.address || prop?.name].filter(Boolean).join(', ')],
    ['Rent · start', [rent ? `£${Number(rent).toLocaleString('en-GB', { minimumFractionDigits: 2 })} pcm` : '', start ? `from ${start}` : ''].filter(Boolean).join(' · ')],
  ]
  const g = a.guarantor_needed
  if (g) rows.push(['Guarantor', g === 'no' ? 'Not needed' : g === 'not_sure' && !a.guarantor_name ? 'Not sure yet' : [a.guarantor_name, a.guarantor_phone, a.guarantor_email].filter(Boolean).join(' · ')])
  const all = rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n')
  return (
    <div className="rounded-xl bg-neutral-50 px-md py-sm">
      <div className="mb-xs flex items-center justify-between gap-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Details to copy</p>
        <CopyButton label="Copy all" value={all} />
      </div>
      <dl className="divide-y divide-neutral-200/70 select-text">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline gap-md py-1.5 text-sm">
            <dt className="w-32 shrink-0 text-xs text-neutral-500">{k}</dt>
            <dd className="min-w-0 flex-1 break-words text-neutral-900">{v || <span className="text-neutral-400">—</span>}</dd>
            {v ? <CopyLink value={v} /> : null}
          </div>
        ))}
      </dl>
    </div>
  )
}

function CopyLink({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button type="button" onClick={async e => { e.stopPropagation(); try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1200) } catch { window.prompt('Copy:', value) } }}
      className="shrink-0 text-xs font-semibold text-blue-700 hover:underline">{copied ? 'Copied' : 'Copy'}</button>
  )
}
