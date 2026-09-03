'use client'

/**
 * Landlord profile self-edit page.
 *
 * Safe fields (phone) — applied immediately.
 * Sensitive fields (name, company, home address, company number) — queued as a
 * change request in the notifications table for admin review before applying.
 */

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'

const SENSITIVE = ['first_name', 'last_name', 'company', 'home_address', 'company_number'] as const
type SensitiveKey = typeof SENSITIVE[number]

export default function LandlordProfilePage() {
  const router = useRouter()
  const [person, setPerson]     = useState<any | null>(null)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [status, setStatus]     = useState<{ type: 'ok' | 'request' | 'error'; msg: string } | null>(null)

  const [form, setForm] = useState({
    first_name:     '',
    last_name:      '',
    phone:          '',
    company:        '',
    home_address:   '',
    company_number: '',
  })

  const supabase = createClient()

  useEffect(() => {
    async function init() {
      const user = await getCurrentUser()
      const role = user?.assignment?.role || ''
      if (!user || !['landlord', 'administrator', 'admin'].includes(role)) {
        router.push('/login'); return
      }
      const { data: p } = await supabase.from('people').select('*').eq('email', user.email).single()
      if (!p) { setLoading(false); return }
      setPerson(p)
      setForm({
        first_name:     p.first_name     || '',
        last_name:      p.last_name      || '',
        phone:          p.phone          || '',
        company:        p.company        || '',
        home_address:   p.home_address   || '',
        company_number: p.company_number || '',
      })
      setLoading(false)
    }
    init()
  }, [])

  // Work out what changed
  function getChanges() {
    if (!person) return { safe: {} as any, sensitive: {} as Record<string, string> }
    const safe: any = {}
    const sensitive: Record<string, string> = {}
    if (form.phone.trim() !== (person.phone || '')) safe.phone = form.phone.trim() || null
    for (const key of SENSITIVE) {
      const newVal = form[key].trim()
      const oldVal = person[key] || ''
      if (newVal !== oldVal) sensitive[key] = newVal
    }
    return { safe, sensitive }
  }

  async function handleSave() {
    if (!person) return
    const { safe, sensitive } = getChanges()
    const hasSafe      = Object.keys(safe).length > 0
    const hasSensitive = Object.keys(sensitive).length > 0
    if (!hasSafe && !hasSensitive) { setStatus({ type: 'ok', msg: 'No changes to save.' }); return }

    setSaving(true); setStatus(null)

    // Apply safe fields immediately
    if (hasSafe) {
      await supabase.from('people').update({ ...safe, updated_at: new Date().toISOString() }).eq('id', person.id)
      setPerson((prev: any) => ({ ...prev, ...safe }))
    }

    // Queue sensitive changes as a notification for admin review
    if (hasSensitive) {
      const lines = Object.entries(sensitive).map(([k, v]) => {
        const label: Record<string, string> = {
          first_name: 'First name', last_name: 'Last name',
          company: 'Company', home_address: 'Home address', company_number: 'Company number',
        }
        return `${label[k] || k}: "${person[k] || '—'}" → "${v}"`
      }).join('\n')

      await supabase.from('notifications').insert({
        type:        'Profile change request',
        message:     `Landlord ${[person.first_name, person.last_name].filter(Boolean).join(' ') || person.email} has requested the following changes:\n\n${lines}`,
        related_table: 'people',
        related_id:  person.id,
        created_at:  new Date().toISOString(),
        is_read:     false,
      })
    }

    setSaving(false)
    if (hasSensitive && hasSafe) {
      setStatus({ type: 'request', msg: 'Phone updated immediately. Name/address changes have been sent to your admin for approval — they\'ll be applied once reviewed.' })
    } else if (hasSensitive) {
      setStatus({ type: 'request', msg: 'Your change request has been sent to your admin for approval. They\'ll update your details once reviewed.' })
    } else {
      setStatus({ type: 'ok', msg: '✓ Phone number updated.' })
    }
    setTimeout(() => setStatus(null), 8000)
  }

  const initials    = (form.first_name?.[0] || person?.email?.[0] || '?').toUpperCase()
  const displayName = [form.first_name, form.last_name].filter(Boolean).join(' ') || person?.email || '—'
  const { sensitive } = person ? getChanges() : { sensitive: {} as Record<string, string> }
  const hasPendingChanges = Object.keys(sensitive).length > 0

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar left={<BackButton href="/landlord" />} />
        <div className="flex items-center justify-center py-3xl"><p className="text-sm text-neutral-400">Loading…</p></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/landlord" />} />

      <main className="mx-auto max-w-md px-lg py-2xl">
        <div className="mb-2xl">
          <h1 className="text-2xl font-bold text-neutral-900">My profile</h1>
          <p className="text-sm text-neutral-500 mt-xs">Landlord · update your contact details</p>
        </div>

        {/* Avatar card */}
        <div className="rounded-2xl bg-neutral-900 p-xl flex items-center gap-lg mb-xl">
          <div className="w-14 h-14 rounded-full bg-neutral-700 flex items-center justify-center text-2xl font-bold text-white shrink-0">
            {initials}
          </div>
          <div>
            <p className="text-lg font-bold text-white">{displayName}</p>
            <p className="text-sm text-neutral-400">{person?.email}</p>
            <span className="mt-xs inline-block text-xs font-semibold px-sm py-xs rounded-full bg-neutral-700 text-neutral-300">Landlord</span>
          </div>
        </div>

        {/* Notice about sensitive fields */}
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-lg py-md mb-xl text-sm text-amber-800">
          <p className="font-semibold mb-xs">📋 About name & address changes</p>
          <p className="text-amber-700 text-xs">Phone updates apply immediately. Changes to your name, company, or address are sent to your property manager for review — they'll confirm once checked.</p>
        </div>

        {/* Status */}
        {status && (
          <div className={`rounded-xl px-lg py-md mb-xl text-sm font-semibold ${
            status.type === 'ok'      ? 'bg-green-50 text-green-800 border border-green-200' :
            status.type === 'request' ? 'bg-blue-50 text-blue-800 border border-blue-200' :
                                        'bg-red-50 text-red-800 border border-red-200'
          }`} style={{ whiteSpace: 'pre-line' }}>
            {status.type === 'ok' && '✓ '}{status.type === 'request' && '📨 '}{status.msg}
          </div>
        )}

        {/* Form */}
        <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden">
          <div className="px-xl py-lg border-b border-neutral-100">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Your details</p>
          </div>
          <div className="px-xl py-xl space-y-lg">

            {/* Phone — applies immediately */}
            <div>
              <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">
                Phone <span className="normal-case font-normal text-green-600">(updates immediately)</span>
              </label>
              <input type="tel" value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="e.g. 07700 000000"
                className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900" />
            </div>

            <div className="border-t border-neutral-100 pt-lg">
              <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-lg">
                Details requiring admin review
              </p>

              <div className="space-y-lg">
                <div className="grid grid-cols-2 gap-lg">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">First name</label>
                    <input type="text" value={form.first_name}
                      onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
                      className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Last name</label>
                    <input type="text" value={form.last_name}
                      onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}
                      className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Email</label>
                  <input type="email" value={person?.email || ''} disabled
                    className="w-full px-md py-sm border border-neutral-100 rounded-lg text-sm text-neutral-400 bg-neutral-50 cursor-not-allowed" />
                  <p className="text-xs text-neutral-400 mt-xs">Email changes require contacting your property manager directly.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Company name</label>
                  <input type="text" value={form.company}
                    onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                    placeholder="e.g. Smith Properties Ltd"
                    className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900" />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Company number</label>
                  <input type="text" value={form.company_number}
                    onChange={e => setForm(f => ({ ...f, company_number: e.target.value }))}
                    placeholder="e.g. 12345678"
                    className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900" />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Home address</label>
                  <textarea value={form.home_address}
                    onChange={e => setForm(f => ({ ...f, home_address: e.target.value }))}
                    rows={3} placeholder="Full home address"
                    className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900" />
                </div>
              </div>
            </div>

          </div>
          <div className="px-xl pb-xl">
            {hasPendingChanges && (
              <p className="text-xs text-amber-700 mb-md">⚠ Some changes shown will be sent for admin approval, not applied directly.</p>
            )}
            <button onClick={handleSave} disabled={saving}
              className="w-full py-sm rounded-xl bg-neutral-900 text-white text-sm font-semibold hover:bg-neutral-700 disabled:opacity-40 transition">
              {saving ? 'Sending…' : hasPendingChanges ? 'Save & request changes' : 'Save changes'}
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
