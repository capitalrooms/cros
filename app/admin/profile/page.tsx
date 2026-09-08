'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'

const SALUTATIONS = ['', 'Mr', 'Mrs', 'Ms', 'Miss', 'Dr', 'Prof', 'Rev', 'Mx']

export default function AdminProfilePage() {
  const router = useRouter()
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [saved, setSaved]           = useState(false)
  const [error, setError]           = useState('')

  const [salutation, setSalutation] = useState('')
  const [firstName, setFirstName]   = useState('')
  const [lastName, setLastName]     = useState('')
  const [email, setEmail]           = useState('')
  const [role, setRole]             = useState('')

  useEffect(() => {
    async function load() {
      try {
        const data = await getCurrentUser()
        if (!data) { router.push('/login'); return }
        if (data.assignment?.role !== 'administrator' && data.assignment?.role !== 'admin') {
          router.push('/login'); return
        }

        // Fetch from the profile endpoint (sends the auth token automatically via getCurrentUser session)
        const { createClient } = await import('@/lib/supabase')
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token

        const res = await fetch('/api/admin/profile', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        if (!res.ok) throw new Error('Could not load profile')
        const json = await res.json()
        const p = json.person
        setSalutation(p.salutation || '')
        setFirstName(p.first_name || '')
        setLastName(p.last_name || '')
        setEmail(p.email || '')
        setRole(p.role || '')
      } catch (err: any) {
        setError(err.message || 'Failed to load profile')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [router])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaved(false)
    if (!firstName.trim()) { setError('First name is required'); return }
    setSaving(true)

    try {
      const { createClient } = await import('@/lib/supabase')
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      const res = await fetch('/api/admin/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim(), salutation }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Save failed')
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: any) {
      setError(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const displayName = [salutation, firstName, lastName].filter(Boolean).join(' ')

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar left={<BackButton href="/admin" />} />
        <div className="flex items-center justify-center pt-32 text-neutral-400 text-sm">Loading…</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin" />} />

      <main className="mx-auto max-w-lg px-lg py-2xl">
        <div className="mb-xl">
          <h1 className="text-2xl font-bold text-neutral-900">My Profile</h1>
          <p className="text-sm text-neutral-500 mt-xs">Edit how your name appears across the platform.</p>
        </div>

        <form onSubmit={handleSave} className="space-y-lg">
          {/* Name card */}
          <div className="bg-white rounded-xl border border-neutral-200 p-lg space-y-md">
            <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide">Name</h2>

            {/* Preview */}
            {displayName && (
              <p className="text-xs text-neutral-400">
                Will display as: <span className="font-semibold text-neutral-700">{displayName}</span>
              </p>
            )}

            {/* Salutation */}
            <div>
              <label className="block text-sm font-medium text-neutral-900 mb-xs">
                Salutation <span className="text-neutral-400 font-normal">(optional)</span>
              </label>
              <select
                value={salutation}
                onChange={e => setSalutation(e.target.value)}
                className="w-full px-md py-sm border border-neutral-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900 text-sm"
              >
                {SALUTATIONS.map(s => (
                  <option key={s} value={s}>{s || '— None —'}</option>
                ))}
              </select>
            </div>

            {/* First + Last */}
            <div className="grid grid-cols-2 gap-md">
              <div>
                <label className="block text-sm font-medium text-neutral-900 mb-xs">
                  First name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  placeholder="First name"
                  required
                  className="w-full px-md py-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-900 mb-xs">
                  Last name
                </label>
                <input
                  type="text"
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  placeholder="Last name"
                  className="w-full px-md py-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Account info (read-only) */}
          <div className="bg-white rounded-xl border border-neutral-200 p-lg space-y-md">
            <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide">Account</h2>
            <div>
              <p className="text-xs text-neutral-400 mb-xs">Email</p>
              <p className="text-sm text-neutral-900">{email}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-400 mb-xs">Role</p>
              <p className="text-sm text-neutral-900 capitalize">{role}</p>
            </div>
            <p className="text-xs text-neutral-400">To change your email or password, use the Supabase dashboard.</p>
          </div>

          {/* Error / success */}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-md py-sm text-sm text-red-700">
              {error}
            </div>
          )}
          {saved && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-md py-sm text-sm text-green-700">
              ✅ Profile saved.
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-neutral-900 py-md text-sm font-bold text-white hover:bg-neutral-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      </main>
    </div>
  )
}
