'use client'

/**
 * UserProfilePage — shared self-edit profile card for any portal role.
 * Used by contractor, cleaner, lettings, and (in a wrapper) landlord.
 */

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'

interface Props {
  allowedRoles: string[]   // roles allowed to view this page
  backHref: string         // where the back button goes
  roleName: string         // display name e.g. "Contractor"
}

export default function UserProfilePage({ allowedRoles, backHref, roleName }: Props) {
  const router = useRouter()
  const [person, setPerson]   = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const [form, setForm] = useState({
    first_name: '',
    last_name:  '',
    phone:      '',
  })

  const supabase = createClient()

  useEffect(() => {
    async function init() {
      const user = await getCurrentUser()
      const role = user?.assignment?.role || ''
      const isAdmin = ['administrator', 'admin'].includes(role)
      if (!user || (!isAdmin && !allowedRoles.includes(role))) {
        router.push('/login'); return
      }

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
      })
      setLoading(false)
    }
    init()
  }, [])

  async function handleSave() {
    if (!person) return
    setSaving(true); setError(null); setSaved(false)
    const { error: err } = await supabase
      .from('people')
      .update({
        first_name: form.first_name.trim(),
        last_name:  form.last_name.trim(),
        phone:      form.phone.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', person.id)
    setSaving(false)
    if (err) { setError(err.message); return }
    setSaved(true)
    setPerson((prev: any) => ({ ...prev, ...form }))
    setTimeout(() => setSaved(false), 4000)
  }

  const initials = (form.first_name?.[0] || person?.email?.[0] || '?').toUpperCase()
  const displayName = [form.first_name, form.last_name].filter(Boolean).join(' ') || person?.email || '—'

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar left={<BackButton href={backHref} />} />
        <div className="flex items-center justify-center py-3xl">
          <p className="text-sm text-neutral-400">Loading…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href={backHref} />} />

      <main className="mx-auto max-w-md px-lg py-2xl">
        <div className="mb-2xl">
          <h1 className="text-2xl font-bold text-neutral-900">My profile</h1>
          <p className="text-sm text-neutral-500 mt-xs">{roleName} · update your contact details</p>
        </div>

        {/* Avatar card */}
        <div className="rounded-2xl bg-neutral-900 p-xl flex items-center gap-lg mb-xl">
          <div className="w-14 h-14 rounded-full bg-neutral-700 flex items-center justify-center text-2xl font-bold text-white shrink-0">
            {initials}
          </div>
          <div>
            <p className="text-lg font-bold text-white">{displayName}</p>
            <p className="text-sm text-neutral-400">{person?.email}</p>
            <span className="mt-xs inline-block text-xs font-semibold px-sm py-xs rounded-full bg-neutral-700 text-neutral-300">
              {roleName}
            </span>
          </div>
        </div>

        {/* Edit form */}
        <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden">
          <div className="px-xl py-lg border-b border-neutral-100">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Your details</p>
          </div>
          <div className="px-xl py-xl space-y-lg">

            <div className="grid grid-cols-2 gap-lg">
              <div>
                <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">First name</label>
                <input type="text" value={form.first_name}
                  onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
                  placeholder="First name"
                  className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Last name</label>
                <input type="text" value={form.last_name}
                  onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}
                  placeholder="Last name"
                  className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Email</label>
              <input type="email" value={person?.email || ''} disabled
                className="w-full px-md py-sm border border-neutral-100 rounded-lg text-sm text-neutral-400 bg-neutral-50 cursor-not-allowed" />
              <p className="text-xs text-neutral-400 mt-xs">Contact your admin to change your email.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Phone</label>
              <input type="tel" value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="e.g. 07700 000000"
                className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900" />
            </div>

          </div>
          <div className="px-xl pb-xl">
            {error  && <p className="text-sm text-red-600 mb-md">⚠ {error}</p>}
            {saved  && <p className="text-sm text-green-600 mb-md">✓ Saved successfully</p>}
            <button onClick={handleSave} disabled={saving}
              className="w-full py-sm rounded-xl bg-neutral-900 text-white text-sm font-semibold hover:bg-neutral-700 disabled:opacity-40 transition">
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
