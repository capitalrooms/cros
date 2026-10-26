'use client'

import { useEffect, useState } from 'react'
import { RoleTabBar, type CleanerTab } from '@/app/components/RoleTabBar'
import { useRouter, useParams } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import Link from 'next/link'
import DeepCleanRecord from '@/app/components/cleaning/DeepCleanRecord'
import { AREAS, DEEP_TASKS, otherJob } from '@/lib/cleans/deepTasks'
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
  const [otherJobText, setOtherJobText] = useState('')
  // the day the clean was actually done and how long it took (26 Oct 2026, migration 247) — a clean whose day has gone
  // by can be logged as done on the day it happened; hours × the cleaner's rate prices it on their invoice
  const [visitDate, setVisitDate] = useState('')
  const [hours, setHours] = useState('')
  const [myRate, setMyRate] = useState<number | null>(null)
  // the house's deep-clean record — what's due, and when each extra job was last done (lib/cleans/deepTasks)
  const [deep, setDeep] = useState<any>(null)
  const [notes, setNotes] = useState('')
  const [issue, setIssue] = useState('')
  // a reminder the cleaner leaves for their next visit — kept with the house (property_cleaning_notes), shown at the
  // top of the next clean and seen by the office (17 Oct 2026)
  const [nextTime, setNextTime] = useState('')
  const [showFinish, setShowFinish] = useState(false)
  const [showExitReminder, setShowExitReminder] = useState(false)

  // property-level cleaning notes (stick with property, not individual clean)
  const [cleaningNotes, setCleaningNotes] = useState<any[]>([])
  const [savingNotes, setSavingNotes] = useState<string[]>([])

  // tenant extras requests for this clean
  const [tenantExtras, setTenantExtras] = useState<any[]>([])

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      // cleaners, and the office (viewing as a cleaner from People)
      if (!data || !['cleaner', 'administrator', 'admin'].includes(data.assignment?.role ?? '')) {
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

        fetch(`/api/cleaner/house?propertyId=${(c as any).property_id}`).then(r => r.ok ? r.json() : null).then(j => { if (j?.deep) setDeep(j.deep); if (j?.myRate != null) setMyRate(Number(j.myRate)) }).catch(() => null)
        const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
        const cd = (c as any).clean_date as string | null
        setVisitDate((c as any).status === 'completed' ? ((c as any).completed_at ? new Date((c as any).completed_at).toLocaleDateString('en-CA', { timeZone: 'Europe/London' }) : cd || todayIso) : cd && cd < todayIso ? cd : todayIso)
        setHours((c as any).hours_worked != null ? String(Number((c as any).hours_worked)) : (c as any).duration_hours != null ? String(Number((c as any).duration_hours)) : '')

        // Load property-level cleaning notes (not tied to specific clean)
        const { data: notes } = await supabase
          .from('property_cleaning_notes')
          .select('*')
          .eq('property_id', (c as any).property_id)
          .eq('is_completed', false)
          .eq('is_deleted', false)
          .order('created_at', { ascending: true })
        setCleaningNotes(notes || [])

        // Load tenant extras requests
        const { data: extras } = await supabase
          .from('cleaner_extras_requests')
          .select('tasks, notes, status, tenant: tenant_person_id(salutation, first_name, last_name)')
          .eq('clean_id', cleanId)
        setTenantExtras(extras || [])
      }
      setLoading(false)
    }
    init()
  }, [cleanId, router])

  async function patch(fields: Record<string, any>) {
    const supabase = createClient()
    let { data: done, error } = await supabase.from('cleans').update(fields).eq('id', cleanId).select('id')
    // before migration 247 there's no hours column: save everything else rather than fail the clean
    if (error && /hours_worked/.test(error.message) && 'hours_worked' in fields) {
      const { hours_worked: _h, ...rest } = fields
      ;({ data: done, error } = await supabase.from('cleans').update(rest).eq('id', cleanId).select('id'))
    }
    if (error) throw error
    // nothing changed and no error: the clean isn't this person's to change (it used to look saved — 26 Oct 2026)
    if (!done?.length) throw new Error('This clean couldn’t be updated — it may be booked for another cleaner. Ask the office.')
    setClean((c: any) => ({ ...c, ...fields }))
  }

  // the tenants hear about the clean by email or the app, as set on the Cleaning screen (lib/cleans/tenantUpdates,
  // 26 Oct 2026) — it used to be an app notification only, which tenants not on the app never got
  function tellTenants(kind: 'arrived' | 'late' | 'moved' | 'done' | 'cancelled', note?: string) {
    if (!clean) return Promise.resolve()
    return fetch(`/api/cleans/${clean.id}/tell-tenants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, note }),
    }).then(() => undefined).catch(() => undefined)
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
        tellTenants('arrived')
        alert('Marked as arrived. When you finish, your hours are worked out from now.')
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
      const when = `${new Date(reDate).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}${reTime ? ` at ${reTime}` : ''}`
      const isSameDay = /Running late/.test(reReason)
      void when
      await tellTenants(isSameDay ? 'late' : 'moved', !isSameDay && /emergency/i.test(reReason) ? 'It’s an unavoidable change — sorry.' : undefined)
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
        // a finished clean: the hours and the day can be put right afterwards
        ...(clean?.status === 'completed' && !clean?.supplier_invoice_id ? { hours_worked: hours ? Number(hours) : null, ...(visitDate ? { completed_at: whenDone(visitDate), clean_date: visitDate } : {}) } : {}),
      })
      alert('Saved')
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
    // a clean booked for a later day: one stray tap used to close it off with no question (25 Oct 2026)
    const todayISO = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
    if (!visitDate || visitDate > todayISO) { alert('Pick the day you did the clean (today or earlier).'); return }
    if (!hours || !(Number(hours) > 0)) { alert('Say how long you were there.'); return }
    setBusy('complete')
    try {
      const supabase = createClient()
      await patch({
        status: 'completed',
        completed_at: whenDone(visitDate),
        hours_worked: Number(hours),
        // done on another day than booked: the clean moves to the day it happened, and the booked day is noted
        ...(visitDate !== clean.clean_date ? { clean_date: visitDate, admin_note: [clean.admin_note, clean.clean_date ? `Booked for ${longDay(clean.clean_date)}; cleaned ${longDay(visitDate)}.` : null].filter(Boolean).join(' ') } : {}),
        tenant_todos: todos,
        special_jobs: [...specials, ...(otherJobText.trim() ? [otherJob(otherJobText)] : [])],
        notes: notes || null,
        cleaner_note: cleanerNote || null,
        extra_charge: extraCharge ? Number(extraCharge) : null,
        extra_charge_note: extraChargeNote || null,
        products_cost: productsCost ? Number(productsCost) : null,
      })
      // the next clean at the house (lib/cleans/nextClean): from its schedule if one is set (and the tenants are told),
      // otherwise pencilled in at its usual gap — unless one is already booked, or this was a room's move-out clean
      await fetch(`/api/cleans/${clean.id}/next`, { method: 'POST' }).catch(() => null)
      if (nextTime.trim()) {
        await fetch('/api/cleaner/reminder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cleanId: clean.id, text: nextTime }) }).catch(() => null)
      }
      if (issue.trim()) {
        const { data: raised } = await supabase.from('maintenance_tickets').insert({
          title: issue.trim(),
          description: `Reported by cleaner after visit on ${clean.clean_date}.`,
          category: 'Cleanliness & Pests',
          priority: 'medium',
          status: 'reported',
          property_id: clean.property_id,
          reporter_id: (me as any)?.id,
          raised_by_role: 'cleaner',
        }).select('id').maybeSingle()
        // "goes straight to the property manager" — it used to make the job without telling anyone
        if (raised?.id) await fetch('/api/notify-job-raised', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketId: raised.id }) }).catch(() => null)
      }
      // "clean finished", with the next one (pencilled in above) — only on the day; a clean logged later isn't news
      if (visitDate === todayISO) await tellTenants('done')
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
        <AppBar left={<BackButton href="/cleaner" label="My cleans" />} />
        <p className="p-xl text-sm text-neutral-400">Loading…</p>
      </div>
    )
  if (!clean)
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar left={<BackButton href="/cleaner" />} />
        <p className="p-xl text-sm text-neutral-400">Clean not found</p>
      </div>
    )

  const freq = clean.properties?.clean_frequency_weeks
  const hasArrived = !!clean.arrived_at
  const isDone = clean.status === 'completed'
  // another cleaner's clean (opened from the house page): theirs to update, not this cleaner's
  const notMine = me?.role === 'cleaner' && !!clean.cleaner_id && clean.cleaner_id !== me.id

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/cleaner" />} />

      <main className="mx-auto max-w-3xl px-lg py-lg space-y-lg">
        {/* Hero */}
        <div className="rounded-3xl bg-gradient-to-br from-neutral-900 to-neutral-800 text-white p-lg">
          <p className="text-xs font-bold uppercase tracking-widest text-white/60 mb-md">Clean</p>
          <h1 className="text-2xl font-bold">{clean.properties?.name}</h1>
          {/* the house's own page: usual visit, notes shared with the office, past cleans (17 Oct 2026) */}
          <Link href={`/cleaner/house/${clean.property_id}`} className="mt-xs inline-block text-sm font-semibold underline">House notes &amp; past cleans →</Link>
          <p className="text-sm text-white/70">{clean.properties?.address}</p>
          <div className="mt-lg grid grid-cols-2 gap-lg">
            <div>
              <p className="text-xs text-white/60">When</p>
              <p className="text-base font-bold mt-xs">
                {new Date(clean.clean_date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
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
          {/* a clean whose day has gone by and isn't finished (21 Oct 2026) */}
          {!notMine && clean.status !== 'completed' && clean.status !== 'cancelled' && clean.clean_date && clean.clean_date < new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }) && (
            <div className="mt-md rounded-xl bg-amber-400/15 px-md py-sm">
              <p className="text-sm font-semibold text-amber-100">This clean was due {longDay(clean.clean_date)}. Did you do it?</p>
              <div className="mt-sm flex flex-wrap gap-sm">
                <button type="button" onClick={() => { setVisitDate(clean.clean_date); setShowFinish(true); setTimeout(() => scrollToId('finish-clean'), 120) }}
                  className="rounded-lg bg-white px-md py-sm text-sm font-bold text-neutral-900">Yes, I did it — log it</button>
                <button type="button" onClick={() => { setShowReschedule(true); setTimeout(() => scrollToId('change-day'), 120) }}
                  className="rounded-lg border border-white/40 px-md py-sm text-sm font-bold text-white">No — move it</button>
              </div>
            </div>
          )}
        </div>

        {!isDone && <DeepCleanRecord deep={deep} dueOnly />}

        {/* Admin note */}
        {clean.admin_note && (
          <div className="rounded-2xl border-2 border-yellow-400 bg-yellow-50 p-lg">
            <p className="text-xs font-bold uppercase tracking-wide text-yellow-800">From the office — for this clean</p>
            <p className="mt-xs text-sm font-semibold text-yellow-900 whitespace-pre-wrap">{clean.admin_note}</p>
          </div>
        )}

        {/* Tenant extras requests */}
        {tenantExtras.length > 0 && (
          <div className="rounded-2xl border-2 border-purple-300 bg-purple-50 p-lg">
            <p className="text-xs font-bold uppercase tracking-wide text-purple-800">
              🧹 Tenant extra requests — if time allows
            </p>
            <p className="mt-xs text-xs text-purple-700">These aren't mandatory — fit them in if you have time.</p>
            {tenantExtras.map((req, i) => {
              const tenantName = req.tenant ? `${[req.tenant.salutation, req.tenant.first_name, req.tenant.last_name].filter(Boolean).join(' ')}`.trim() : 'A tenant'
              return (
                <div key={i} className={i > 0 ? 'mt-md pt-md border-t border-purple-200' : 'mt-md'}>
                  <p className="text-xs font-semibold text-purple-700 mb-xs">{tenantName}</p>
                  <ul className="space-y-xs">
                    {(req.tasks || []).map((task: string, j: number) => (
                      <li key={j} className="flex items-start gap-xs text-sm text-purple-900">
                        <span className="mt-0.5">•</span> {task}
                      </li>
                    ))}
                  </ul>
                  {req.notes && (
                    <p className="mt-sm text-xs text-purple-700 italic">Note: {req.notes}</p>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Notes for this house — shared with the office (sticky to the house, not this clean) */}
        {cleaningNotes.length > 0 && (
          <div className="space-y-md">
            <p className="text-xs font-bold uppercase tracking-wide text-neutral-500">Notes for this house</p>
            {cleaningNotes.map((note) => (
              <div key={note.id} className="rounded-2xl border-2 border-blue-300 bg-blue-50 p-lg">
                <div className="flex items-start justify-between gap-md">
                  <div className="flex-1">
                    <p className="text-xs font-bold uppercase tracking-wide text-blue-800">
                      {note.cleaning_type === 'reminder' ? '📝 Your reminder' : note.cleaning_type ? `🧹 ${note.cleaning_type.replace(/_/g, ' ')}` : '📋 Cleaning task'}
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

        {notMine ? (
          <div className="rounded-2xl border border-neutral-200 bg-white p-lg">
            <p className="text-sm font-bold text-neutral-900">This clean is booked for another cleaner</p>
            <p className="mt-xs text-sm text-neutral-600">You can see it here, but only they — or the office — can update it. If you’re doing it instead, ask the office to move it to you.</p>
          </div>
        ) : isDone ? (
          <>
            <div className="rounded-2xl border-2 border-green-300 bg-green-50 p-lg">
              <h3 className="font-bold text-green-800">
                Done{clean.completed_at ? ` · ${longDay(new Date(clean.completed_at).toLocaleDateString('en-CA', { timeZone: 'Europe/London' }))}` : ''}
              </h3>
              <p className="mt-xs text-sm text-green-900">{clean.hours_worked != null ? `${hoursLabel(Number(clean.hours_worked))} there${myRate != null ? ` · £${(Number(clean.hours_worked) * myRate).toFixed(2)} at £${myRate.toFixed(2)} an hour` : ''}` : 'How long you were there isn’t recorded yet — add it below so it’s on your invoice.'}</p>
              {clean.special_jobs?.length ? (
                <p className="mt-sm text-sm text-green-900">Extra jobs: {clean.special_jobs.map((j: string) => j.replace(/^Other: /, '')).join(', ')}</p>
              ) : null}
              {clean.notes ? (
                <p className="mt-sm text-sm text-green-900 whitespace-pre-wrap">Notes: {clean.notes}</p>
              ) : null}
            </div>

            {/* Editable after the fact — the figures often aren't known at completion time. */}
            <div className="rounded-2xl border-2 border-neutral-200 bg-white p-lg space-y-md">
              <h3 className="font-bold text-neutral-900">Hours, notes and charges</h3>
              <p className="text-xs text-neutral-500">This clean is done, but you can still put the day and hours right, update the note or add extra charges.</p>
              {clean.supplier_invoice_id ? <p className="rounded-lg bg-neutral-50 px-md py-sm text-xs text-neutral-600">This clean is on an invoice already, so its day and hours are fixed.</p>
                : <VisitFields visitDate={visitDate} setVisitDate={setVisitDate} hours={hours} setHours={setHours} rate={myRate} />}
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
                  {busy === 'arrive' ? 'Checking location…' : 'I’ve arrived'}
                </button>
              )}

              {!showReschedule ? (
                <button onClick={() => setShowReschedule(true)}
                  className="w-full rounded-lg border border-neutral-400 py-md text-sm font-bold text-neutral-900 hover:bg-neutral-50">
                  Running late / change day
                </button>
              ) : (
                <div id="change-day" className="rounded-xl border border-neutral-200 p-md space-y-md">
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
              <h3 className="font-bold text-neutral-900">Notes for this visit</h3>
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
              <button onClick={() => {
                // arrived today in the app: the hours are the time since, to the nearest half hour
                const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
                if (clean.arrived_at && new Date(clean.arrived_at).toLocaleDateString('en-CA', { timeZone: 'Europe/London' }) === todayIso && visitDate === todayIso) {
                  const h = Math.min(12, Math.max(0.5, Math.round((Date.now() - new Date(clean.arrived_at).getTime()) / 1_800_000) / 2))
                  setHours(String(h))
                }
                setShowFinish(true)
              }}
                className="w-full rounded-xl bg-green-700 py-lg text-sm font-bold text-white hover:bg-green-800">
                Finish this clean
              </button>
            ) : (
              <div id="finish-clean" className="rounded-2xl border-2 border-neutral-900 bg-white p-lg space-y-lg">
                <div>
                  <h3 className="font-bold">When, and how long</h3>
                  <VisitFields visitDate={visitDate} setVisitDate={setVisitDate} hours={hours} setHours={setHours} rate={myRate} />
                </div>
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

                <div>
                  <h3 className="font-bold">Extra jobs done today</h3>
                  <p className="text-xs text-neutral-500">Tick anything beyond the usual clean — it builds the house’s record of when each was last done.</p>
                  <div className="mt-sm space-y-sm">
                    {AREAS.map(area => (
                      <div key={area}>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">{area}</p>
                        <div className="mt-xs flex flex-wrap gap-xs">
                          {DEEP_TASKS.filter(t => t.area === area).map(t => {
                            const row = deep?.rows?.find((r: any) => r.label === t.label)
                            const on = specials.includes(t.label)
                            return (
                              <button key={t.label} type="button" aria-pressed={on} onClick={() => toggle(specials, setSpecials, t.label)}
                                className={`rounded-full border px-md py-sm text-xs font-medium ${on ? 'border-neutral-900 bg-neutral-900 text-white' : row?.status === 'due' ? 'border-amber-400 bg-amber-50 text-amber-900' : 'border-neutral-300'}`}>
                                {t.label}{!on && row?.status === 'due' ? ' · due' : ''}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                    <input value={otherJobText} onChange={e => setOtherJobText(e.target.value)} placeholder="Something else? e.g. Cleaned the shed windows"
                      className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm" />
                  </div>
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

                <div>
                  <h3 className="font-bold">Reminder for next time</h3>
                  <p className="text-xs text-neutral-500">Shown at the top of your next clean here — the office sees it too.</p>
                  <textarea value={nextTime} onChange={(e) => setNextTime(e.target.value)} rows={2}
                    placeholder="e.g. Bring descaler for the shower · Bin day is Tuesday"
                    className="mt-sm w-full rounded-xl border border-neutral-300 p-md text-sm" />
                </div>

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
      <RoleTabBar<CleanerTab> role="cleaner" active={'today'} />
    </div>
  )
}

const longDay = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const hoursLabel = (h: number) => `${h % 1 ? h.toFixed(1).replace(/\.0$/, '') : h} hour${h === 1 ? '' : 's'}`
/** When a clean was done: now, if it was today; otherwise midday on that day. */
function whenDone(day: string) {
  return day === new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }) ? new Date().toISOString() : `${day}T12:00:00.000Z`
}

/** The day the clean was done and the hours spent — when finishing it, and afterwards. Shows what the hours come to. */
function VisitFields({ visitDate, setVisitDate, hours, setHours, rate }: { visitDate: string; setVisitDate: (v: string) => void; hours: string; setHours: (v: string) => void; rate: number | null }) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  const h = Number(hours)
  return (
    <div className="mt-sm space-y-sm">
      <div className="grid grid-cols-2 gap-md">
        <label className="block min-w-0 text-xs text-neutral-600">Day you cleaned
          <input type="date" max={today} value={visitDate} onChange={e => setVisitDate(e.target.value)} className="mt-xs w-full rounded-lg border border-neutral-300 px-md py-sm text-sm text-neutral-900" /></label>
        <label className="block min-w-0 text-xs text-neutral-600">Hours you were there
          <select value={hours} onChange={e => setHours(e.target.value)} className="mt-xs w-full rounded-lg border border-neutral-300 bg-white px-md py-sm text-sm text-neutral-900">
            <option value="">Choose…</option>
            {Array.from({ length: 24 }, (_, i) => (i + 1) / 2).map(v => <option key={v} value={String(v)}>{hoursLabel(v)}</option>)}
          </select></label>
      </div>
      {h > 0 && rate != null && <p className="text-sm font-semibold text-neutral-900">£{(h * rate).toFixed(2)} <span className="font-normal text-neutral-600">— {hoursLabel(h)} at your £{rate.toFixed(2)} an hour</span></p>}
      {rate == null && <p className="text-xs text-neutral-500">Add your hourly rate in <Link href="/cleaner/invoices" className="font-semibold underline">Invoices › My details</Link> and your invoices will price each clean from its hours.</p>}
    </div>
  )
}

/** Bring a section into view below the top bar (scrollIntoView was ignored on some phones). */
function scrollToId(id: string) {
  const el = document.getElementById(id)
  if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 72, behavior: 'smooth' })
}
