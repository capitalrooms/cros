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
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

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
      if (!res.ok) throw new Error('Failed to save')
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

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar />
      <main className="mx-auto max-w-2xl px-lg py-lg">
        <BackButton />
        <h1 className="text-2xl font-bold text-neutral-900 mt-md mb-xs">System Settings</h1>
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
            {/* Toggle */}
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
                {saving === 'comms_live' && (
                  <span className="text-xs text-neutral-400">Saving…</span>
                )}
              </div>
              {commsLive ? (
                <p className="text-xs text-neutral-500 mt-xs">
                  Tenants and landlords will receive push notifications, emails, and SMS as normal.
                  Turn this off if you need to pause all outbound messaging.
                </p>
              ) : (
                <p className="text-xs text-amber-700 mt-xs">
                  <strong>Safe mode:</strong> no messages are being sent to tenants or landlords.
                  Staff notifications (contractors, cleaners, admin) are unaffected.
                  Turn on when you are ready to go live.
                </p>
              )}
            </div>
          </div>

          <div className="px-lg py-md bg-neutral-50 border-t border-neutral-100">
            <p className="text-xs text-neutral-400">
              This DB toggle takes precedence over the <code className="font-mono">TENANT_COMMS_LIVE</code> environment variable.
              The env var remains as a permanent fallback if this table is unavailable.
            </p>
          </div>
        </div>

        {/* ── Future settings placeholder ── */}
        <div className="bg-white rounded-2xl border border-neutral-200 px-lg py-lg">
          <h2 className="font-bold text-neutral-900 text-base mb-xs">More settings</h2>
          <p className="text-xs text-neutral-500">Additional system controls will appear here as the platform grows.</p>
        </div>
      </main>
    </div>
  )
}
