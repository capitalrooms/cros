'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser, signOut } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'

/**
 * Things the cleaner regularly needs tenants to do differently. Grouped by area
 * so she taps an area then picks — faster on a phone than one long list.
 */
const TENANT_TODOS: Record<string, string[]> = {
  Bathroom: [
    'Take hair out of the shower trap more regularly',
    'Leave towels to dry on the radiator',
    'Keep toiletries off the floor so it can be mopped',
  ],
  Kitchen: [
    'Wash up rather than leaving dishes in the sink',
    'Empty the bin when it is full',
    'Wipe down the hob after cooking',
  ],
  'Communal areas': [
    'Keep shoes on the rack, not in the hallway',
    'Take personal items back to your room',
    'Break down boxes before putting them out',
  ],
  Bedrooms: ['Leave the door open if you want it cleaned', 'Clear the floor before the clean'],
}

/** Bigger jobs not done on every visit. */
const SPECIAL_JOBS = [
  'Swept front yard',
  'Cleaned external windows',
  'Cleaned oven',
  'Cleaned inside cupboards',
  'Descaled shower head',
  'Cleaned inside fridge',
  'Washed bins out',
  'Dusted skirting boards',
  'Cleaned behind appliances',
  'Defrosted freezer',
]

export default function CleanerDashboard() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [me, setMe] = useState<any>(null)
  const [properties, setProperties] = useState<any[]>([])
  const [cleans, setCleans] = useState<any[]>([])
  const [error, setError] = useState('')

  const [propertyId, setPropertyId] = useState('')
  const [cleanDate, setCleanDate] = useState(new Date().toISOString().split('T')[0])
  const [cleanTime, setCleanTime] = useState('10:00')

  const [active, setActive] = useState<any>(null)
  const [openArea, setOpenArea] = useState<string | null>(null)
  const [todos, setTodos] = useState<string[]>([])
  const [specials, setSpecials] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [issue, setIssue] = useState('')
  const [showPostNote, setShowPostNote] = useState(false)
  const [noteTitle, setNoteTitle] = useState('')
  const [noteContent, setNoteContent] = useState('')
  const [postingNote, setPostingNote] = useState(false)

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      if (!data || data.assignment?.role !== 'cleaner') {
        router.push('/login')
        return
      }
      setMe(data.assignment)
      const supabase = createClient()
      const { data: props } = await supabase
        .from('properties')
        .select('id, name, address')
        .order('name')
      setProperties(props || [])
      if (props?.[0]) setPropertyId(props[0].id)
      await loadCleans((data.assignment as any).id)
      setLoading(false)
    }
    init()
  }, [router])

  async function loadCleans(cleanerId: string) {
    const supabase = createClient()
    const { data } = await supabase
      .from('cleans')
      .select('*, properties(name, address)')
      .eq('cleaner_id', cleanerId)
      .order('clean_date', { ascending: false })
      .limit(20)
    setCleans(data || [])
  }

  /** Log a clean. Short notice is normal here — no lead-time rules. */
  async function logClean() {
    if (!propertyId || !cleanDate) return
    const supabase = createClient()
    const { error: err } = await supabase.from('cleans').insert({
      property_id: propertyId,
      cleaner_id: (me as any)?.id,
      clean_date: cleanDate,
      clean_time: cleanTime || null,
    })
    if (err) return setError(err.message)
    loadCleans((me as any).id)
  }

  async function completeClean() {
    if (!active) return
    const supabase = createClient()
    const { error: err } = await supabase
      .from('cleans')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        tenant_todos: todos,
        special_jobs: specials,
        notes: notes || null,
      })
      .eq('id', active.id)
    if (err) return setError(err.message)

    // Anything broken becomes a maintenance ticket for the manager — the cleaner
    // is in every property regularly and spots what nobody reports.
    if (issue.trim()) {
      await supabase.from('maintenance_tickets').insert({
        title: issue.trim(),
        description: `Reported by cleaner after visit on ${active.clean_date}.`,
        category: 'Cleanliness & Pests',
        priority: 'medium',
        status: 'reported',
        property_id: active.property_id,
        reporter_id: (me as any)?.id,
        raised_by_role: 'cleaner',
      })
    }

    setActive(null)
    setShowPostNote(true)
    setTodos([])
    setSpecials([])
    setNotes('')
    setIssue('')
    loadCleans((me as any).id)
  }

  async function postCleanerNote() {
    if (!active || !noteTitle || !noteContent) {
      alert('Please fill in title and message')
      return
    }
    setPostingNote(true)
    try {
      const res = await fetch('/api/property-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId: active.property_id,
          title: noteTitle,
          content: noteContent,
          noteType: 'cleaner',
        }),
      })
      if (!res.ok) throw new Error('Failed to post note')
      setShowPostNote(false)
      setNoteTitle('')
      setNoteContent('')
      alert('✅ Note posted to tenant dashboard')
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setPostingNote(false)
    }
  }

  function toggle(list: string[], setList: (v: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value])
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar />
        <p className="p-xl text-sm text-neutral-400">Loading…</p>
      </div>
    )
  }

  const scheduled = cleans.filter((c) => c.status !== 'completed')
  const done = cleans.filter((c) => c.status === 'completed')

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar
        right={
          <button
            onClick={async () => {
              await signOut()
              router.push('/login')
            }}
            className="shrink-0 transition-colors hover:opacity-80 flex items-center gap-sm"
          >
            <span>👋</span> Sign out
          </button>
        }
      />

      <main className="mx-auto max-w-6xl px-lg py-lg">
        {error && (
          <div className="mb-md rounded-xl border border-neutral-900 bg-white p-md text-sm">
            {error}
          </div>
        )}

        <section className="rounded-2xl border-2 border-neutral-900 bg-white p-lg">
          <h2 className="text-xl font-bold">Log a clean</h2>
          <div className="mt-md grid gap-md sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-neutral-700">Property</label>
              <select
                value={propertyId}
                onChange={(e) => setPropertyId(e.target.value)}
                className="mt-xs w-full rounded-xl border border-neutral-300 px-md py-md text-sm"
              >
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700">Date</label>
              <input
                type="date"
                value={cleanDate}
                onChange={(e) => setCleanDate(e.target.value)}
                className="mt-xs w-full rounded-xl border border-neutral-300 px-md py-md text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700">Time</label>
              <input
                type="time"
                value={cleanTime}
                onChange={(e) => setCleanTime(e.target.value)}
                className="mt-xs w-full rounded-xl border border-neutral-300 px-md py-md text-sm"
              />
            </div>
          </div>
          <button
            onClick={logClean}
            className="mt-md w-full rounded-xl bg-neutral-950 py-md text-sm font-bold text-white sm:w-auto sm:px-xl"
          >
            Log this clean
          </button>
        </section>

        <section className="mt-3xl">
          <h2 className="text-xl font-bold">Your cleans</h2>
          {scheduled.length === 0 ? (
            <p className="mt-md rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center text-sm text-neutral-400">
              Nothing logged yet
            </p>
          ) : (
            <div className="mt-md space-y-sm">
              {scheduled.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActive(c)}
                  className="flex w-full items-center justify-between gap-md rounded-2xl border border-neutral-200 bg-white p-md text-left hover:border-neutral-900"
                >
                  <div className="min-w-0">
                    <p className="truncate font-bold">{c.properties?.name}</p>
                    <p className="text-sm text-neutral-500">
                      {new Date(c.clean_date).toLocaleDateString('en-GB', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                      })}
                      {c.clean_time ? ` · ${String(c.clean_time).slice(0, 5)}` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-lg bg-neutral-950 px-md py-sm text-xs font-bold text-white">
                    Finish
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        {done.length > 0 && (
          <section className="mt-3xl">
            <h2 className="text-xl font-bold">Completed</h2>
            <div className="mt-md space-y-sm">
              {done.map((c) => (
                <div
                  key={c.id}
                  className="rounded-2xl border border-neutral-200 bg-white p-md opacity-70"
                >
                  <p className="font-bold">{c.properties?.name}</p>
                  <p className="text-sm text-neutral-500">
                    {new Date(c.clean_date).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                    })}
                    {c.special_jobs?.length ? ` · ${c.special_jobs.length} extra jobs` : ''}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {active && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-lg sm:rounded-3xl">
            <div className="flex items-start justify-between gap-md">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
                  Finish clean
                </p>
                <h2 className="mt-xs text-xl font-bold">{active.properties?.name}</h2>
              </div>
              <button
                onClick={() => setActive(null)}
                className="shrink-0 rounded-full bg-neutral-100 px-md py-sm text-sm"
              >
                Close
              </button>
            </div>

            <h3 className="mt-lg font-bold">Things for tenants to do</h3>
            <div className="mt-sm space-y-sm">
              {Object.entries(TENANT_TODOS).map(([area, options]) => (
                <div key={area} className="rounded-xl border border-neutral-200">
                  <button
                    onClick={() => setOpenArea(openArea === area ? null : area)}
                    className="flex w-full items-center justify-between p-md text-left text-sm font-semibold"
                  >
                    {area}
                    <span className="text-xs text-neutral-400">
                      {todos.filter((t) => options.includes(t)).length || ''}{' '}
                      {openArea === area ? '−' : '+'}
                    </span>
                  </button>
                  {openArea === area && (
                    <div className="space-y-xs border-t border-neutral-200 p-md">
                      {options.map((opt) => (
                        <button
                          key={opt}
                          onClick={() => toggle(todos, setTodos, opt)}
                          className={`w-full rounded-lg border px-md py-sm text-left text-sm ${
                            todos.includes(opt)
                              ? 'border-neutral-900 bg-neutral-900 text-white'
                              : 'border-neutral-200'
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <h3 className="mt-lg font-bold">Extra jobs done today</h3>
            <div className="mt-sm flex flex-wrap gap-xs">
              {SPECIAL_JOBS.map((job) => (
                <button
                  key={job}
                  onClick={() => toggle(specials, setSpecials, job)}
                  className={`rounded-full border px-md py-sm text-xs font-medium ${
                    specials.includes(job)
                      ? 'border-neutral-900 bg-neutral-900 text-white'
                      : 'border-neutral-300'
                  }`}
                >
                  {job}
                </button>
              ))}
            </div>

            <h3 className="mt-lg font-bold">Anything broken?</h3>
            <p className="text-xs text-neutral-500">
              Goes straight to the property manager as a job.
            </p>
            <input
              value={issue}
              onChange={(e) => setIssue(e.target.value)}
              placeholder="e.g. Toilet seat is loose in the first floor bathroom"
              className="mt-sm w-full rounded-xl border border-neutral-300 px-md py-md text-sm"
            />

            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any other notes (optional)"
              rows={2}
              className="mt-md w-full rounded-xl border border-neutral-300 p-md text-sm"
            />

            <button
              onClick={completeClean}
              className="mt-lg w-full rounded-xl bg-neutral-950 py-lg text-sm font-bold text-white"
            >
              Mark clean complete
            </button>
          </div>
        </div>
      )}

      {showPostNote && active && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-lg sm:rounded-3xl">
            <div className="flex items-start justify-between gap-md">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
                  Post to dashboard
                </p>
                <h2 className="mt-xs text-xl font-bold">Share notes with tenants</h2>
              </div>
              <button
                onClick={() => setShowPostNote(false)}
                className="shrink-0 rounded-full bg-neutral-100 px-md py-sm text-sm"
              >
                Skip
              </button>
            </div>

            <p className="mt-md text-sm text-neutral-600">
              Post a note visible on the tenant dashboard for {active.properties?.name}. This could be about the recent clean, any requests for tenants, or other updates.
            </p>

            <div className="mt-lg space-y-lg">
              <div>
                <label className="block text-sm font-bold text-neutral-900 mb-md">
                  Title
                </label>
                <input
                  type="text"
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  placeholder="e.g., Recent clean completed, Please leave windows open"
                  className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-neutral-900 mb-md">
                  Message
                </label>
                <textarea
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="Share any details or requests..."
                  rows={4}
                  className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
                />
              </div>

              <button
                onClick={postCleanerNote}
                disabled={postingNote}
                className="w-full rounded-lg bg-green-600 py-sm font-bold text-white hover:bg-green-700 disabled:opacity-50"
              >
                {postingNote ? 'Posting...' : '✅ Post note to dashboard'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
