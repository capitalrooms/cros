'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { adminFetch } from '@/lib/adminFetch'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import AppBar from '@/components/AppBar'
import PageHero, { HeroButton } from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'
import { sortPropertiesNumerically } from '@/lib/sortProperties'
import NameInput, { type NameValue, emptyName, toFullName, toLegalName } from '@/app/components/NameInput'
import HoldingDepositModal from '@/components/HoldingDepositModal'
import AddLetOnlyModal from '@/app/components/AddLetOnlyModal'
import HouseSearch from '@/app/components/HouseSearch'
import { displayName } from '@/lib/people'

const STAGES = [
  { key: 'invited',            label: 'Invited',            color: 'bg-neutral-100 text-neutral-600',  dot: 'bg-neutral-400' },
  { key: 'applied',            label: 'Applied',            color: 'bg-blue-50 text-blue-700',         dot: 'bg-blue-500' },
  { key: 'offer_sent',         label: 'Offer sent',         color: 'bg-amber-50 text-amber-700',       dot: 'bg-amber-500' },
  { key: 'referencing',        label: 'Referencing',        color: 'bg-violet-50 text-violet-700',     dot: 'bg-violet-500' },
  { key: 'referencing_passed', label: 'Ref. passed',        color: 'bg-sky-50 text-sky-700',           dot: 'bg-sky-500' },
  { key: 'docs_uploaded',      label: 'Docs uploaded',      color: 'bg-teal-50 text-teal-700',         dot: 'bg-teal-600' },
  { key: 'converted',          label: 'Let agreed ✓',        color: 'bg-green-50 text-green-700',       dot: 'bg-green-500' },
  // offer below the asking rent declined — the email lets them come back at the asking rent (16 Oct 2026)
  { key: 'rejected',           label: 'Offer declined',     color: 'bg-red-50 text-red-700',           dot: 'bg-red-400' },
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
  archived_at?: string | null
  archived_reason?: string | null
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
  const [showArchived, setShowArchived] = useState(false)
  const [search, setSearch] = useState('')

  // Add applicant form
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ full_name: '', name: emptyName(), email: '', phone: '', property_id: '', room_id: '' })
  const [addError, setAddError] = useState('')
  const [addSaving, setAddSaving] = useState(false)
  const [filteredAddRooms, setFilteredAddRooms] = useState<any[]>([])
  // an offer for a house we don't have on file yet (a one-off let-only) — add its address and rooms right here (16 Oct 2026)
  const [showNewAddress, setShowNewAddress] = useState<null | { address: string; postcode: string }>(null)

  // Stage advance
  const [advancing, setAdvancing] = useState<string | null>(null)
  const [depositFor, setDepositFor] = useState<string | null>(null)
  // archiving asks why on the card itself (a browser pop-up was easy to miss and some browsers block it)
  const [archiveFor, setArchiveFor] = useState<string | null>(null)
  const [archiveReason, setArchiveReason] = useState('Not interested')
  // declining an offer below the asking rent (POST /api/applicants/[id]/reject, reason asking_rent — its email carries
  // a "Yes, I'm happy to offer £asking" button that puts the application straight back in)
  const [declineFor, setDeclineFor] = useState<string | null>(null)
  const [declineText, setDeclineText] = useState({ subject: '', body: '' })
  const [declining, setDeclining] = useState(false)
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
    const keep = pendingRoom.current && list.some(r => r.id === pendingRoom.current) ? pendingRoom.current : list.length === 1 ? list[0].id : ''
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
    if (new URLSearchParams(window.location.search).get('deposit') === '1') setDepositFor(id)
    setTimeout(() => document.getElementById(`applicant-${id}`)?.scrollIntoView({ block: 'start' }), 100)
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
      sb.from('properties').select('id, name, address, postcode, letting_type').order('name'),
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
      if (!!a.archived_at !== showArchived) return false   // archived ones only in their own list
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
  }, [applicants, stageFilter, search, showArchived])

  const stageCounts = useMemo(() => {
    const live = applicants.filter(a => !a.archived_at)   // archived ones aren't counted in the stages
    const counts: Record<string, number> = { all: live.length }
    STAGES.forEach(s => { counts[s.key] = live.filter(a => a.pipeline_stage === s.key).length })
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
    if (applicant.pipeline_stage === 'offer_sent' && !confirm(`Email ${applicant.full_name} the link to reserve (pay the holding deposit)?`)) return
    setAcceptingSending(applicant.id)
    try {
      let res = await fetch(`/api/applicants/${applicant.id}/accept-offer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      let data = await res.json()
      if (!res.ok && data.needRent) {
        // no rent on file for this applicant — ask, rather than sending them back to the application form
        const typed = window.prompt(`No agreed rent is saved for ${applicant.full_name}. What monthly rent (£) has been agreed? The holding deposit is one week of this.`)
        if (!typed || !(Number(typed.replace(/[£,\s]/g, '')) > 0)) return
        res = await fetch(`/api/applicants/${applicant.id}/accept-offer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rent: Number(typed.replace(/[£,\s]/g, '')) }) })
        data = await res.json()
      }
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

  function openDecline(a: Applicant) {
    const asking = (a.rooms as any)?.current_asking_rent
    const room = (a.rooms as any)?.name || 'the room'
    const place = String((a.properties as any)?.address || (a.properties as any)?.name || '').split('\n')[0]
    const first = (a as any).first_name || a.full_name.split(' ')[0]
    setDeclineFor(a.id)
    setDeclineText({
      subject: `Your offer for ${room}${place ? `, ${place}` : ''}`,
      body: `Hi ${first},\n\nThank you for your offer of £${Number(a.offered_rent ?? 0).toLocaleString()} a month for ${room}${place ? ` at ${place}` : ''}, and for taking the time to apply.\n\nUnfortunately we’re not able to accept it — the rent for this room is £${Number(asking ?? 0).toLocaleString()} a month.\n\nIf you’d still like the room at £${Number(asking ?? 0).toLocaleString()} a month, just press the button below and we’ll pick your application straight back up — there’s no need to fill anything in again. Or, if you’d like to make a higher offer, simply reply to this email.\n\nKind regards,`,
    })
  }

  async function sendDecline(a: Applicant) {
    setDeclining(true)
    const res = await adminFetch(`/api/applicants/${a.id}/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'asking_rent', subject: declineText.subject, body: declineText.body }) })
    const d = await res.json().catch(() => ({}))
    setDeclining(false)
    if (!res.ok) { alert(d.error || 'Could not send'); return }
    setApplicants(prev => prev.map(x => x.id === a.id ? { ...x, pipeline_stage: 'rejected' as Stage } : x))
    setDeclineFor(null)
  }

  async function setArchived(applicant: Applicant, archive: boolean, reason = '') {
    if (archive && !reason.trim()) return
    const res = await fetch(`/api/applicants/${applicant.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archive, reason }) })
    if (!res.ok) { const err = await res.json().catch(() => ({})); alert(err.error || 'Could not save'); return }
    setApplicants(prev => prev.map(a => a.id === applicant.id ? { ...a, archived_at: archive ? new Date().toISOString() : null, archived_reason: archive ? reason : null } : a))
    setArchiveFor(null)
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
    if (!addForm.name.salutation) { setAddError('Choose a title (Mr, Mrs, Ms, Miss…)'); return }
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
          { label: 'Applied', value: applicants.filter(a => !a.archived_at && a.pipeline_stage === 'applied').length },
          { label: 'Offer sent', value: applicants.filter(a => !a.archived_at && a.pipeline_stage === 'offer_sent').length, tone: 'warn' },
          { label: 'Referencing', value: applicants.filter(a => !a.archived_at && ['referencing', 'referencing_passed', 'docs_uploaded'].includes(a.pipeline_stage)).length, tone: 'info' },
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
                <HouseSearch
                  houses={properties}
                  selectedId={addForm.property_id}
                  onHouse={id => setAddForm(f => ({ ...f, property_id: id }))}
                  onNew={(address, postcode) => setShowNewAddress({ address, postcode })}
                  className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm"
                />
                <p className="mt-xs text-[11px] text-neutral-500">Type the house, street or postcode — a house we don’t have yet can be added as let-only from the list.</p>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-neutral-600 mb-xs uppercase tracking-wide">Room *</label>
                <select value={addForm.room_id} onChange={e => setAddForm(f => ({ ...f, room_id: e.target.value }))} className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm">
                  <option value="">Select room…</option>
                  {filteredAddRooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
                {addForm.property_id && (() => {
                  const h = properties.find(p => p.id === addForm.property_id)
                  return h && (
                    <button type="button" onClick={() => setShowNewAddress({ address: String(h.name || h.address || '').split(/[,\n]/)[0], postcode: h.postcode || '' })}
                      className="mt-xs text-xs font-bold text-neutral-700 underline">
                      {filteredAddRooms.length ? 'Room not listed? Add a let-only room here' : 'No rooms yet — add the let-only room'}
                    </button>
                  )
                })()}
              </div>
            </div>
            {showNewAddress && (
              <AddLetOnlyModal
                initialAddress={showNewAddress.address}
                initialPostcode={showNewAddress.postcode}
                onClose={() => setShowNewAddress(null)}
                onSave={async (property: any, roomIds: string[]) => {
                  setShowNewAddress(null)
                  pendingRoom.current = roomIds[0] ?? null
                  await loadAll()
                  setAddForm(f => ({ ...f, property_id: property.id }))
                }}
              />
            )}
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
          {applicants.some(a => a.archived_at) && (
            <button onClick={() => setShowArchived(v => !v)}
              className={`rounded-xl px-md py-sm text-sm font-semibold transition-all ${showArchived ? 'bg-neutral-900 text-white' : 'border border-dashed border-neutral-300 text-neutral-500 hover:border-neutral-400'}`}>
              {showArchived ? '← Back to current' : `Archived (${applicants.filter(a => a.archived_at).length})`}
            </button>
          )}
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
                        <p className="text-sm font-semibold text-neutral-900 truncate">{displayName(applicant as any)}</p>
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
                      {/* Next step first (Harry, 12 Oct: "still cannot open tenancy file … no way to progress it") — the letting file if
                          there is one, else what has to happen before it can start. Was at the bottom of a long card. */}
                      {lettingFiles[applicant.id] && (
                        <a href={`/admin/lettings/${lettingFiles[applicant.id]}?from=/admin/applicants`}
                          className="flex items-center justify-between rounded-lg bg-blue-700 px-md py-sm text-sm font-semibold text-white hover:bg-blue-600">
                          <span>Let agreed — the letting file tracks it from here</span><span>Open letting file →</span>
                        </a>
                      )}
                      {/* The way to the letting file (Harry, 12 Oct 2026: "it should say you cannot start the letting file until
                          x is done"): recording the holding deposit creates the tenancy and opens its letting file; a let with no
                          holding deposit goes through Set up tenancy instead. Nothing else marks someone let agreed. */}
                      {((!isConverted && ['applied', 'offer_sent', 'referencing', 'referencing_passed', 'docs_uploaded'].includes(applicant.pipeline_stage))
                        || (isConverted && !lettingFiles[applicant.id] && !applicant.converted_person_id)) && (
                        <div className={`w-full rounded-lg border px-md py-sm text-xs ${isConverted ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-neutral-200 bg-neutral-50 text-neutral-700'}`}>
                          <p className="font-semibold">
                            {isConverted
                              ? 'Marked let agreed, but the holding deposit was never recorded — so there’s no tenancy or letting file yet.'
                              : '🔒 The letting file starts once the holding deposit is recorded.'}
                          </p>
                          <div className="mt-xs flex flex-wrap items-center gap-sm">
                            <button type="button" onClick={() => setDepositFor(applicant.id)}
                              className="rounded-lg border border-green-700 bg-green-700 px-md py-xs font-semibold text-white hover:bg-green-600">
                              💷 Holding deposit received
                            </button>
                            <span className="text-neutral-500">creates the tenancy and opens its letting file ·</span>
                            <a href={`/admin/applicants/${applicant.id}/create-tenancy`}
                              onClick={e => { if (!confirm(`Set up ${applicant.full_name}’s tenancy without a holding deposit? Only do this if no holding deposit was taken for this let.`)) e.preventDefault() }}
                              className="font-semibold text-neutral-700 underline hover:text-neutral-900">No holding deposit on this let? Set up the tenancy</a>
                          </div>
                        </div>
                      )}

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


                        {/* Accept offer & send the reserve email — on 'applied', and again on 'offer_sent' (no holding deposit yet:
                            recording one moves them on to referencing). An offer email that failed used to leave people at
                            'offer_sent' with no way to send the link (Chloe, 15 Oct 2026). */}
                        {['applied', 'offer_sent'].includes(applicant.pipeline_stage) && applicant.rent_offer_type === 'below_asking' && applicant.offered_rent && (applicant.rooms as any)?.current_asking_rent && Number(applicant.offered_rent) < Number((applicant.rooms as any).current_asking_rent) && (
                          <button type="button" onClick={() => declineFor === applicant.id ? setDeclineFor(null) : openDecline(applicant)}
                            className="text-xs font-semibold border border-red-300 text-red-700 rounded-lg px-md py-sm hover:bg-red-50">
                            Decline £{Number(applicant.offered_rent).toLocaleString()} offer…
                          </button>
                        )}

                        {(applicant.pipeline_stage === 'applied' || applicant.pipeline_stage === 'offer_sent') && (
                          <button
                            onClick={() => acceptOffer(applicant)}
                            disabled={acceptingSending === applicant.id || acceptSentFor.has(applicant.id)}
                            className="text-xs font-semibold border border-emerald-700 bg-emerald-700 text-white rounded-lg px-md py-sm hover:bg-emerald-600 disabled:opacity-50 ml-auto"
                          >
                            {acceptingSending === applicant.id
                              ? 'Sending…'
                              : acceptSentFor.has(applicant.id)
                                ? '✓ Reserve email sent'
                                : applicant.pipeline_stage === 'offer_sent' ? 'Resend reserve email'
                                  : applicant.rent_offer_type === 'below_asking' && applicant.offered_rent ? `✓ Accept £${Number(applicant.offered_rent).toLocaleString()} offer & send reserve email` : '✓ Accept offer & send reserve email'}
                          </button>
                        )}

                        {/* Stage advance — generic for all other transitions */}
                        {/* never "Let agreed" from here — only the holding deposit or Set up tenancy (above) creates the tenancy and letting file */}
                        {!isConverted && nextStage && nextStage.key !== 'converted' && applicant.pipeline_stage !== 'applied' && (
                          <button
                            onClick={() => advanceStage(applicant, nextStage.key as Stage)}
                            disabled={advancing === applicant.id}
                            className={`text-xs font-semibold border border-neutral-900 bg-neutral-900 text-white rounded-lg px-md py-sm hover:bg-neutral-700 disabled:opacity-50 ${applicant.pipeline_stage !== 'applied' ? 'ml-auto' : ''}`}
                          >
                            {advancing === applicant.id ? 'Updating…' : `→ Mark as ${nextStage.label}`}
                          </button>
                        )}

                        {declineFor === applicant.id && (
                          <div className="basis-full rounded-xl border border-red-200 bg-red-50/40 p-md space-y-sm">
                            <p className="text-xs font-bold uppercase tracking-wide text-red-800">Decline this offer — the email they’ll get</p>
                            <input value={declineText.subject} onChange={e => setDeclineText(t => ({ ...t, subject: e.target.value }))} className="w-full rounded-lg border border-neutral-300 bg-white px-sm py-xs text-sm" />
                            <textarea value={declineText.body} onChange={e => setDeclineText(t => ({ ...t, body: e.target.value }))} rows={9} className="w-full rounded-lg border border-neutral-300 bg-white px-sm py-xs text-sm" />
                            <p className="text-xs text-neutral-600">Under your message they’ll see a button: <strong>“Yes — I’m happy to offer £{Number((applicant.rooms as any)?.current_asking_rent ?? 0).toLocaleString()} per month →”</strong>. Pressing it puts the application back to Applied at that rent and emails you. The application shows as “Offer declined” until then.</p>
                            <div className="flex gap-sm">
                              <button type="button" disabled={declining || !declineText.subject.trim() || !declineText.body.trim()} onClick={() => sendDecline(applicant)} className="rounded-lg bg-red-700 px-md py-xs text-sm font-bold text-white disabled:opacity-40">{declining ? 'Sending…' : 'Send and decline'}</button>
                              <button type="button" onClick={() => setDeclineFor(null)} className="text-sm font-semibold text-neutral-600 underline">Cancel</button>
                            </div>
                          </div>
                        )}

                        {archiveFor === applicant.id ? (
                          <span className="flex flex-wrap items-center gap-xs rounded-lg bg-neutral-100 px-sm py-xs text-xs">
                            <span className="font-semibold text-neutral-700">Archive — why?</span>
                            <select value={['Not interested', 'Withdrew', 'Duplicate', 'Test'].includes(archiveReason) ? archiveReason : 'Other'} onChange={e => setArchiveReason(e.target.value === 'Other' ? '' : e.target.value)} className="rounded border border-neutral-300 bg-white px-xs py-0.5 text-xs">
                              {['Not interested', 'Withdrew', 'Duplicate', 'Test', 'Other'].map(x => <option key={x}>{x}</option>)}
                            </select>
                            {!['Not interested', 'Withdrew', 'Duplicate', 'Test'].includes(archiveReason) && (
                              <input autoFocus value={archiveReason} onChange={e => setArchiveReason(e.target.value)} placeholder="Reason" className="w-36 rounded border border-neutral-300 bg-white px-xs py-0.5 text-xs" />
                            )}
                            <button type="button" disabled={!archiveReason.trim()} onClick={() => setArchived(applicant, true, archiveReason)} className="rounded bg-neutral-900 px-sm py-0.5 font-bold text-white disabled:opacity-40">Archive</button>
                            <button type="button" onClick={() => setArchiveFor(null)} className="font-semibold text-neutral-500 underline">Cancel</button>
                          </span>
                        ) : (
                          <button type="button" onClick={() => applicant.archived_at ? setArchived(applicant, false) : (setArchiveFor(applicant.id), setArchiveReason('Not interested'))}
                            className="text-xs font-semibold text-neutral-500 underline hover:text-neutral-800">
                            {applicant.archived_at ? `Restore (archived: ${applicant.archived_reason ?? ''})` : 'Archive'}
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
