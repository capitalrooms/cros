'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import {
  ICEBREAKER_QUESTIONS,
  answeredCount,
  type IcebreakerAnswers,
} from '@/lib/icebreaker'

/**
 * Tenant-facing icebreaker questionnaire. A light, optional profile the tenant
 * fills in so new housemates can get to know them. Writes go through the browser
 * Supabase client (carries the logged-in session, so RLS `own_write` passes).
 */
export default function IcebreakerPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [personId, setPersonId] = useState<string | null>(null)
  const [answers, setAnswers] = useState<IcebreakerAnswers>({})
  const [visible, setVisible] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      if (!data || data.assignment?.role !== 'tenant') {
        router.push('/login')
        return
      }
      const pid = (data.assignment as any)?.id as string
      setPersonId(pid)

      const supabase = createClient()
      const { data: existing } = await supabase
        .from('tenant_icebreakers')
        .select('answers, visible_to_housemates')
        .eq('person_id', pid)
        .maybeSingle()

      if (existing) {
        setAnswers((existing.answers as IcebreakerAnswers) || {})
        setVisible(existing.visible_to_housemates !== false)
      }
      setLoading(false)
    }
    init()
  }, [router])

  function setAnswer(id: string, value: string) {
    setAnswers((a) => ({ ...a, [id]: value }))
    setSaved(false)
  }

  async function handleSave() {
    if (!personId) return
    setSaving(true)
    setError('')
    try {
      const supabase = createClient()
      // Trim blanks so a wiped field doesn't count as answered.
      const cleaned: IcebreakerAnswers = {}
      for (const q of ICEBREAKER_QUESTIONS) {
        const v = (answers[q.id] || '').trim()
        if (v) cleaned[q.id] = v
      }
      const count = Object.keys(cleaned).length
      const { error: e } = await supabase.from('tenant_icebreakers').upsert(
        {
          person_id: personId,
          answers: cleaned,
          visible_to_housemates: visible,
          completed_at: count > 0 ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'person_id' }
      )
      if (e) throw new Error(e.message)
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your profile')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar left={<BackButton />} />
        <p className="p-xl text-sm text-neutral-400">Loading…</p>
      </div>
    )
  }

  const count = answeredCount(answers)

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/tenant" />} />

      <main className="mx-auto max-w-2xl px-lg py-lg">
        <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">
          Meet your housemates
        </p>
        <h1 className="mt-xs text-3xl font-bold text-neutral-900">Say hello 👋</h1>
        <p className="mt-sm text-sm text-neutral-600">
          A few light questions so your housemates can get to know you before you move in.
          Nothing here is compulsory — answer what you like, skip the rest. You can change or
          hide it any time.
        </p>

        <div className="mt-lg space-y-md">
          {ICEBREAKER_QUESTIONS.map((q) => (
            <div key={q.id} className="rounded-2xl border border-neutral-200 bg-white p-lg">
              <label className="block text-sm font-bold text-neutral-900">
                <span className="mr-sm">{q.emoji}</span>
                {q.prompt}
              </label>
              <textarea
                value={answers[q.id] || ''}
                onChange={(e) => setAnswer(q.id, e.target.value)}
                placeholder={q.placeholder}
                rows={2}
                className="mt-sm w-full resize-y rounded-lg border border-neutral-300 px-md py-sm text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900"
              />
            </div>
          ))}
        </div>

        <label className="mt-lg flex cursor-pointer items-start gap-sm rounded-2xl border border-neutral-200 bg-white p-lg">
          <input
            type="checkbox"
            checked={visible}
            onChange={(e) => { setVisible(e.target.checked); setSaved(false) }}
            className="mt-0.5 h-4 w-4"
          />
          <span className="text-sm text-neutral-700">
            <span className="font-bold text-neutral-900">Show my answers to my housemates.</span>{' '}
            Turn this off to keep your profile private — your landlord may still see it.
          </span>
        </label>

        {error && <p className="mt-md text-sm text-red-600">{error}</p>}

        <div className="mt-lg flex items-center gap-md">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-xl bg-neutral-900 py-md text-sm font-bold text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save my profile'}
          </button>
          <Link
            href="/tenant/housemates"
            className="rounded-xl border border-neutral-300 px-lg py-md text-sm font-semibold text-neutral-700 hover:bg-white"
          >
            See housemates
          </Link>
        </div>
        <p className="mt-sm text-center text-xs text-neutral-400">
          {count} of {ICEBREAKER_QUESTIONS.length} answered
        </p>
      </main>
    </div>
  )
}
