'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'

const SALUTATIONS = ['', 'Mr', 'Mrs', 'Ms', 'Miss', 'Dr', 'Prof', 'Rev', 'Mx']
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

export default function AdminProfilePage() {
  const router = useRouter()

  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [saved, setSaved]             = useState(false)
  const [error, setError]             = useState('')

  // Name fields
  const [salutation, setSalutation]   = useState('')
  const [firstName, setFirstName]     = useState('')
  const [lastName, setLastName]       = useState('')
  const [email, setEmail]             = useState('')
  const [role, setRole]               = useState('')
  const [personId, setPersonId]       = useState('')

  // PDF sign-off fields
  const [jobTitle, setJobTitle]       = useState('')
  const [directPhone, setDirectPhone] = useState('')

  // No longer stored in state — fetched fresh on every save to avoid stale token issues

  // Push notification state
  const [pushSupported, setPushSupported]   = useState(false)
  const [pushStatus, setPushStatus]         = useState<'checking' | 'denied' | 'subscribed' | 'unsubscribed'>('checking')
  const [pushLoading, setPushLoading]       = useState(false)
  const [pushMsg, setPushMsg]               = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const user = await getCurrentUser()
        if (!user) { router.push('/login'); return }
        if (!['administrator', 'admin', 'lettings'].includes(user.assignment?.role || '')) {
          router.push('/login'); return
        }

        // getUserAssignment does select(*) so assignment has all fields
        const p = user.assignment as any
        if (!p) throw new Error('Could not load profile')

        setSalutation(p.salutation || '')
        setFirstName(p.first_name || '')
        setLastName(p.last_name || '')
        setEmail(p.email || user.user.email || '')
        setRole(p.role || '')
        setPersonId(p.id || '')
        setJobTitle(p.job_title || '')
        setDirectPhone(p.direct_phone || '')

        // Check push support & current subscription status
        if ('serviceWorker' in navigator && 'PushManager' in window) {
          setPushSupported(true)
          const perm = Notification.permission
          if (perm === 'denied') {
            setPushStatus('denied')
          } else {
            try {
              const reg = await navigator.serviceWorker.ready
              const sub = await reg.pushManager.getSubscription()
              if (sub) {
                setPushStatus('subscribed')
                // Re-sync to DB in case a previous save failed
                const { createClient: getClient } = await import('@/lib/supabase')
                const sbClient = getClient()
                const { data: { session } } = await sbClient.auth.getSession()
                const tok = session?.access_token
                if (tok) {
                  const j = sub.toJSON()
                  fetch('/api/push/subscribe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
                    body: JSON.stringify({
                      endpoint: j.endpoint,
                      p256dh: (j.keys as any)?.p256dh,
                      auth: (j.keys as any)?.auth,
                      personId: personId || undefined,
                      email: p.email || undefined,
                      role: p.role || 'administrator',
                    }),
                  }).catch(() => {})
                }
              } else {
                setPushStatus('unsubscribed')
              }
            } catch {
              setPushStatus('unsubscribed')
            }
          }
        } else {
          setPushSupported(false)
          setPushStatus('unsubscribed')
        }
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
      // Save directly via Supabase client — no Bearer token needed
      const { createClient } = await import('@/lib/supabase')
      const supabase = createClient()

      const firstTrimmed = firstName.trim()
      const lastTrimmed  = lastName.trim()
      const { error: dbErr } = await supabase
        .from('people')
        .update({
          first_name:   firstTrimmed || null,
          last_name:    lastTrimmed  || null,
          full_name:    [firstTrimmed, lastTrimmed].filter(Boolean).join(' ') || firstTrimmed,
          salutation:   salutation || null,
          job_title:    jobTitle.trim()    || null,
          direct_phone: directPhone.trim() || null,
          updated_at:   new Date().toISOString(),
        })
        .eq('email', email)

      if (dbErr) throw new Error(dbErr.message || 'Save failed')
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: any) {
      setError(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function enablePush() {
    setPushLoading(true)
    setPushMsg(null)
    try {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') {
        setPushStatus('denied')
        setPushMsg('Notifications blocked. Enable them in your browser settings.')
        return
      }
      const { createClient: getClient } = await import('@/lib/supabase')
      const sbClient = getClient()
      const { data: { session } } = await sbClient.auth.getSession()
      const tok = session?.access_token

      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
      const j = sub.toJSON()
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
        },
        body: JSON.stringify({
          endpoint: j.endpoint,
          p256dh: (j.keys as any)?.p256dh,
          auth: (j.keys as any)?.auth,
          personId: personId || undefined,
          email: email || undefined,
          role: role || 'administrator',
        }),
      })
      if (!res.ok) throw new Error('Could not save subscription')
      setPushStatus('subscribed')
      setPushMsg('✅ Push notifications enabled on this device!')
    } catch (e: any) {
      setPushMsg(e.message || 'Failed to enable push')
    } finally {
      setPushLoading(false)
    }
  }

  async function disablePush() {
    setPushLoading(true)
    setPushMsg(null)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await sub.unsubscribe()
        // Also remove from DB
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {})
      }
      setPushStatus('unsubscribed')
      setPushMsg('Push notifications disabled on this device.')
    } catch (e: any) {
      setPushMsg(e.message || 'Failed to disable push')
    } finally {
      setPushLoading(false)
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
          <p className="text-sm text-neutral-500 mt-xs">Edit how your name and sign-off appear across the platform.</p>
        </div>

        <form onSubmit={handleSave} className="space-y-lg">

          {/* ── Name ──────────────────────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-neutral-200 p-lg space-y-md">
            <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide">Name</h2>

            {displayName && (
              <p className="text-xs text-neutral-400">
                Will display as: <span className="font-semibold text-neutral-700">{displayName}</span>
              </p>
            )}

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
                <label className="block text-sm font-medium text-neutral-900 mb-xs">Last name</label>
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

          {/* ── PDF Sign-off ───────────────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-neutral-200 p-lg space-y-md">
            <div>
              <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide">PDF Sign-off</h2>
              <p className="text-xs text-neutral-400 mt-xs">
                Appears on every PDF you generate — valuations, rent increases, and more.
              </p>
            </div>

            {/* Preview block */}
            <div className="rounded-lg border border-neutral-100 bg-neutral-50 p-md text-sm">
              <p className="text-neutral-500 font-normal mb-sm">Yours sincerely,</p>
              <p className="text-xs text-neutral-400 italic mb-sm">[ ✒️ pen icon — same on every document ]</p>
              <p className="font-bold text-neutral-900">{displayName || firstName || 'Your Name'}</p>
              {jobTitle    && <p className="text-neutral-500 mt-xs">{jobTitle}</p>}
              {directPhone && <p className="text-neutral-500">{directPhone}</p>}
            </div>

            {/* Job title */}
            <div>
              <label className="block text-sm font-medium text-neutral-900 mb-xs">
                Job title <span className="text-neutral-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={jobTitle}
                onChange={e => setJobTitle(e.target.value)}
                placeholder="e.g. Director, Lettings Manager"
                className="w-full px-md py-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900 text-sm"
              />
            </div>

            {/* Direct phone */}
            <div>
              <label className="block text-sm font-medium text-neutral-900 mb-xs">
                Direct phone <span className="text-neutral-400 font-normal">(optional)</span>
              </label>
              <input
                type="tel"
                value={directPhone}
                onChange={e => setDirectPhone(e.target.value)}
                placeholder="e.g. 07700 900 123"
                className="w-full px-md py-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900 text-sm"
              />
            </div>
          </div>

          {/* ── Account (read-only) ────────────────────────────────────────── */}
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

          {/* ── Push Notifications ────────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-neutral-200 p-lg space-y-md">
            <div>
              <h2 className="text-sm font-semibold text-neutral-700 uppercase tracking-wide">Push Notifications</h2>
              <p className="text-xs text-neutral-400 mt-xs">
                Receive instant alerts on this device — new maintenance tickets, messages, and more.
              </p>
            </div>

            {!pushSupported ? (
              <div className="space-y-sm">
                <p className="text-sm font-medium text-neutral-700">Not available in browser tabs</p>
                <p className="text-xs text-neutral-500 leading-relaxed">
                  Push notifications require the app to be installed on your home screen. Open this site in <strong>Safari</strong>, tap the <strong>Share button ⬆</strong>, then <strong>"Add to Home Screen"</strong>. Once installed as an app, this toggle will work.
                </p>
              </div>
            ) : pushStatus === 'denied' ? (
              <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-md py-sm">
                Notifications are blocked by your browser. Go to <strong>Settings → Notifications</strong> for this site and allow them, then refresh.
              </p>
            ) : (
              <div className="flex items-center justify-between gap-md">
                <div className="flex items-center gap-sm">
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${pushStatus === 'subscribed' ? 'bg-green-500' : 'bg-neutral-300'}`} />
                  <span className="text-sm text-neutral-700">
                    {pushStatus === 'checking' ? 'Checking…' : pushStatus === 'subscribed' ? 'Enabled on this device' : 'Not enabled on this device'}
                  </span>
                </div>
                {pushStatus !== 'checking' && (
                  pushStatus === 'subscribed' ? (
                    <button
                      type="button"
                      onClick={disablePush}
                      disabled={pushLoading}
                      className="text-xs text-neutral-500 hover:text-red-600 transition-colors disabled:opacity-40 underline underline-offset-2"
                    >
                      {pushLoading ? 'Disabling…' : 'Disable'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={enablePush}
                      disabled={pushLoading}
                      className="rounded-lg bg-neutral-900 px-md py-sm text-xs font-semibold text-white hover:bg-neutral-700 disabled:opacity-40 transition-colors"
                    >
                      {pushLoading ? 'Enabling…' : 'Enable push'}
                    </button>
                  )
                )}
              </div>
            )}

            {pushMsg && (
              <p className={`text-xs rounded-lg px-md py-sm border ${pushMsg.startsWith('✅') ? 'bg-green-50 border-green-100 text-green-700' : 'bg-amber-50 border-amber-100 text-amber-700'}`}>
                {pushMsg}
              </p>
            )}
          </div>

          {/* ── Feedback ──────────────────────────────────────────────────── */}
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
