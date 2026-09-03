'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'

export default function AdminProfilePage() {
  const router = useRouter()
  const [person, setPerson]     = useState<any | null>(null)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const [form, setForm] = useState({
    first_name: '',
    last_name:  '',
    phone:      '',
    company:    '',
  })

  const supabase = createClient()

  useEffect(() => {
    async function init() {
      const user = await getCurrentUser()
      if (!user || (user.assignment?.role !== 'administrator' && user.assignment?.role !== 'admin')) {
        router.push('/login'); return
      }

      // Look up by email — people.email = auth.jwt()->>'email'
      const { data: p } = await supabase
        .from('people')
        .select('*')
        .eq('email', user.email)
        .single()

      if (!p) { setLoading(false); return }
      setPerson(p)
      setForm({
        first_name: p.first_name || '',
        last_name:  p.last_name  || '',
        phone:      p.phone      || '',
        company:    p.company    || '',
      })
      setLoading(false)
    }
    init()
  }, [router])

  async function handleSave() {
    if (!person) return
    setSaving(true); setError(null); setSaved(false)

    const { error: err } = await supabase
      .from('people')
      .update({
        first_name: form.first_name.trim(),
        last_name:  form.last_name.trim(),
        phone:      form.phone.trim() || null,
        company:    form.company.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', person.id)

    setSaving(false)
    if (err) { setError(err.message); return }
    setSaved(true)
    setPerson((prev: any) => ({ ...prev, ...form }))
    setTimeout(() => setSaved(false), 4000)
  }

  const displayName = person
    ? [person.first_name, person.last_name].filter(Boolean).join(' ') || person.email
    : '—'

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar left={<BackButton href="/admin" />} />
        <div className="flex items-center justify-center py-3xl">
          <p className="text-sm text-neutral-400">Loading…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin" />} />

      <main className="mx-auto max-w-xl px-lg py-2xl">

        {/* Header */}
        <div className="mb-2xl">
          <h1 className="text-2xl font-bold text-neutral-900">My profile</h1>
          <p className="text-sm text-neutral-500 mt-xs">Edit your name, phone, and details shown across CROS.</p>
        </div>

        {/* Avatar / name display */}
        <div className="rounded-2xl bg-neutral-900 p-xl flex items-center gap-lg mb-xl">
          <div className="w-14 h-14 rounded-full bg-neutral-700 flex items-center justify-center text-2xl font-bold text-white shrink-0">
            {(form.first_name?.[0] || person?.email?.[0] || '?').toUpperCase()}
          </div>
          <div>
            <p className="text-lg font-bold text-white">{displayName}</p>
            <p className="text-sm text-neutral-400">{person?.email}</p>
            <span className="mt-xs inline-block text-xs font-semibold px-sm py-xs rounded-full bg-neutral-700 text-neutral-300">
              Administrator
            </span>
          </div>
        </div>

        {/* Edit form */}
        <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden">
          <div className="px-xl py-lg border-b border-neutral-100">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Personal details</p>
          </div>
          <div className="px-xl py-xl space-y-lg">

            <div className="grid grid-cols-2 gap-lg">
              <div>
                <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">
                  First name
                </label>
                <input
                  type="text"
                  value={form.first_name}
                  onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
                  placeholder="First name"
                  className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">
                  Last name
                </label>
                <input
                  type="text"
                  value={form.last_name}
                  onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}
                  placeholder="Last name"
                  className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">
                Email
              </label>
              <input
                type="email"
                value={person?.email || ''}
                disabled
                className="w-full px-md py-sm border border-neutral-100 rounded-lg text-sm text-neutral-400 bg-neutral-50 cursor-not-allowed"
              />
              <p className="text-xs text-neutral-400 mt-xs">Email is set by your login account and cannot be changed here.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">
                Phone
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="e.g. 07700 000000"
                className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">
                Company / title (optional)
              </label>
              <input
                type="text"
                value={form.company}
                onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                placeholder="e.g. Capital Rooms"
                className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
              />
            </div>

          </div>

          <div className="px-xl pb-xl">
            {error && (
              <p className="text-sm text-red-600 mb-md">⚠ {error}</p>
            )}
            {saved && (
              <p className="text-sm text-green-600 mb-md">✓ Profile updated successfully</p>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-sm rounded-xl bg-neutral-900 text-white text-sm font-semibold hover:bg-neutral-700 disabled:opacity-40 transition"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>

      </main>
    </div>
  )
}
