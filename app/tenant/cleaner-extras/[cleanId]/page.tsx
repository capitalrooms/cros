'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'

// Curated list of extras tenants can request the cleaner does if time allows.
// These are tasks tenants shouldn't be expected to do themselves.
const EXTRAS = [
  { id: 'hair_plugs', label: 'Pull hair from plug holes', icon: '🚿', area: 'Bathroom' },
  { id: 'fridge_inside', label: 'Clean inside the fridge', icon: '🧊', area: 'Kitchen' },
  { id: 'oven_inside', label: 'Clean inside the oven', icon: '🔥', area: 'Kitchen' },
  { id: 'cupboards_inside', label: 'Wipe inside kitchen cupboards', icon: '🗄️', area: 'Kitchen' },
  { id: 'microwave_inside', label: 'Clean inside the microwave', icon: '📦', area: 'Kitchen' },
  { id: 'windows_external', label: 'Clean ground-floor external windows', icon: '🪟', area: 'External' },
  { id: 'windows_internal', label: 'Wipe window sills & internal frames', icon: '🪟', area: 'Windows' },
  { id: 'extractor_fan', label: 'Wipe kitchen extractor fan', icon: '💨', area: 'Kitchen' },
  { id: 'limescale_taps', label: 'Remove limescale from taps & showerhead', icon: '💧', area: 'Bathroom' },
  { id: 'grouting', label: 'Scrub grouting / tile edges', icon: '🧱', area: 'Bathroom' },
  { id: 'toilet_behind', label: 'Clean behind & around toilet base', icon: '🚽', area: 'Bathroom' },
  { id: 'skirting_boards', label: 'Wipe skirting boards (communal areas)', icon: '🧹', area: 'Communal' },
  { id: 'light_fittings', label: 'Dust light fittings & ceiling corners', icon: '💡', area: 'Communal' },
  { id: 'behind_sofa', label: 'Vacuum behind / under sofas', icon: '🛋️', area: 'Living Room' },
  { id: 'bin_wipe', label: 'Clean inside communal bins', icon: '🗑️', area: 'Communal' },
  { id: 'washing_machine', label: 'Clean washing machine drum & seal', icon: '🫧', area: 'Kitchen' },
]

const AREAS = ['All', ...Array.from(new Set(EXTRAS.map(e => e.area)))]

