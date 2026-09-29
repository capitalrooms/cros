'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading'

interface Setting {
  key: string
  value: string
  updated_at: string
}

export default function AdminSettingsPage() {
  const router = useRouter()
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState<string | null>(null)
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [banner, setBanner]     = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    async function init() {
      const user = await getCurrentUser()
      if (!user || !['administrator', 'admin'].includes(user.assignment?.role || '')) {
        router.push('/login')
        return
      }
      await loadSettings()
      setLoading(false)
    }
    init()
  }, [router])

  async function loadSettings() {
    const res = await fetch('/api/admin/settings')
    const json = await res.json()
    const map: Record<string, string> = {}
    for (const s of (json.settings || [])) map[s.key] = s.value
    setSettings(map)
  }

  async function saveGrace(v: string) {
    setSaving('rent_grace_days'); setBanner(null)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'rent_grace_days', value: v }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Could not save')
      setSettings(prev => ({ ...prev, rent_grace_days: v }))
      setBanner({ type: 'ok', text: `Saved — unpaid rent now counts as overdue ${v} day${v === '1' ? '' : 's'} after it’s due.` })
    } catch (e: any) {
      setBanner({ type: 'err', text: e.message })
    } finally { setSaving(null) }
  }

  async function toggle(key: string, currentValue: string) {
    const newValue = currentValue === 'true' ? 'false' : 'true'
    setSaving(key)
    setBanner(null)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: newValue }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to save')
      setSettings(prev => ({ ...prev, [key]: newValue }))
      setBanner({
        type: 'ok',
        text: key === 'comms_live'
          ? newValue === 'true'
            ? '✅ Notifications are now LIVE — tenants and landlords will receive messages.'
            : '🔕 Notifications paused — no messages will be sent to tenants or landlords.'
          : `${key} set to ${newValue}`
      })
    } catch (e: any) {
      setBanner({ type: 'err', text: e.message })
    } finally {
      setSaving(null)
    }
  }

  if (loading) return <GenericPageSkeleton />

  const commsLive = settings['comms_live'] === 'true'
  const grace = settings['rent_grace_days'] ?? '5'
  const ledgerStart = settings['client_ledger_start']

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar />
      <main className="mx-auto max-w-6xl px-lg py-xl">
        <BackButton href="/admin" />
        <h1 className="text-2xl font-bold text-neutral-900">System Settings</h1>
        <p className="text-sm text-neutral-500 mb-xl">Global controls for Capital Rooms. Changes take effect immediately — no redeploy needed.</p>

        {banner && (
          <div className={`rounded-xl px-lg py-md mb-lg text-sm font-semibold border ${
            banner.type === 'ok'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            {banner.text}
          </div>
        )}

        {/* ── Notifications kill switch ── */}
        <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden mb-lg">
          <div className="px-lg py-md border-b border-neutral-100">
            <h2 className="font-bold text-neutral-900 text-base">Notifications</h2>
            <p className="text-xs text-neutral-500 mt-xs">Controls all outbound tenant and landlord messaging — push, email, and SMS.</p>
          </div>

          <div className="px-lg py-lg flex items-start gap-lg">
            <button
              onClick={() => toggle('comms_live', settings['comms_live'] ?? 'false')}
              disabled={saving === 'comms_live'}
              className={`shrink-0 relative w-14 h-7 rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
                commsLive ? 'bg-green-500' : 'bg-neutral-300'
              }`}
              aria-label="Toggle tenant notifications"
            >
              <span className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform duration-200 ${
                commsLive ? 'translate-x-7' : 'translate-x-0'
              }`} />
            </button>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-sm">
                <p className="font-semibold text-neutral-900">
                  {commsLive ? '🟢 Notifications live' : '🔕 Notifications paused'}
                </p>
                {saving === 'comms_live' && <span className="text-xs text-neutral-400">Saving…</span>}
              </div>
              {commsLive ? (
                <p className="text-xs text-neutral-500 mt-xs">
                  Tenants and landlords will receive push notifications, emails, and SMS as normal.
                </p>
              ) : (
                <p className="text-xs text-amber-700 mt-xs">
                  <strong>Safe mode:</strong> no messages being sent. Staff notifications unaffected.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ── Rent ── */}
        <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden mb-lg">
          <div className="px-lg py-md border-b border-neutral-100">
            <h2 className="font-bold text-neutral-900 text-base">Rent</h2>
            <p className="text-xs text-neutral-500 mt-xs">
              {ledgerStart
                ? <>CROS collects rent from <strong>{new Date(ledgerStart + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>. Earlier months were collected by your previous agent and never count as arrears.</>
                : 'When CROS starts collecting rent.'}
            </p>
          </div>
          <div className="px-lg py-lg flex flex-wrap items-center gap-md">
            <label htmlFor="grace" className="flex-1 min-w-[220px]">
              <span className="block text-sm font-semibold text-neutral-900">Grace period</span>
              <span className="block text-xs text-neutral-500 mt-xs">Days after rent is due before an unpaid charge counts as overdue and appears in Arrears. Bank transfers can take a day or two.</span>
            </label>
            <select id="grace" value={grace} disabled={saving === 'rent_grace_days'} onChange={e => saveGrace(e.target.value)}
              className="rounded-xl border border-neutral-300 bg-white px-md py-sm text-sm text-neutral-900">
              {[0, 1, 2, 3, 5, 7, 10, 14].map(n => <option key={n} value={String(n)}>{n === 0 ? 'None — overdue on the due date' : `${n} day${n === 1 ? '' : 's'}`}</option>)}
            </select>
            {saving === 'rent_grace_days' && <span className="text-xs text-neutral-400">Saving…</span>}
          </div>
        </div>

        {/* ── Email signatures ── */}
        <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden mb-lg">
          <div className="px-lg py-md border-b border-neutral-100">
            <h2 className="font-bold text-neutral-900 text-base">Email Signatures</h2>
          </div>
          <div className="px-lg py-lg flex items-center gap-lg">
            <div className="flex-1">
              <p className="text-sm font-semibold text-neutral-900">Gmail signatures in the house style</p>
              <p className="text-xs text-neutral-500 mt-xs">Make a signature for anyone on the team — name, job title, mobile and email filled in — ready to paste into Gmail.</p>
            </div>
            <a href="/admin/settings/signatures"
              className="shrink-0 rounded-xl bg-neutral-900 px-lg py-sm text-sm font-semibold text-white hover:bg-neutral-700 transition-colors">
              Make a signature →
            </a>
          </div>
        </div>

        {/* ── Email Branding — moved ── */}
        <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden mb-lg">
          <div className="px-lg py-md border-b border-neutral-100">
            <h2 className="font-bold text-neutral-900 text-base">Email Branding</h2>
          </div>

          <div className="px-lg py-lg flex items-center gap-lg">
            <div className="text-2xl">🎨</div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-neutral-900">Moved to Message Templates</p>
              <p className="text-xs text-neutral-500 mt-xs">
                Logo, theme, and business contact details are now edited in the{' '}
                <strong>Branding &amp; Contact Details</strong> tab — alongside all the other outbound email settings.
              </p>
            </div>
            <a
              href="/admin/message-templates"
              className="shrink-0 rounded-xl bg-neutral-900 px-lg py-sm text-sm font-semibold text-white hover:bg-neutral-700 transition-colors"
            >
              Go to Message Templates →
            </a>
          </div>
        </div>

      </main>
    </div>
  )
}
