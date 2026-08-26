'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import {
  ICEBREAKER_QUESTIONS,
  answeredCount,
  type IcebreakerAnswers,
} from '@/lib/icebreaker'

interface Resident {
  personId: string
  name: string
  email: string | null
  roomName: string | null
  answers: IcebreakerAnswers
  visible: boolean
  hasRow: boolean
}

/**
 * Admin "Housemates" tab: the internal house-composition summary that mirrors
 * what tenants fill in, plus a manual backfill for existing tenants who joined
 * before the icebreaker existed. Admins see every profile (incl. private ones).
 */
export default function HousematesTab({ propertyId }: { propertyId: string }) {
  const [loading, setLoading] = useState(true)
  const [residents, setResidents] = useState<Resident[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<IcebreakerAnswers>({})
  const [draftVisible, setDraftVisible] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    const supabase = createClient()
    const today = new Date().toISOString().split('T')[0]

    const { data: tens } = await supabase
      .from('tenancies')
      .select('person_id, room_id, people(full_name, email), rooms(name)')
      .eq('property_id', propertyId)
      .lte('start_date', today)
      .or(`end_date.is.null,end_date.gte.${today}`)

    const rows = (tens as any[]) || []
    const byPerson = new Map<string, any>()
    for (const t of rows) if (t.person_id && !byPerson.has(t.person_id)) byPerson.set(t.person_id, t)
    const personIds = [...byPerson.keys()]

    const ibs = new Map<string, { answers: IcebreakerAnswers; visible: boolean }>()
    if (personIds.length) {
      const { data } = await supabase
        .from('tenant_icebreakers')
        .select('person_id, answers, visible_to_housemates')
        .in('person_id', personIds)
      for (const r of data || [])
        ibs.set(r.person_id, {
          answers: (r.answers as IcebreakerAnswers) || {},
          visible: r.visible_to_housemates !== false,
        })
    }

    const list: Resident[] = personIds.map((pid) => {
      const t = byPerson.get(pid)
      const ib = ibs.get(pid)
      return {
        personId: pid,
        name: t.people?.full_name || 'Unnamed tenant',
        email: t.people?.email || null,
        roomName: t.rooms?.name || null,
        answers: ib?.answers || {},
        visible: ib?.visible ?? true,
        hasRow: !!ib,
      }
    })
    list.sort((a, b) => a.name.localeCompare(b.name))
    setResidents(list)
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId])

  function startEdit(r: Resident) {
    setEditing(r.personId)
    setDraft({ ...r.answers })
    setDraftVisible(r.visible)
    setError('')
  }

  async function saveEdit(personId: string) {
    setSaving(true)
    setError('')
    try {
      const supabase = createClient()
      const cleaned: IcebreakerAnswers = {}
      for (const q of ICEBREAKER_QUESTIONS) {
        const v = (draft[q.id] || '').trim()
        if (v) cleaned[q.id] = v
      }
      const { error: e } = await supabase.from('tenant_icebreakers').upsert(
        {
          person_id: personId,
          answers: cleaned,
          visible_to_housemates: draftVisible,
          completed_at: Object.keys(cleaned).length ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'person_id' }
      )
      if (e) throw new Error(e.message)
      setEditing(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-sm text-neutral-400">Loading housemates…</p>

  const complete = residents.filter((r) => answeredCount(r.answers) >= 2).length

  return (
    <div>
      <div className="mb-lg rounded-2xl border border-neutral-200 bg-white p-lg">
        <h2 className="text-lg font-bold text-neutral-900">House composition</h2>
        <p className="mt-xs text-sm text-neutral-600">
          {residents.length === 0
            ? 'No current tenants at this property yet.'
            : `${complete} of ${residents.length} residents have an icebreaker profile. Fill one in for tenants who joined before this feature — they can edit it later.`}
        </p>
      </div>

      {error && <p className="mb-md text-sm text-red-600">{error}</p>}

      <div className="space-y-md">
        {residents.map((r) => {
          const count = answeredCount(r.answers)
          const isEditing = editing === r.personId
          return (
            <div key={r.personId} className="rounded-2xl border border-neutral-200 bg-white p-lg">
              <div className="flex items-start justify-between gap-md">
                <div className="min-w-0">
                  <p className="font-bold text-neutral-900">{r.name}</p>
                  <p className="text-xs text-neutral-500">
                    {[r.roomName, r.email].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-sm">
                  <span
                    className={`rounded-full px-sm py-0.5 text-xs font-semibold ${
                      count >= 2 ? 'bg-green-100 text-green-700' : 'bg-neutral-100 text-neutral-500'
                    }`}
                  >
                    {count}/{ICEBREAKER_QUESTIONS.length}
                  </span>
                  {!r.visible && r.hasRow && (
                    <span className="rounded-full bg-amber-100 px-sm py-0.5 text-xs font-semibold text-amber-700">
                      Private
                    </span>
                  )}
                  {!isEditing && (
                    <button
                      onClick={() => startEdit(r)}
                      className="rounded-lg border border-neutral-300 px-md py-xs text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                    >
                      {count ? 'Edit' : 'Fill in'}
                    </button>
                  )}
                </div>
              </div>

              {isEditing ? (
                <div className="mt-md space-y-md">
                  {ICEBREAKER_QUESTIONS.map((q) => (
                    <div key={q.id}>
                      <label className="block text-xs font-bold text-neutral-700">
                        {q.emoji} {q.prompt}
                      </label>
                      <textarea
                        value={draft[q.id] || ''}
                        onChange={(e) => setDraft((d) => ({ ...d, [q.id]: e.target.value }))}
                        placeholder={q.placeholder}
                        rows={2}
                        className="mt-xs w-full resize-y rounded-lg border border-neutral-300 px-md py-sm text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                      />
                    </div>
                  ))}
                  <label className="flex items-center gap-sm text-sm text-neutral-700">
                    <input
                      type="checkbox"
                      checked={draftVisible}
                      onChange={(e) => setDraftVisible(e.target.checked)}
                      className="h-4 w-4"
                    />
                    Visible to housemates
                  </label>
                  <div className="flex gap-md">
                    <button
                      onClick={() => setEditing(null)}
                      disabled={saving}
                      className="flex-1 rounded-lg border border-neutral-300 px-lg py-sm text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => saveEdit(r.personId)}
                      disabled={saving}
                      className="flex-1 rounded-lg bg-neutral-900 px-lg py-sm text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-50"
                    >
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              ) : count > 0 ? (
                <dl className="mt-md grid gap-sm sm:grid-cols-2">
                  {ICEBREAKER_QUESTIONS.filter((q) => (r.answers[q.id] || '').trim()).map((q) => (
                    <div key={q.id}>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                        {q.emoji} {q.short}
                      </dt>
                      <dd className="mt-0.5 text-sm text-neutral-800">{r.answers[q.id]}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="mt-md text-sm text-neutral-400">No profile yet.</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
