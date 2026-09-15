'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import { sortPropertiesNumerically } from '@/lib/sortProperties'
import NameInput, { type NameValue, emptyName, toFullName } from '@/app/components/NameInput'

const STAGES = [
  { key: 'invited',            label: 'Invited',            color: 'bg-neutral-100 text-neutral-600',  dot: 'bg-neutral-400' },
  { key: 'applied',            label: 'Applied',            color: 'bg-blue-50 text-blue-700',         dot: 'bg-blue-500' },
  { key: 'offer_sent',         label: 'Offer sent',         color: 'bg-amber-50 text-amber-700',       dot: 'bg-amber-500' },
  { key: 'referencing',        label: 'Referencing',        color: 'bg-violet-50 text-violet-700',     dot: 'bg-violet-500' },
  { key: 'referencing_passed', label: 'Ref. passed',        color: 'bg-sky-50 text-sky-700',           dot: 'bg-sky-500' },
  { key: 'docs_uploaded',      label: 'Docs uploaded',      color: 'bg-teal-50 text-teal-700',         dot: 'bg-teal-600' },
  { key: 'converted',          label: 'Converted ✓',        color: 'bg-green-50 text-green-700',       dot: 'bg-green-500' },
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
  useEffect(() => {
    if (!addForm.property_id) { setFilteredAddRooms([]); return }
    setFilteredAddRooms(rooms.filter(r => r.property_id === addForm.property_id))
    setAddForm(f => ({ ...f, room_id: '' }))
  }, [addForm.property_id, rooms])

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

  async function advanceStage(applicant: Applicant, newStage: Stage) {
    setAdvancing(applicant.id)
    try {
      const res = await fetch(`/api/applicants/${applicant.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pipeline_stage: newStage }),
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
      if (confirm(`Converted! Go to their tenant profile now?`)) {
        router.push(`/admin/tenant/${data.personId}`)
      }
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
          full_name:      fullName.trim(),
          first_name:     addForm.name.first_name,
          last_name:      addForm.name.last_name,
          salutation:     addForm.name.salutation,
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
        <div className="mx-auto max-w-2xl px-lg py-xl">
          <div className="rounded-xl bg-red-50 border border-red-200 p-lg text-sm text-red-700">{error}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin" />} />

      <main className="mx-auto max-w-5xl px-lg py-lg">
        {/* Header */}
        <div className="mb-xl flex items-start justify-between gap-md flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-neutral-900">Applicants</h1>
            <p className="mt-xs text-sm text-neutral-500">
              {applicants.filter(a => a.pipeline_stage !== 'converted').length} active · {applicants.filter(a => a.pipeline_stage === 'converted').length} converted
            </p>
          </div>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="rounded-xl bg-neutral-900 px-lg py-md text-sm font-bold text-white hover:bg-neutral-700 transition-colors"
          >
            + Add Applicant
          </button>
        </div>

        {/* Add form */}
        {showAdd && (
          <div className="mb-xl rounded-2xl border-2 border-neutral-900 bg-white p-lg">
            <h2 className="text-base font-bold text-neutral-900 mb-md">Add Applicant Directly</h2>
            <div className="grid gap-md sm:grid-cols-2">
              <div className="sm:col-span-2">
                <NameInput
                  value={addForm.name}
                  onChange={n => setAddForm(f => ({ ...f, name: n, full_name: toFullName(n) }))}
                  required
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
                <div key={applicant.id} className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
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

                      {/* Key details */}
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
                          </div>
                        )}
                        {applicant.preferred_start_date && (
                          <div>
                            <p className="font-semibold text-neutral-500 uppercase tracking-wide mb-xs">Preferred start</p>
                            <p className="text-neutral-900">{new Date(applicant.preferred_start_date).toLocaleDateString('en-GB')}</p>
                          </div>
                        )}
                        <div>
                          <p className="font-semibold text-neutral-500 uppercase tracking-wide mb-xs">Added</p>
                          <p className="text-neutral-900">{new Date(applicant.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                        </div>
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
                        {applicant.phone && (
                          <a href={`tel:${applicant.phone}`} className="text-xs font-semibold border border-neutral-300 rounded-lg px-md py-sm hover:bg-neutral-50">📱 Call</a>
                        )}
                        {applicant.converted_person_id && (
                          <a href={`/admin/tenant/${applicant.converted_person_id}`} className="text-xs font-semibold border border-blue-200 text-blue-700 rounded-lg px-md py-sm hover:bg-blue-50">
                            View tenant profile →
                          </a>
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

                        {/* Convert to tenant */}
                        {applicant.pipeline_stage === 'docs_uploaded' && !isConverted && (
                          <button
                            onClick={() => convertToTenant(applicant)}
                            disabled={converting === applicant.id}
                            className="text-xs font-semibold border border-green-700 bg-green-700 text-white rounded-lg px-md py-sm hover:bg-green-600 disabled:opacity-50"
                          >
                            {converting === applicant.id ? 'Converting…' : '✓ Convert to Tenant'}
                          </button>
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
    </div>
  )
}
