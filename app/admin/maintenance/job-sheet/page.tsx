'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import { TIME_SLOTS, earliestBookableDate } from '@/lib/booking'
import { sortPropertiesNumerically } from '@/lib/sortProperties'
import { displayName } from '@/lib/people'

interface Property { id: string; name: string; address: string }
interface Contractor { id: string; first_name: string; last_name: string; full_name: string; email: string }
interface Room { id: string; name: string; property_id: string }
interface TaskRow { area: string; description: string }

function dn(c: Contractor) {
  return c.full_name?.trim() || `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email
}

export default function JobSheetPage() {
  const router = useRouter()

  const [loading, setLoading]         = useState(true)
  const [properties, setProperties]   = useState<Property[]>([])
  const [contractors, setContractors] = useState<Contractor[]>([])
  const [rooms, setRooms]             = useState<Room[]>([])
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState('')

  // Core fields
  const [propertyId, setPropertyId]     = useState('')
  const [contractorId, setContractorId] = useState('')
  const [priority, setPriority]         = useState<'low'|'normal'|'high'>('normal')
  const [adminNote, setAdminNote]       = useState('')

  // Send mode
  const [mode, setMode] = useState<'assign' | 'quote' | 'book'>('assign')
  const [bookedDate, setBookedDate] = useState('')
  const [bookedSlot, setBookedSlot] = useState('')

  // Tasks
  const [tasks, setTasks] = useState<TaskRow[]>([
    { area: '', description: '' },
    { area: '', description: '' },
  ])

  useEffect(() => {
    async function init() {
      const user = await getCurrentUser()
      if (!user || !['administrator', 'admin'].includes(user.assignment?.role || '')) {
        router.push('/admin'); return
      }
      const supabase = createClient()
      const [{ data: props }, { data: contrs }] = await Promise.all([
        supabase.from('properties').select('id, name, address').order('name'),
        supabase.from('people').select('id, first_name, last_name, full_name, email').eq('role', 'contractor').order('first_name'),
      ])
      setProperties(sortPropertiesNumerically(props || []))
      setContractors(contrs || [])
      setLoading(false)
    }
    init()
  }, [router])

  useEffect(() => {
    if (!propertyId) { setRooms([]); return }
    createClient()
      .from('rooms').select('id, name, property_id').eq('property_id', propertyId).order('name')
      .then(({ data }) => setRooms(data || []))
  }, [propertyId])

  function addTask() { setTasks(t => [...t, { area: '', description: '' }]) }
  function removeTask(i: number) { setTasks(t => t.filter((_, idx) => idx !== i)) }
  function updateTask(i: number, field: keyof TaskRow, value: string) {
    setTasks(t => t.map((row, idx) => idx === i ? { ...row, [field]: value } : row))
  }

  const validTasks = tasks.filter(t => t.description.trim())

  async function handleSubmit() {
    if (!propertyId)    { setError('Select a property'); return }
    if (!contractorId)  { setError('Select a contractor'); return }
    if (validTasks.length === 0) { setError('Add at least one task'); return }
    if (mode === 'book' && !bookedDate) { setError('Pick a date or choose a different send option'); return }

    setSaving(true); setError('')
    try {
      const supabase = createClient()
      const contractor = contractors.find(c => c.id === contractorId)
      const property   = properties.find(p => p.id === propertyId)
      const contractorName = contractor ? dn(contractor) : 'Contractor'

      const jobTitle = `${validTasks.length} task${validTasks.length !== 1 ? 's' : ''} — ${property?.name || 'property'}`
      const jobDesc  = validTasks.map(t => `${t.area ? t.area + ': ' : ''}${t.description}`).join('\n')

      const { data: ticket, error: ticketErr } = await supabase
        .from('maintenance_tickets')
        .insert({
          title:          jobTitle,
          description:    jobDesc,
          property_id:    propertyId,
          contractor_id:  contractorId,
          priority,
          category:       'general',
          status:         'assigned',
          approved_at:    new Date().toISOString(),
          admin_note:     adminNote.trim() || null,
          quote_requested: mode === 'quote',
          booked_date:    mode === 'book' && bookedDate ? bookedDate : null,
          booked_slot:    mode === 'book' && bookedSlot ? bookedSlot : null,
        })
        .select('id')
        .single()
      if (ticketErr || !ticket) throw new Error(ticketErr?.message || 'Failed to create job')

      // Create a property_task row for each task
      await supabase.from('property_tasks').insert(
        validTasks.map(t => ({
          property_id:  propertyId,
          description:  t.description.trim(),
          notes:        t.area.trim() || null,   // area stored as notes (visible label)
          responsible:  contractorName,
          status:       'converted',
          ticket_id:    ticket.id,
        }))
      )

      // Fire-and-forget notify
      fetch('/api/notify-job-raised', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId: ticket.id }),
      }).catch(() => {})

      router.push('/admin/maintenance')
    } catch (e: any) {
      setError(e.message || 'Something went wrong')
      setSaving(false)
    }
  }

  const minDate = earliestBookableDate()

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50">
        <AppBar left={<BackButton href="/admin/maintenance" />} title="Job sheet" />
        <div className="animate-pulse p-lg space-y-md max-w-2xl mx-auto mt-xl">
          {[1,2,3].map(i => <div key={i} className="h-14 rounded-2xl bg-neutral-200" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <AppBar left={<BackButton href="/admin/maintenance" />} title="Send job sheet" />

      <div className="max-w-2xl mx-auto px-lg py-xl space-y-xl">

        {/* ── Property + Contractor ──────────────────────────────────────── */}
        <section className="bg-white rounded-2xl border border-neutral-200 p-lg space-y-md">
          <h2 className="font-bold text-neutral-900">Who &amp; where</h2>

          <div>
            <label className="block text-sm font-semibold text-neutral-700 mb-xs">Property</label>
            <select
              value={propertyId}
              onChange={e => setPropertyId(e.target.value)}
              className="w-full border border-neutral-300 rounded-xl px-md py-sm text-sm bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900"
            >
              <option value="">Select property…</option>
              {properties.map(p => (
                <option key={p.id} value={p.id}>{p.name} — {p.address}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-neutral-700 mb-xs">Contractor</label>
            <select
              value={contractorId}
              onChange={e => setContractorId(e.target.value)}
              className="w-full border border-neutral-300 rounded-xl px-md py-sm text-sm bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900"
            >
              <option value="">Select contractor…</option>
              {contractors.map(c => (
                <option key={c.id} value={c.id}>{dn(c)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-neutral-700 mb-xs">Priority</label>
            <div className="flex gap-sm">
              {(['low','normal','high'] as const).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`flex-1 py-sm rounded-xl text-sm font-semibold border transition-colors capitalize ${
                    priority === p
                      ? p === 'high' ? 'bg-red-600 text-white border-red-600'
                        : p === 'low' ? 'bg-neutral-200 text-neutral-900 border-neutral-200'
                        : 'bg-neutral-900 text-white border-neutral-900'
                      : 'bg-white text-neutral-500 border-neutral-200 hover:border-neutral-400'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ── Tasks ──────────────────────────────────────────────────────── */}
        <section className="bg-white rounded-2xl border border-neutral-200 p-lg">
          <div className="flex items-center justify-between mb-md">
            <h2 className="font-bold text-neutral-900">Tasks</h2>
            <span className="text-xs text-neutral-400">{validTasks.length} added</span>
          </div>

          <div className="space-y-sm mb-md">
            {tasks.map((task, i) => (
              <div key={i} className="flex gap-sm items-start">
                <div className="flex-1 flex gap-sm">
                  {/* Area / location — short freeform */}
                  <input
                    type="text"
                    value={task.area}
                    onChange={e => updateTask(i, 'area', e.target.value)}
                    placeholder="Area (e.g. Kitchen)"
                    className="w-32 shrink-0 border border-neutral-200 rounded-xl px-sm py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  />
                  {/* What to do */}
                  <input
                    type="text"
                    value={task.description}
                    onChange={e => updateTask(i, 'description', e.target.value)}
                    placeholder="What needs doing…"
                    className="flex-1 border border-neutral-200 rounded-xl px-sm py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  />
                </div>
                {tasks.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeTask(i)}
                    className="mt-1 text-neutral-300 hover:text-red-500 transition-colors text-lg leading-none"
                    aria-label="Remove task"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addTask}
            className="w-full py-sm border-2 border-dashed border-neutral-200 rounded-xl text-sm font-semibold text-neutral-400 hover:border-neutral-400 hover:text-neutral-700 transition-colors"
          >
            + Add another task
          </button>
        </section>

        {/* ── Note for contractor ────────────────────────────────────────── */}
        <section className="bg-white rounded-2xl border border-neutral-200 p-lg space-y-md">
          <h2 className="font-bold text-neutral-900">Note for contractor <span className="text-neutral-400 font-normal">(optional)</span></h2>
          <textarea
            value={adminNote}
            onChange={e => setAdminNote(e.target.value)}
            rows={3}
            placeholder="Access info, key safe code, photos attached to individual jobs, anything they need to know before arriving…"
            className="w-full border border-neutral-200 rounded-xl px-md py-sm text-sm resize-none focus:outline-none focus:ring-2 focus:ring-neutral-900"
          />
        </section>

        {/* ── Send options ───────────────────────────────────────────────── */}
        <section className="bg-white rounded-2xl border border-neutral-200 p-lg space-y-md">
          <h2 className="font-bold text-neutral-900">How to send</h2>

          <div className="grid grid-cols-3 gap-sm">
            {[
              { key: 'assign', label: 'Assign', sub: 'They pick the date' },
              { key: 'quote',  label: 'Request quote', sub: 'They price it first' },
              { key: 'book',   label: 'Book a date', sub: 'You pick the date' },
            ].map(opt => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setMode(opt.key as typeof mode)}
                className={`p-md rounded-xl border-2 text-left transition-colors ${
                  mode === opt.key
                    ? 'border-neutral-900 bg-neutral-900 text-white'
                    : 'border-neutral-200 hover:border-neutral-400'
                }`}
              >
                <p className={`text-sm font-bold ${mode === opt.key ? 'text-white' : 'text-neutral-900'}`}>{opt.label}</p>
                <p className={`text-xs mt-0.5 ${mode === opt.key ? 'text-white/70' : 'text-neutral-400'}`}>{opt.sub}</p>
              </button>
            ))}
          </div>

          {mode === 'book' && (
            <div className="grid grid-cols-2 gap-sm pt-sm border-t border-neutral-100">
              <div>
                <label className="block text-xs font-semibold text-neutral-600 mb-xs">Date</label>
                <input
                  type="date"
                  value={bookedDate}
                  min={minDate}
                  onChange={e => setBookedDate(e.target.value)}
                  className="w-full border border-neutral-200 rounded-xl px-sm py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-600 mb-xs">Time slot <span className="text-neutral-400 font-normal">(optional)</span></label>
                <select
                  value={bookedSlot}
                  onChange={e => setBookedSlot(e.target.value)}
                  className="w-full border border-neutral-200 rounded-xl px-sm py-sm text-sm bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900"
                >
                  <option value="">Any time</option>
                  {TIME_SLOTS.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {mode === 'quote' && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-md py-sm">
              <p className="text-xs text-amber-800 font-semibold">
                The contractor will see this as a quote request. They can submit a price or flag that they need to visit first before quoting.
              </p>
            </div>
          )}
        </section>

        {/* ── Error + Submit ─────────────────────────────────────────────── */}
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-md py-sm">
            <p className="text-sm text-red-700 font-semibold">{error}</p>
          </div>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="w-full bg-neutral-950 text-white font-bold py-md rounded-2xl text-sm hover:bg-neutral-800 transition-colors disabled:opacity-50"
        >
          {saving
            ? 'Sending…'
            : mode === 'quote'
              ? `Request quote from contractor · ${validTasks.length} task${validTasks.length !== 1 ? 's' : ''}`
              : `Send job sheet · ${validTasks.length} task${validTasks.length !== 1 ? 's' : ''}`
          }
        </button>

        <div className="pb-xl" />
      </div>
    </div>
  )
}
