'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser, signOut } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import EnableNotifications from '@/app/components/EnableNotifications'

interface ComplianceLog {
  id: string
  check_type: 'fire_door' | 'smoke_alarm'
  checked_date: string
  notes: string | null
  checked_by_role: string
  people?: { full_name: string } | null
}

const checkTypeLabels: Record<string, string> = {
  fire_door: '🚪 Fire Door',
  smoke_alarm: '🔔 Smoke Alarm',
}

const sixMonthsAgo = () => {
  const d = new Date()
  d.setMonth(d.getMonth() - 6)
  return d.toISOString().split('T')[0]
}

export default function CleanerDashboard() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [me, setMe] = useState<any>(null)
  const [properties, setProperties] = useState<any[]>([])
  const [cleans, setCleans] = useState<any[]>([])
  const [complianceLogs, setComplianceLogs] = useState<ComplianceLog[]>([])
  const [error, setError] = useState('')

  const [propertyId, setPropertyId] = useState('')
  const [cleanDate, setCleanDate] = useState(new Date().toISOString().split('T')[0])
  const [cleanTime, setCleanTime] = useState('10:00')
  const [booking, setBooking] = useState(false)
  const [bookedNotice, setBookedNotice] = useState('')
  const [showAddComplianceModal, setShowAddComplianceModal] = useState(false)
  const [savingCompliance, setSavingCompliance] = useState(false)
  const [complianceForm, setComplianceForm] = useState({ check_type: 'fire_door' as const, date: new Date().toISOString().split('T')[0], notes: '' })

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
        .select('id, name, address, clean_frequency_weeks')
        .order('name')
      setProperties(props || [])
      if (props?.[0]) {
        setPropertyId(props[0].id)
        await loadComplianceLogs(props[0].id)
      }
      await loadCleans((data.assignment as any).id)
      setLoading(false)
    }
    init()
  }, [router])

  async function loadCleans(cleanerId: string) {
    const supabase = createClient()
    const { data } = await supabase
      .from('cleans')
      .select('*, properties(name, address, clean_frequency_weeks)')
      .eq('cleaner_id', cleanerId)
      .order('clean_date', { ascending: false })
      .limit(20)
    setCleans(data || [])
  }

  async function loadComplianceLogs(propId: string) {
    const supabase = createClient()
    const { data } = await supabase
      .from('compliance_logs')
      .select('id, check_type, checked_date, notes, checked_by_role, people(full_name)')
      .eq('property_id', propId)
      .gte('checked_date', sixMonthsAgo())
      .order('checked_date', { ascending: false })
      .limit(50)
    setComplianceLogs((data || []) as any)
  }

  function handlePropertyChange(newPropertyId: string) {
    setPropertyId(newPropertyId)
    loadComplianceLogs(newPropertyId)
  }

  async function handleAddComplianceLog() {
    if (!propertyId || !complianceForm.date) {
      alert('Please fill in all required fields')
      return
    }

    setSavingCompliance(true)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('compliance_logs')
        .insert({
          property_id: propertyId,
          check_type: complianceForm.check_type,
          checked_by: me?.id,
          checked_by_role: 'cleaner',
          checked_date: complianceForm.date,
          notes: complianceForm.notes || null,
        })

      if (error) throw error

      setComplianceForm({ check_type: 'fire_door', date: new Date().toISOString().split('T')[0], notes: '' })
      setShowAddComplianceModal(false)
      await loadComplianceLogs(propertyId)
      alert('✅ Check logged')
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setSavingCompliance(false)
    }
  }

  /** Book a clean. Short notice is normal here — no lead-time rules. */
  async function bookClean() {
    if (!propertyId || !cleanDate || booking) return
    setError('')
    setBookedNotice('')
    setBooking(true)
    const supabase = createClient()
    const { error: err } = await supabase.from('cleans').insert({
      property_id: propertyId,
      cleaner_id: (me as any)?.id,
      clean_date: cleanDate,
      clean_time: cleanTime || null,
    })
    if (err) {
      setBooking(false)
      return setError(err.message)
    }
    await loadCleans((me as any).id)
    setBooking(false)
    const propName = properties.find((p) => p.id === propertyId)?.name || 'the property'
    const when = new Date(cleanDate).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    setBookedNotice(`✅ Clean booked for ${propName} on ${when}${cleanTime ? ` at ${cleanTime}` : ''}. It's in Upcoming cleans below.`)
  }

  /** last completed clean date + frequency weeks → next-due date */
  function nextDue(c: any): string | null {
    const weeks = c.properties?.clean_frequency_weeks
    const base = c.completed_at || c.clean_date
    if (!weeks || !base) return null
    const d = new Date(base)
    d.setDate(d.getDate() + weeks * 7)
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  }

  function freqLabel(weeks: number | null | undefined): string | null {
    if (weeks == null) return null
    return weeks === 1 ? 'Weekly' : weeks === 2 ? 'Every 2 weeks' : `Every ${weeks} weeks`
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
        <div className="mb-lg">
          <EnableNotifications />
        </div>
        {error && (
          <div className="mb-md rounded-xl border border-neutral-900 bg-white p-md text-sm">
            {error}
          </div>
        )}

        <section className="rounded-2xl border-2 border-neutral-900 bg-white p-lg">
          <h2 className="text-xl font-bold">Book a clean</h2>
          <div className="mt-md grid gap-md sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-neutral-700">Property</label>
              <select
                value={propertyId}
                onChange={(e) => handlePropertyChange(e.target.value)}
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
            onClick={bookClean}
            disabled={booking}
            className="mt-md w-full rounded-xl bg-neutral-950 py-md text-sm font-bold text-white disabled:opacity-40 sm:w-auto sm:px-xl"
          >
            {booking ? 'Booking…' : 'Book this clean'}
          </button>
          {bookedNotice && (
            <div className="mt-md rounded-xl border border-green-300 bg-green-50 p-md text-sm font-semibold text-green-800">
              {bookedNotice}
            </div>
          )}
        </section>

        <section className="mt-3xl">
          <h2 className="text-xl font-bold">Upcoming cleans</h2>
          {scheduled.length === 0 ? (
            <p className="mt-md rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center text-sm text-neutral-400">
              Nothing booked yet
            </p>
          ) : (
            <div className="mt-md space-y-sm">
              {scheduled.map((c) => (
                <button
                  key={c.id}
                  onClick={() => router.push(`/cleaner/clean/${c.id}`)}
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
                    {c.arrived_at ? 'On site' : 'Open'}
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
              {done.map((c) => {
                const due = nextDue(c)
                const freq = freqLabel(c.properties?.clean_frequency_weeks)
                return (
                  <button
                    key={c.id}
                    onClick={() => router.push(`/cleaner/clean/${c.id}`)}
                    className="flex w-full items-center justify-between gap-md rounded-2xl border border-neutral-200 bg-white p-md text-left hover:border-neutral-900"
                  >
                    <div className="min-w-0">
                      <p className="font-bold">{c.properties?.name}</p>
                      <p className="text-sm text-neutral-500">
                        {new Date(c.clean_date).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                        })}
                        {c.special_jobs?.length ? ` · ${c.special_jobs.length} extra jobs` : ''}
                      </p>
                      {(freq || due) && (
                        <p className="mt-xs text-xs font-semibold text-neutral-700">
                          {freq ? freq : ''}
                          {freq && due ? ' · ' : ''}
                          {due ? `next due ${due}` : ''}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 rounded-lg bg-green-100 px-md py-sm text-xs font-bold text-green-800">
                      Completed
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {/* Compliance Logs Section */}
        <section className="mt-3xl">
          <div className="flex items-center justify-between mb-md">
            <h2 className="text-xl font-bold">Compliance Checks (Last 6 Months)</h2>
            <button
              onClick={() => setShowAddComplianceModal(true)}
              className="rounded-lg bg-neutral-900 px-md py-sm text-xs font-bold text-white hover:bg-neutral-800"
            >
              + Add Check
            </button>
          </div>

          {complianceLogs.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center text-sm text-neutral-400">
              No compliance checks logged for this property yet
            </p>
          ) : (
            <div className="space-y-sm">
              {complianceLogs.map((log) => (
                <div key={log.id} className="rounded-lg border border-neutral-200 bg-white p-md">
                  <div className="flex items-start justify-between gap-md">
                    <div className="min-w-0">
                      <p className="font-semibold text-neutral-900">
                        {checkTypeLabels[log.check_type]}
                      </p>
                      <p className="text-sm text-neutral-600 mt-xs">
                        {new Date(log.checked_date).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                        {' · '}
                        {log.people?.full_name || 'Unknown'} ({log.checked_by_role})
                      </p>
                      {log.notes && (
                        <p className="text-sm text-neutral-700 mt-md whitespace-pre-wrap">
                          {log.notes}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Add Compliance Check Modal */}
        {showAddComplianceModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-lg">
            <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-lg">
              <h2 className="text-xl font-bold text-neutral-900 mb-md">Log Compliance Check</h2>

              <div className="space-y-md">
                <div>
                  <label className="block text-sm font-bold text-neutral-900 mb-md">Check Type</label>
                  <div className="flex gap-sm">
                    {(['fire_door', 'smoke_alarm'] as const).map((type) => (
                      <button
                        key={type}
                        onClick={() => setComplianceForm({ ...complianceForm, check_type: type })}
                        className={`flex-1 rounded-lg border px-md py-sm text-xs font-semibold transition-colors ${
                          complianceForm.check_type === type
                            ? 'border-neutral-900 bg-neutral-900 text-white'
                            : 'border-neutral-300 text-neutral-700'
                        }`}
                      >
                        {checkTypeLabels[type]}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-neutral-900 mb-md">Date Checked</label>
                  <input
                    type="date"
                    value={complianceForm.date}
                    onChange={(e) => setComplianceForm({ ...complianceForm, date: e.target.value })}
                    className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-neutral-900 mb-md">Notes (Optional)</label>
                  <textarea
                    placeholder="e.g., All tests passed, battery good"
                    value={complianceForm.notes}
                    onChange={(e) => setComplianceForm({ ...complianceForm, notes: e.target.value })}
                    rows={2}
                    className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm"
                  />
                </div>

                <div className="flex gap-sm pt-md">
                  <button
                    onClick={handleAddComplianceLog}
                    disabled={savingCompliance}
                    className="flex-1 rounded-lg bg-neutral-900 py-sm font-bold text-white disabled:opacity-50"
                  >
                    {savingCompliance ? 'Saving…' : 'Log Check'}
                  </button>
                  <button
                    onClick={() => setShowAddComplianceModal(false)}
                    className="flex-1 rounded-lg border border-neutral-300 py-sm font-semibold"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