export default function CleanerExtrasPage() {
  const { cleanId } = useParams<{ cleanId: string }>()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [cleanInfo, setCleanInfo] = useState<any>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [notes, setNotes] = useState('')
  const [filterArea, setFilterArea] = useState('All')
  const [existingRequest, setExistingRequest] = useState<any>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }

      // Load clean info
      const { data: clean } = await supabase
        .from('cleans')
        .select('id, clean_date, clean_time, properties(name, address)')
        .eq('id', cleanId)
        .single()
      setCleanInfo(clean)

      // Check for existing request via API
      const res = await fetch(`/api/tenant/cleaner-extras?cleanId=${cleanId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.ok) {
        const { request } = await res.json()
        if (request) {
          setExistingRequest(request)
          setSelected(new Set(request.tasks || []))
          setNotes(request.notes || '')
        }
      }

      setLoading(false)
    }
    load()
  }, [cleanId, router])

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSubmit() {
    if (selected.size === 0) return
    setSubmitting(true)

    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const tasks = EXTRAS.filter(e => selected.has(e.id)).map(e => e.label)

    const res = await fetch('/api/tenant/cleaner-extras', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ cleanId, tasks, notes: notes.trim() || null }),
    })

    if (res.ok) setDone(true)
    setSubmitting(false)
  }

  const filtered = filterArea === 'All' ? EXTRAS : EXTRAS.filter(e => e.area === filterArea)

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar left={<BackButton href="/tenant" />} />
        <div className="flex items-center justify-center py-3xl">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-300 border-t-neutral-900" />
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar left={<BackButton href="/tenant" />} />
        <div className="mx-auto max-w-lg px-lg py-3xl text-center">
          <p className="text-5xl">🧹</p>
          <h1 className="mt-lg text-2xl font-bold text-neutral-900">Request sent!</h1>
          <p className="mt-sm text-neutral-600">
            We've let the cleaner and admin know. They'll do their best to fit in your requests if time allows.
          </p>
          <div className="mt-xl rounded-2xl border border-neutral-200 bg-white p-lg text-left">
            <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">Requested extras</p>
            <ul className="mt-md space-y-xs">
              {EXTRAS.filter(e => selected.has(e.id)).map(e => (
                <li key={e.id} className="flex items-center gap-sm text-sm text-neutral-700">
                  <span>{e.icon}</span> {e.label}
                </li>
              ))}
            </ul>
            {notes && (
              <p className="mt-md border-t border-neutral-100 pt-md text-sm text-neutral-600">
                <span className="font-semibold">Note:</span> {notes}
              </p>
            )}
          </div>
          <button
            onClick={() => router.push('/tenant')}
            className="mt-xl w-full rounded-2xl bg-neutral-900 py-md text-white font-semibold"
          >
            Back to dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/tenant" />} />

      <div className="mx-auto max-w-lg px-lg pt-xl">
        <div className="mb-xl">
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">Cleaning visit</p>
          <h1 className="mt-xs text-2xl font-bold text-neutral-900">Request extras</h1>
          {cleanInfo && (
            <p className="mt-xs text-sm text-neutral-600">
              {cleanInfo.properties?.name} · {cleanInfo.clean_date
                ? new Date(cleanInfo.clean_date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
                : 'Upcoming clean'}
            </p>
          )}
          <p className="mt-md text-sm text-neutral-500">
            Select any extras you'd like the cleaner to do <strong>if time allows</strong>. These are jobs that go beyond the standard clean — things tenants shouldn't need to do themselves.
          </p>
        </div>

        {existingRequest && (
          <div className="mb-lg rounded-xl border border-blue-200 bg-blue-50 p-md text-sm text-blue-800">
            You've already submitted a request — updating it will replace your previous selection.
          </div>
        )}

        {/* Area filter chips */}
        <div className="mb-lg flex flex-wrap gap-xs">
          {AREAS.map(area => (
            <button
              key={area}
              onClick={() => setFilterArea(area)}
              className={`rounded-full px-md py-xs text-sm font-medium transition-colors ${
                filterArea === area
                  ? 'bg-neutral-900 text-white'
                  : 'bg-white text-neutral-600 border border-neutral-200'
              }`}
            >
              {area}
            </button>
          ))}
        </div>

        {/* Task chips */}
        <div className="space-y-xs">
          {filtered.map(extra => {
            const isSelected = selected.has(extra.id)
            return (
              <button
                key={extra.id}
                onClick={() => toggle(extra.id)}
                className={`flex w-full items-center gap-md rounded-2xl border-2 p-md text-left transition-all ${
                  isSelected
                    ? 'border-neutral-900 bg-neutral-900 text-white'
                    : 'border-neutral-200 bg-white text-neutral-700'
                }`}
              >
                <span className="text-xl">{extra.icon}</span>
                <div className="flex-1">
                  <p className="font-medium leading-snug">{extra.label}</p>
                  <p className={`text-xs ${isSelected ? 'text-neutral-400' : 'text-neutral-400'}`}>{extra.area}</p>
                </div>
                {isSelected && (
                  <span className="text-lg">✓</span>
                )}
              </button>
            )
          })}
        </div>

        {/* Notes */}
        <div className="mt-xl">
          <label className="block text-sm font-semibold text-neutral-700 mb-xs">
            Anything else? (optional)
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="e.g. The fridge bottom shelf has a spill, please pay extra attention"
            rows={3}
            className="w-full rounded-xl border border-neutral-200 bg-white px-md py-sm text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900"
          />
        </div>

        {/* Selection summary & submit */}
        <div className="mt-xl sticky bottom-lg">
          <button
            onClick={handleSubmit}
            disabled={selected.size === 0 || submitting}
            className="w-full rounded-2xl bg-neutral-900 py-md text-white font-semibold disabled:opacity-40 transition-opacity"
          >
            {submitting
              ? 'Sending…'
              : selected.size === 0
                ? 'Select at least one task'
                : `Request ${selected.size} extra${selected.size === 1 ? '' : 's'}`}
          </button>
          {selected.size > 0 && (
            <p className="mt-sm text-center text-xs text-neutral-500">
              The cleaner will do their best — extras depend on available time.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
