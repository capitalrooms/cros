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
import Link from 'next/link'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

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
  const [userRole, setUserRole] = useState('')

  const [form, setForm] = useState({
    first_name: '',
    last_name:  '',
    phone:      '',
    job_title:    '',
    direct_phone: '',
  })

  // Push notification state
  const [pushSupported, setPushSupported] = useState(false)
  const [pushStatus, setPushStatus]       = useState<'checking' | 'denied' | 'subscribed' | 'unsubscribed'>('checking')
  const [pushLoading, setPushLoading]     = useState(false)
  const [pushMsg, setPushMsg]             = useState<string | null>(null)

  const supabase = createClient()

  useEffect(() => {
    async function init() {
      const user = await getCurrentUser()
      const role = user?.assignment?.role || ''
      const isAdmin = ['administrator', 'admin'].includes(role)
      if (!user || (!isAdmin && !allowedRoles.includes(role))) {
        router.push('/login'); return
      }
      setUserRole(role)

      const { data: p } = await supabase
        .from('people')
        .select('*')
        .eq('email', user.user?.email ?? user.assignment?.email ?? '')
        .single()

      if (!p) { setLoading(false); return }
      setPerson(p)
      setForm({
        first_name: p.first_name || '',
        last_name:  p.last_name  || '',
        phone:      p.phone      || '',
        job_title:    p.job_title    || '',
        direct_phone: p.direct_phone || '',
      })
      // Check push support & re-sync existing subscription to DB if needed
      if ('serviceWorker' in navigator && 'PushManager' in window) {
        setPushSupported(true)
        if (Notification.permission === 'denied') {
          setPushStatus('denied')
        } else {
          try {
            const reg = await navigator.serviceWorker.ready
            const sub = await reg.pushManager.getSubscription()
            if (sub) {
              setPushStatus('subscribed')
              // Re-sync to DB silently in case a previous save failed
              const { createClient: getClient } = await import('@/lib/supabase')
              const sbClient = getClient()
              const { data: { session } } = await sbClient.auth.getSession()
              const tok = session?.access_token
              if (tok && p) {
                const j = sub.toJSON()
                fetch('/api/push/subscribe', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
                  body: JSON.stringify({
                    endpoint: j.endpoint,
                    p256dh: (j.keys as any)?.p256dh,
                    auth: (j.keys as any)?.auth,
                    personId: p.id || undefined,
                    email: p.email || undefined,
                    role: role,
                  }),
                }).catch(() => {})
              }
            } else {
              setPushStatus('unsubscribed')
            }
          } catch { setPushStatus('unsubscribed') }
        }
      } else {
        setPushSupported(false)
        setPushStatus('unsubscribed')
      }

      setLoading(false)
    }
    init()
  }, [])

  async function enablePush() {
    if (!person) return
    setPushLoading(true); setPushMsg(null)
    try {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') { setPushStatus('denied'); setPushMsg('Notifications blocked — enable them in your browser/phone settings.'); return }

      const { createClient: getClient } = await import('@/lib/supabase')
      const sbClient = getClient()
      const { data: { session } } = await sbClient.auth.getSession()
      const tok = session?.access_token

      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) })
      const j = sub.toJSON()
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
        },
        body: JSON.stringify({ endpoint: j.endpoint, p256dh: (j.keys as any)?.p256dh, auth: (j.keys as any)?.auth, personId: person.id, email: person.email, role: userRole }),
      })
      if (!res.ok) throw new Error('Could not save subscription')
      setPushStatus('subscribed')
      setPushMsg('✅ Push notifications enabled on this device!')
    } catch (e: any) { setPushMsg(e.message || 'Failed to enable push') }
    finally { setPushLoading(false) }
  }

  async function disablePush() {
    setPushLoading(true); setPushMsg(null)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await sub.unsubscribe()
        await fetch('/api/push/subscribe', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {})
      }
      setPushStatus('unsubscribed')
      setPushMsg('Push notifications disabled on this device.')
    } catch (e: any) { setPushMsg(e.message || 'Failed to disable') }
    finally { setPushLoading(false) }
  }

  const isStaff = ['administrator', 'admin', 'lettings'].includes(userRole)

  async function handleSave() {
    if (!person) return
    setSaving(true); setError(null); setSaved(false)
    const { error: err } = await supabase
      .from('people')
      .update({
        first_name: form.first_name.trim(),
        last_name:  form.last_name.trim(),
        phone:      form.phone.trim() || null,
        // staff only: these fill the signature on emails they send
        ...(isStaff ? { job_title: form.job_title.trim() || null, direct_phone: form.direct_phone.trim() || null } : {}),
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

            {isStaff && (
              <div className="rounded-xl bg-neutral-50 p-md space-y-md">
                <div>
                  <p className="text-sm font-semibold text-neutral-900">Your email signature</p>
                  <p className="text-xs text-neutral-500">Every email you send from the system is signed with your name, job title, phone number and email address.</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Job title</label>
                  <input type="text" value={form.job_title}
                    onChange={e => setForm(f => ({ ...f, job_title: e.target.value }))}
                    placeholder="e.g. Lettings Negotiator"
                    className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">Phone on your signature</label>
                  <input type="tel" value={form.direct_phone}
                    onChange={e => setForm(f => ({ ...f, direct_phone: e.target.value }))}
                    placeholder="Leave blank to show the office number, 0207 112 9163"
                    className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900" />
                </div>
              </div>
            )}

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

        {/* ── Push Notifications ──────────────────────────────────────────── */}
        <div className="mt-xl rounded-2xl border border-neutral-200 bg-white overflow-hidden">
          <div className="px-lg py-md border-b border-neutral-100">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Push Notifications</p>
          </div>
          <div className="px-lg py-lg space-y-md">
            {!pushSupported ? (
              <div className="space-y-sm">
                <p className="text-sm font-medium text-neutral-700">Not available in browser tabs</p>
                <p className="text-xs text-neutral-500 leading-relaxed">
                  Push notifications require the app to be installed on your home screen. Open this site in <strong>Safari</strong>, tap the <strong>Share button ⬆</strong>, then <strong>"Add to Home Screen"</strong>. Once installed, this toggle will work.
                </p>
                <Link href="/install" className="inline-flex items-center gap-xs text-xs font-semibold text-neutral-900 underline underline-offset-2">
                  📲 Installation guide
                </Link>
              </div>
            ) : pushStatus === 'denied' ? (
              <p className="text-xs text-red-700">Notifications are blocked. Go to your phone's <strong>Settings → Notifications</strong> for this app and allow them, then refresh.</p>
            ) : (
              <>
                <div className="flex items-center justify-between gap-md">
                  <div className="flex items-center gap-sm">
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${pushStatus === 'subscribed' ? 'bg-green-500' : 'bg-neutral-300'}`} />
                    <span className="text-sm text-neutral-700">
                      {pushStatus === 'checking' ? 'Checking…' : pushStatus === 'subscribed' ? 'Enabled on this device' : 'Not enabled on this device'}
                    </span>
                  </div>
                  {pushStatus !== 'checking' && (
                    pushStatus === 'subscribed' ? (
                      <button type="button" onClick={disablePush} disabled={pushLoading}
                        className="text-xs text-neutral-500 hover:text-red-600 transition-colors disabled:opacity-40 underline underline-offset-2">
                        {pushLoading ? 'Disabling…' : 'Disable'}
                      </button>
                    ) : (
                      <button type="button" onClick={enablePush} disabled={pushLoading}
                        className="rounded-lg bg-neutral-900 px-md py-sm text-xs font-semibold text-white hover:bg-neutral-700 disabled:opacity-40 transition-colors">
                        {pushLoading ? 'Enabling…' : 'Enable push'}
                      </button>
                    )
                  )}
                </div>

                {/* Tenant warning when disabling */}
                {userRole === 'tenant' && pushStatus === 'subscribed' && (
                  <div className="flex items-start gap-sm rounded-lg bg-amber-50 border border-amber-200 px-md py-sm">
                    <span className="text-amber-500 text-base shrink-0 mt-px">⚠️</span>
                    <p className="text-xs text-amber-800 leading-relaxed">
                      <strong>Heads up:</strong> Disabling notifications means you won't receive alerts when contractors need access to your property or room, or if there are important updates about your tenancy.
                    </p>
                  </div>
                )}
              </>
            )}

            {pushMsg && (
              <p className={`text-xs rounded-lg px-md py-sm border ${pushMsg.startsWith('✅') ? 'bg-green-50 border-green-100 text-green-700' : 'bg-amber-50 border-amber-100 text-amber-700'}`}>
                {pushMsg}
              </p>
            )}
          </div>
        </div>

        {/* ── Install the app ─────────────────────────────────────────────── */}
        <Link
          href="/install"
          className="mt-xl flex items-center justify-between rounded-2xl border border-neutral-200 bg-white px-lg py-md hover:bg-neutral-50 transition group"
        >
          <div className="flex items-center gap-md">
            <span className="text-2xl">📲</span>
            <div>
              <p className="text-sm font-bold text-neutral-900">Install the app</p>
              <p className="text-xs text-neutral-500 mt-xs">
                Add to Home Screen to unlock push notifications, Share Sheet and more
              </p>
            </div>
          </div>
          <span className="text-neutral-400 group-hover:text-neutral-700 transition text-lg shrink-0">›</span>
        </Link>

      </main>
    </div>
  )
}
