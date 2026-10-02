'use client'

// /admin/rent-history
// Bulk-edit screen: set last_rent_change_date + previous_rent_amount per tenancy.
// Used to retroactively record rent changes that happened before the Section 13
// notice system was built. The 52-week validation uses this date when no formal
// s.13 notice history exists.

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'

interface TenancyRow {
  id: string
  start_date: string
  end_date: string | null
  rent_amount: number
  last_rent_change_date: string | null
  previous_rent_amount: number | null
  is_fixed_term: boolean | null
  person: { first_name: string | null; last_name: string | null; full_name: string | null; email: string } | null
  room: { name: string } | null
  property: { address: string } | null
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function fmtMoney(n: number | null) {
  if (n == null) return '—'
  return `£${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2 })}`
}

function tenantName(t: TenancyRow) {
  const p = t.person
  if (!p) return '(no tenant linked)'
  return p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email
}

// Earliest date a Section 13 notice could be effective, given last change
function nextIncreaseFrom(t: TenancyRow): string {
  // Use last_rent_change_date if set, else tenancy start_date
  const anchor = t.last_rent_change_date || t.start_date
  const d = new Date(anchor + 'T00:00:00')
  d.setDate(d.getDate() + 364)
  return d.toISOString().slice(0, 10)
}

export default function RentHistoryPage() {
  const router = useRouter()
  const [loading, setLoading]   = useState(true)
  const [tenancies, setTenancies] = useState<TenancyRow[]>([])
  const [saving, setSaving]     = useState<string | null>(null)  // tenancy id being saved
  const [saved, setSaved]       = useState<Record<string, boolean>>({})
  const [edits, setEdits]       = useState<Record<string, { date: string; prev: string }>>({})
  const [filterStr, setFilterStr] = useState('')
  const [showOnlyWithHistory, setShowOnlyWithHistory] = useState(false)

  useEffect(() => {
    async function load() {
      const user = await getCurrentUser()
      if (!user || !['administrator', 'admin'].includes(user.assignment?.role)) {
        router.push('/login'); return
      }
      const sb = createClient()
      const today = new Date().toISOString().slice(0, 10)
      const { data, error } = await sb
        .from('tenancies')
        .select(`
          id, start_date, end_date, rent_amount,
          last_rent_change_date, previous_rent_amount, is_fixed_term,
          person:people!tenancies_person_id_fkey(first_name, last_name, full_name, email),
          room:rooms!tenancies_room_id_fkey(name),
          property:properties!tenancies_property_id_fkey(address)
        `)
        .is('notice_received_date', null)
        .or(`end_date.is.null,end_date.gte.${today}`)
        .order('start_date', { ascending: true })

      if (error || !data) { setLoading(false); return }
      setTenancies(data as unknown as TenancyRow[])

      // Initialise edit state from DB
      const initial: Record<string, { date: string; prev: string }> = {}
      data.forEach((t: any) => {
        initial[t.id] = {
          date: t.last_rent_change_date || '',
          prev: t.previous_rent_amount != null ? String(t.previous_rent_amount) : '',
        }
      })
      setEdits(initial)
      setLoading(false)
    }
    load()
  }, [router])

  async function handleSave(tenancyId: string) {
    setSaving(tenancyId)
    const e = edits[tenancyId]
    const sb = createClient()
    const { error } = await sb
      .from('tenancies')
      .update({
        last_rent_change_date:  e.date || null,
        previous_rent_amount:   e.prev ? Number(e.prev) : null,
      })
      .eq('id', tenancyId)

    if (!error) {
      setSaved(prev => ({ ...prev, [tenancyId]: true }))
      setTenancies(prev => prev.map(t =>
        t.id === tenancyId
          ? { ...t, last_rent_change_date: e.date || null, previous_rent_amount: e.prev ? Number(e.prev) : null }
          : t
      ))
      setTimeout(() => setSaved(prev => ({ ...prev, [tenancyId]: false })), 2500)
    }
    setSaving(null)
  }

  function isDirty(tenancyId: string, t: TenancyRow) {
    const e = edits[tenancyId]
    if (!e) return false
    const origDate = t.last_rent_change_date || ''
    const origPrev = t.previous_rent_amount != null ? String(t.previous_rent_amount) : ''
    return e.date !== origDate || e.prev !== origPrev
  }

  const filtered = tenancies.filter(t => {
    if (showOnlyWithHistory && !t.last_rent_change_date) return false
    const q = filterStr.toLowerCase()
    if (!q) return true
    return (
      tenantName(t).toLowerCase().includes(q) ||
      t.property?.address?.toLowerCase().includes(q) ||
      t.room?.name?.toLowerCase().includes(q) ||
      t.person?.email?.toLowerCase().includes(q)
    )
  })

  if (loading) return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin" />} />
      <p className="p-xl text-sm text-neutral-400">Loading tenancies…</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin" />} />
      <PageHero eyebrow="Lettings" title="Last rent change per tenant" subtitle="Set the date rent was last actually changed (informally, before the Section 13 system was built). The 52-week gap rule for new Section 13 notices counts from this date when no formal notice history exists. Leave blank to fall back to the tenancy start date." />
      <main className="mx-auto max-w-6xl px-lg py-xl">

        {/* Header */}
        <div className="mb-xl">
          <p className="text-xs font-bold uppercase tracking-wide text-neutral-400 mb-xs">Rent history</p>
        </div>

        {/* Info banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-md mb-lg">
          <p className="text-sm font-semibold text-blue-900 mb-xs">📋 How this works</p>
          <ul className="text-xs text-blue-800 space-y-xs list-disc list-inside">
            <li><strong>Last rent change date</strong> — when rent was last raised. Section 13 notices can't be effective until 52 weeks after this date (if no formal notice exists yet).</li>
            <li><strong>Previous rent</strong> — what rent was before the change. Optional — for your records only.</li>
            <li><strong>Next increase from</strong> — the earliest date a Section 13 notice could take effect (52 weeks from last change or tenancy start).</li>
            <li>Once you serve a formal Section 13 notice, that notice's effective date becomes the new 52-week anchor — this field is then only used as historical context.</li>
          </ul>
        </div>

        {/* Filters */}
        <div className="flex gap-md items-center mb-lg">
          <input
            type="text"
            placeholder="Filter by name, property, room, email…"
            value={filterStr}
            onChange={e => setFilterStr(e.target.value)}
            className="flex-1 rounded-xl border border-neutral-200 bg-white px-md py-sm text-sm text-neutral-900 placeholder:text-neutral-400"
          />
          <label className="flex items-center gap-xs text-sm text-neutral-600 cursor-pointer whitespace-nowrap">
            <input
              type="checkbox"
              checked={showOnlyWithHistory}
              onChange={e => setShowOnlyWithHistory(e.target.checked)}
              className="rounded"
            />
            With history only
          </label>
          <p className="text-xs text-neutral-400 whitespace-nowrap">{filtered.length} of {tenancies.length}</p>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 border-b border-neutral-200">
              <tr>
                <th className="text-left px-lg py-md text-xs font-bold uppercase tracking-wide text-neutral-500">Tenant</th>
                <th className="text-left px-md py-md text-xs font-bold uppercase tracking-wide text-neutral-500">Room / Property</th>
                <th className="text-left px-md py-md text-xs font-bold uppercase tracking-wide text-neutral-500">Current rent</th>
                <th className="text-left px-md py-md text-xs font-bold uppercase tracking-wide text-neutral-500">Last change date</th>
                <th className="text-left px-md py-md text-xs font-bold uppercase tracking-wide text-neutral-500">Previous rent</th>
                <th className="text-left px-md py-md text-xs font-bold uppercase tracking-wide text-neutral-500">Next increase from</th>
                <th className="px-md py-md"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filtered.map(t => {
                const e = edits[t.id] || { date: '', prev: '' }
                const dirty = isDirty(t.id, t)
                const isSaving = saving === t.id
                const justSaved = saved[t.id]
                const hasHistory = !!t.last_rent_change_date
                const nextFrom = nextIncreaseFrom({
                  ...t,
                  last_rent_change_date: e.date || t.last_rent_change_date,
                })
                const nextFromFmt = fmtDate(nextFrom)
                const isPast = nextFrom < new Date().toISOString().slice(0, 10)
                return (
                  <tr key={t.id} className={hasHistory ? 'bg-blue-50/30' : ''}>
                    <td className="px-lg py-md">
                      <p className="font-semibold text-neutral-900 text-xs">{tenantName(t)}</p>
                      <p className="text-xs text-neutral-400">{t.person?.email}</p>
                      <p className="text-xs text-neutral-400">Since {fmtDate(t.start_date)}</p>
                    </td>
                    <td className="px-md py-md">
                      <p className="font-medium text-neutral-700 text-xs">{t.room?.name}</p>
                      <p className="text-xs text-neutral-400 max-w-[200px]">{t.property?.address}</p>
                    </td>
                    <td className="px-md py-md">
                      <p className="font-semibold text-neutral-900">{fmtMoney(t.rent_amount)}</p>
                      {t.previous_rent_amount && (
                        <p className="text-xs text-neutral-400">was {fmtMoney(t.previous_rent_amount)}</p>
                      )}
                    </td>
                    <td className="px-md py-md">
                      <input
                        type="date"
                        value={e.date}
                        max={new Date().toISOString().slice(0, 10)}
                        onChange={ev => setEdits(prev => ({
                          ...prev,
                          [t.id]: { ...prev[t.id], date: ev.target.value }
                        }))}
                        className="rounded-lg border border-neutral-200 bg-white px-sm py-xs text-xs text-neutral-900 w-[130px]"
                      />
                      {!e.date && (
                        <p className="text-xs text-neutral-400 mt-xs">↑ blank = use start date</p>
                      )}
                    </td>
                    <td className="px-md py-md">
                      <div className="relative">
                        <span className="absolute left-sm top-1/2 -translate-y-1/2 text-neutral-400 text-xs">£</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={e.prev}
                          onChange={ev => setEdits(prev => ({
                            ...prev,
                            [t.id]: { ...prev[t.id], prev: ev.target.value }
                          }))}
                          placeholder="—"
                          className="rounded-lg border border-neutral-200 bg-white pl-md pr-sm py-xs text-xs text-neutral-900 w-[90px]"
                        />
                      </div>
                    </td>
                    <td className="px-md py-md">
                      <p className={`text-xs font-semibold ${isPast ? 'text-green-700' : 'text-amber-700'}`}>
                        {isPast ? '✓ Eligible now' : nextFromFmt}
                      </p>
                      <p className="text-xs text-neutral-400">
                        {e.date ? `52w from ${fmtDate(e.date)}` : t.last_rent_change_date ? `52w from ${fmtDate(t.last_rent_change_date)}` : `52w from tenancy start`}
                      </p>
                    </td>
                    <td className="px-md py-md text-right">
                      {justSaved ? (
                        <span className="text-xs font-semibold text-green-700">✓ Saved</span>
                      ) : (
                        <button
                          onClick={() => handleSave(t.id)}
                          disabled={!dirty || isSaving}
                          className="text-xs font-semibold px-md py-xs rounded-lg bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          {isSaving ? 'Saving…' : 'Save'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-lg py-xl text-center text-sm text-neutral-400">
                    No active tenancies found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}
