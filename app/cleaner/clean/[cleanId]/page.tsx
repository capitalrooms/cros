'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import Link from 'next/link'
import PropertyExitReminder from '@/app/components/PropertyExitReminder'

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

const SPECIAL_JOBS = [
  'Swept front yard', 'Cleaned external windows', 'Cleaned oven', 'Cleaned inside cupboards',
  'Descaled shower head', 'Cleaned inside fridge', 'Washed bins out', 'Dusted skirting boards',
  'Cleaned behind appliances', 'Defrosted freezer',
]

const RESCHEDULE_REASONS = [
  'Running late — same day',
  'Moving to another day',
  'Family emergency',
  'Access problem',
  'Other',
]

function metresBetween(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

export default function CleanDetailPage() {
  const router = useRouter()
  const cleanId = useParams().cleanId as string

  const [me, setMe] = useState<any>(null)
  const [clean, setClean] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')

  // editable fields
  const [cleanerNote, setCleanerNote] = useState('')
  const [extraCharge, setExtraCharge] = useState('')
  const [extraChargeNote, setExtraChargeNote] = useState('')
  const [productsCost, setProductsCost] = useState('')
  const [reDate, setReDate] = useState('')
  const [reTime, setReTime] = useState('')
  const [reReason, setReReason] = useState(RESCHEDULE_REASONS[0])
  const [showReschedule, setShowReschedule] = useState(false)

  // completion
  const [openArea, setOpenArea] = useState<string | null>(null)
  const [todos, setTodos] = useState<string[]>([])
  const [specials, setSpecials] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [issue, setIssue] = useState('')
  const [showFinish, setShowFinish] = useState(false)
  const [showExitReminder, setShowExitReminder] = useState(false)

  // property-level cleaning notes (stick with property, not individual clean)
  const [cleaningNotes, setCleaningNotes] = useState<any[]>([])
  const [savingNotes, setSavingNotes] = useState<string[]>([])

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      if (!data || data.assignment?.role !== 'cleaner') {
        router.push('/login')
        return
      }
      setMe(data.assignment)
      const supabase = createClient()
      const { data: c } = await supabase
        .from('cleans')
        .select('*, properties(name, address, lat, lng, clean_frequency_weeks)')
        .eq('id', cleanId)
        .single()
      if (c) {
        setClean(c)
        setCleanerNote((c as any).cleaner_note || '')
        setExtraCharge((c as any).extra_charge != null ? String((c as any).extra_charge) : '')
        setExtraChargeNote((c as any).extra_charge_note || '')
        setProductsCost((c as any).products_cost != null ? String((c as any).products_cost) : '')
        setReDate((c as any).clean_date || '')
        setReTime((c as any).clean_time ? String((c as any).clean_time).slice(0, 5) : '')

        // Load property-level cleaning notes (not tied to specific clean)
        const { data: notes } = await supabase
          .from('property_cleaning_notes')
          .select('*')
          .eq('property_id', (c as any).property_id)
          .eq('is_completed', false)
          .eq('is_deleted', false)
          .order('created_at', { ascending: true })
        setCleaningNotes(notes || [])
      }
      setLoading(false)
    }
    init()
  }, [cleanId, router])

  async function patch(fields: Record<string, any>) {
    const supabase = createClient()
    const { error } = await supabase.from('cleans').update(fields).eq('id', cleanId)
    if (error) throw error
    setClean((c: any) => ({ ...c, ...fields }))
  }

  function pushTenants(body: string) {
    if (!clean) return
    fetch('/api/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ propertyId: clean.property_id, title: 'Capital Rooms', body, url: '/tenant' }),
    }).catch(() => {})
  }

  async function markNoteCompleted(noteId: string) {
    setSavingNotes([...savingNotes, noteId])
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('property_cleaning_notes')
        .update({
          is_completed: true,
          completed_by: me?.id,
          completed_at: new Date().toISOString(),
        })
        .eq('id', noteId)
      if (error) throw error
      setCleaningNotes(cleaningNotes.filter(n => n.id !== noteId))
    } catch (err) {
      alert('Error marking note completed: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setSavingNotes(savingNotes.filter(id => id !== noteId))
    }
  }

  async function handleArrive() {
    if (!clean) return
    setBusy('arrive')
    const finish = async () => {
      try {
        await patch({ arrived_at: new Date().toISOString() })
        pushTenants('Your cleaner has arrived at the property.')
        alert('✅ Marked as arrived — the tenants have been told you’re here.')
      } catch (err) {
        alert('Error: ' + (err instanceof Error ? err.message : 'Unknown error'))
      } finally {
        setBusy('')
      }
    }
    const { lat, lng } = clean.properties || {}
    if (lat == null || lng == null || !navigator.geolocation) return finish()
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const dist = metresBetween(pos.coords.latitude, pos.coords.longitude, lat, lng)
        if (dist > 150 && !window.confirm(
          `You appear to be about ${Math.round(dist)}m from ${clean.properties.name}. Only mark arrived if you're on site. Continue anyway?`
        )) { setBusy(''); return }
        finish()
      },
      () => { if (window.confirm('Could not read your location. Mark arrived without the check?')) finish(); else setBusy('') },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  async function handleReschedule() {
    if (!clean || !reDate) return
    setBusy('reschedule')
    try {
      await patch({ clean_date: reDate, clean_time: reTime || null })
      const when = `${new Date(reDate).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}${reTime ? ` at ${reTime}` : ''}`
      const isSameDay = /Running late/.test(reReason)
      pushTenants(
        isSameDay
          ? `Your cleaner is running late — the clean is now expected ${reTime ? `around ${reTime}` : 'later today'}.`
          : `The clean at your property has moved to ${when}${/emergency/i.test(reReason) ? ' (unavoidable change).' : '.'}`
      )
      setShowReschedule(false)
      alert('✅ Updated — the tenants have been notified of the new time.')
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setBusy('')
    }
  }

  async function saveWorking() {
    setBusy('save')
    try {
      await patch({
        cleaner_note: cleanerNote || null,
        extra_charge: extraCharge ? Number(extraCharge) : null,
        extra_charge_note: extraChargeNote || null,
        products_cost: productsCost ? Number(productsCost) : null,
      })
      alert('✅ Saved')
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setBusy('')
    }
  }

  function toggle(list: string[], setList: (v: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value])
  }

  async function completeClean() {
    if (!clean) return
    setBusy('complete')
    try {
      const supabase = createClient()
      await patch({
        status: 'completed',
        completed_at: new Date().toISOString(),
        tenant_todos: todos,
        special_jobs: specials,
        notes: notes || null,
        cleaner_note: cleanerNote || null,
        extra_charge: extraCharge ? Number(extraCharge) : null,
        extra_charge_note: extraChargeNote || null,
        products_cost: productsCost ? Number(productsCost) : null,
      })
      if (issue.trim()) {
        await supabase.from('maintenance_tickets').insert({
          title: issue.trim(),
          description: `Reported by cleaner after visit on ${clean.clean_date}.`,
          category: 'Cleanliness & Pests',
          priority: 'medium',
          status: 'reported',
          property_id: clean.property_id,
          reporter_id: (me as any)?.id,
          raised_by_role: 'cleaner',
        })
      }
      setShowExitReminder(true)
      // Will navigate after reminder is dismissed
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setBusy('')
    }
  }

  if (loading)
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar left={<BackButton href="/cleaner" />} />
        <p className="p-xl text-sm text-neutral-400">Loading…</p>
      </div>
    )
  if (!clean)
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar right={<Link href="/cleaner" className="font-semibold text-white">Cleans</Link>} />
        <p className="p-xl text-sm text-neutral-400">Clean not found</p>
      </div>
    )

  const freq = clean.properties?.clean_frequency_weeks
  const hasArrived = !!clean.arrived_at
  const isDone = clean.status === 'completed'

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar right={<Link href="/cleaner" className="min-w-0 truncate font-semibold text-white hover:text-white/80">Cleans</Link>} />

      <main className="mx-auto max-w-3xl px-lg py-lg space-y-lg">
        {/* Hero */}
        <div className="rounded-3xl bg-gradient-to-br from-neutral-900 to-neutral-800 text-white p-lg">
          <p className="text-xs font-bold uppercase tracking-widest text-white/60 mb-md">Clean</p>
          <h1 className="text-2xl font-bold">{clean.properties?.name}</h1>
          <p className="text-sm text-white/70">{clean.properties?.address}</p>
          <div className="mt-lg grid grid-cols-2 gap-lg">
            <div>
              <p className="text-xs text-white/60">When</p>
              <p className="text-base font-bold mt-xs">
                {new Date(clean.clean_date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                {clean.clean_time ? ` · ${String(clean.clean_time).slice(0, 5)}` : ''}
              </p>
            </div>
            {freq != null && (
              <div>
                <p className="text-xs text-white/60">Frequency</p>
                <p className="text-base font-bold mt-xs">
                  {freq === 1 ? 'Weekly' : freq === 2 ? 'Every 2 weeks' : `Every ${freq} weeks`}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Admin note */}
        {clean.admin_note && (
          <div className="rounded-2xl border-2 border-yellow-400 bg-yellow-50 p-lg">
            <p className="text-xs font-bold uppercase tracking-wide text-yellow-800">From the office — for this clean</p>
            <p className="mt-xs text-sm font-semibold text-yellow-900 whitespace-pre-wrap">{clean.admin_note}</p>
          </div>
        )}

        {/* Property-level cleaning notes (sticky to property, not individual clean) */}
        {cleaningNotes.length > 0 && (
          <div className="space-y-md">
            {cleaningNotes.map((note) => (
              <div key={note.id} className="rounded-2xl border-2 border-blue-300 bg-blue-50 p-lg">
                <div className="flex items-start justify-between gap-md">
                  <div className="flex-1">
                    <p className="text-xs font-bold uppercase tracking-wide text-blue-800">
                      {note.cleaning_type ? `🧹 ${note.cleaning_type.replace(/_/g, ' ')}` : '📋 Cleaning task'}
                    </p>
                    {note.room_id && (
                      <p className="text-xs text-blue-700 mt-xs">📍 Specific room attention needed</p>
                    )}
                    <p className="mt-xs text-sm font-semibold text-blue-900">{note.note_title}</p>
                    {note.note_content && (
                      <p className="mt-sm text-sm text-blue-800 whitespace-pre-wrap">{note.note_content}</p>
                    )}
                  </div>
                  <button
                    onClick={() => markNoteCompleted(note.id)}
                    disabled={savingNotes.includes(note.id)}
                    className="flex-shrink-0 px-md py-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold disabled:opacity-50 transition-colors"
                  >
                    {savingNotes.includes(note.id) ? '✓ Saving' : '✓ Done'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {isDone ? (
          <>
            <div className="rounded-2xl border-2 border-green-300 bg-green-50 p-lg">
              <h3 className="font-bold text-green-800">
                ✅ Completed{clean.completed_at ? ` · ${new Date(clean.completed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
              </h3>
              {clean.special_jobs?.length ? (
                <p className="mt-sm text-sm text-green-900">Extra jobs: {clean.special_jobs.join(', ')}</p>
              ) : null}
              {clean.notes ? (
                <p className="mt-sm text-sm text-green-900 whitespace-pre-wrap">Notes: {clean.notes}</p>
              ) : null}
            </div>

            {/* Editable after the fact — the figures often aren't known at completion time. */}
            <div className="rounded-2xl border-2 border-neutral-200 bg-white p-lg space-y-md">
              <h3 className="font-bold text-neutral-900">Edit notes &amp; charges</h3>
              <p className="text-xs text-neutral-500">This clean is done, but you can still update the note or add the extra-charge figures after the fact.</p>
              <textarea value={cleanerNote} onChange={(e) => setCleanerNote(e.target.value)} rows={3}
                placeholder="Things you noticed, what to focus on next time…"
                className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm" />
              <div className="grid grid-cols-2 gap-md">
                <div>
                  <label className="block text-xs text-neutral-600 mb-xs">Extra task charge (£)</label>
                  <input type="number" inputMode="decimal" value={extraCharge} onChange={(e) => setExtraCharge(e.target.value)}
                    placeholder="0.00" className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-neutral-600 mb-xs">Products bought (£)</label>
                  <input type="number" inputMode="decimal" value={productsCost} onChange={(e) => setProductsCost(e.target.value)}
                    placeholder="0.00" className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm" />
                </div>
              </div>
              <input value={extraChargeNote} onChange={(e) => setExtraChargeNote(e.target.value)}
                placeholder="What was the extra task? (e.g. extra hour on the oven)"
                className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm" />
              <button onClick={saveWorking} disabled={busy === 'save'}
                className="w-full rounded-lg bg-neutral-900 py-md text-sm font-bold text-white disabled:opacity-40">
                {busy === 'save' ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Arrival + reschedule */}
            <div className="rounded-2xl border-2 border-neutral-900 bg-white p-lg space-y-md">
              {hasArrived ? (
                <p className="text-xs font-bold uppercase tracking-wide text-green-700">
                  ✓ Arrived {new Date(clean.arrived_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                </p>
              ) : (
                <button onClick={handleArrive} disabled={busy === 'arrive'}
                  className="w-full rounded-lg bg-neutral-900 text-white font-bold py-md hover:bg-neutral-800 disabled:opacity-40">
                  {busy === 'arrive' ? 'Checking location…' : '📍 I’ve arrived'}
                </button>
              )}

              {!showReschedule ? (
                <button onClick={() => setShowReschedule(true)}
                  className="w-full rounded-lg border border-neutral-400 py-md text-sm font-bold text-neutral-900 hover:bg-neutral-50">
                  Running late / change day
                </button>
              ) : (
                <div className="rounded-xl border border-neutral-200 p-md space-y-md">
                  <p className="text-sm font-bold">Change the time</p>
                  <div className="grid grid-cols-2 gap-md">
                    <input type="date" value={reDate} onChange={(e) => setReDate(e.target.value)}
                      className="rounded-lg border border-neutral-300 px-md py-sm text-sm" />
                    <input type="time" value={reTime} onChange={(e) => setReTime(e.target.value)}
                      className="rounded-lg border border-neutral-300 px-md py-sm text-sm" />
                  </div>
                  <select value={reReason} onChange={(e) => setReReason(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm">
                    {RESCHEDULE_REASONS.map((r) => (<option key={r} value={r}>{r}</option>))}
                  </select>
                  <div className="flex gap-md">
                    <button onClick={handleReschedule} disabled={busy === 'reschedule' || !reDate}
                      className="flex-1 rounded-lg bg-neutral-900 py-md text-sm font-bold text-white disabled:opacity-40">
                      {busy === 'reschedule' ? 'Updating…' : 'Update & notify tenants'}
                    </button>
                    <button onClick={() => setShowReschedule(false)}
                      className="rounded-lg border border-neutral-400 px-lg py-md text-sm font-bold">Cancel</button>
                  </div>
                </div>
              )}
            </div>

            {/* Working notes + charges */}
            <div className="rounded-2xl border-2 border-neutral-200 bg-white p-lg space-y-md">
              <h3 className="font-bold text-neutral-900">Notes for this clean</h3>
              <textarea value={cleanerNote} onChange={(e) => setCleanerNote(e.target.value)} rows={3}
                placeholder="Things you noticed, what you need to bring, what to focus on next time…"
                className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm" />

              <h3 className="font-bold text-neutral-900 pt-sm">Extra charges (to invoice separately)</h3>
              <div className="grid grid-cols-2 gap-md">
                <div>
                  <label className="block text-xs text-neutral-600 mb-xs">Extra task charge (£)</label>
                  <input type="number" inputMode="decimal" value={extraCharge} onChange={(e) => setExtraCharge(e.target.value)}
                    placeholder="0.00" className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-neutral-600 mb-xs">Products bought (£)</label>
                  <input type="number" inputMode="decimal" value={productsCost} onChange={(e) => setProductsCost(e.target.value)}
                    placeholder="0.00" className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm" />
                </div>
              </div>
              <input value={extraChargeNote} onChange={(e) => setExtraChargeNote(e.target.value)}
                placeholder="What was the extra task? (e.g. extra hour on the oven)"
                className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm" />
              <p className="text-xs text-neutral-500">You can come back and edit these later if you don’t have the exact figure yet.</p>
              <button onClick={saveWorking} disabled={busy === 'save'}
                className="w-full rounded-lg border border-neutral-400 py-md text-sm font-bold text-neutral-900 disabled:opacity-40">
                {busy === 'save' ? 'Saving…' : 'Save'}
              </button>
            </div>

            {/* Finish */}
            {!showFinish ? (
              <button onClick={() => setShowFinish(true)}
                className="w-full rounded-xl bg-green-700 py-lg text-sm font-bold text-white hover:bg-green-800">
                Finish this clean
              </button>
            ) : (
              <div className="rounded-2xl border-2 border-neutral-900 bg-white p-lg space-y-lg">
                <h3 className="font-bold">Things for tenants to do</h3>
                <div className="space-y-sm">
                  {Object.entries(TENANT_TODOS).map(([area, options]) => (
                    <div key={area} className="rounded-xl border border-neutral-200">
                      <button onClick={() => setOpenArea(openArea === area ? null : area)}
                        className="flex w-full items-center justify-between p-md text-left text-sm font-semibold">
                        {area}<span className="text-xs text-neutral-400">{todos.filter((t) => options.includes(t)).length || ''} {openArea === area ? '−' : '+'}</span>
                      </button>
                      {openArea === area && (
                        <div className="space-y-xs border-t border-neutral-200 p-md">
                          {options.map((opt) => (
                            <button key={opt} onClick={() => toggle(todos, setTodos, opt)}
                              className={`w-full rounded-lg border px-md py-sm text-left text-sm ${todos.includes(opt) ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200'}`}>{opt}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <h3 className="font-bold">Extra jobs done today</h3>
                <div className="flex flex-wrap gap-xs">
                  {SPECIAL_JOBS.map((job) => (
                    <button key={job} onClick={() => toggle(specials, setSpecials, job)}
                      className={`rounded-full border px-md py-sm text-xs font-medium ${specials.includes(job) ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300'}`}>{job}</button>
                  ))}
                </div>

                <div>
                  <h3 className="font-bold">Anything broken?</h3>
                  <p className="text-xs text-neutral-500">Goes straight to the property manager as a job.</p>
                  <input value={issue} onChange={(e) => setIssue(e.target.value)}
                    placeholder="e.g. Toilet seat is loose in the first floor bathroom"
                    className="mt-sm w-full rounded-xl border border-neutral-300 px-md py-md text-sm" />
                </div>

                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                  placeholder="Any other notes (optional)" className="w-full rounded-xl border border-neutral-300 p-md text-sm" />

                <button onClick={completeClean} disabled={busy === 'complete'}
                  className="w-full rounded-xl bg-green-700 py-lg text-sm font-bold text-white hover:bg-green-800 disabled:opacity-40">
                  {busy === 'complete' ? 'Completing…' : 'Mark clean complete'}
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {/* Exit Reminder Modal */}
      {showExitReminder && (
        <PropertyExitReminder
          propertyAddress={clean.properties?.address || 'the property'}
          onDismiss={() => {
            setShowExitReminder(false)
            router.push('/cleaner')
          }}
        />
      )}
    </div>
  )
}
