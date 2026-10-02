'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'

const SALUTATIONS = ['', 'Mr', 'Mrs', 'Ms', 'Miss', 'Dr', 'Prof', 'Rev', 'Mx']
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
  return (
    <div className="w-16 h-16 rounded-full bg-neutral-900 flex items-center justify-center shrink-0">
      <span className="text-xl font-bold text-white">{initials || '?'}</span>
    </div>
  )
}

export default function AdminProfilePage() {
  const router = useRouter()

  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [saved, setSaved]             = useState(false)
  const [error, setError]             = useState('')

  const [salutation, setSalutation]   = useState('')
  const [firstName, setFirstName]     = useState('')
  const [lastName, setLastName]       = useState('')
  const [preferredName, setPreferredName] = useState('')
  const [email, setEmail]             = useState('')
  const [role, setRole]               = useState('')
  const [personId, setPersonId]       = useState('')
  const [jobTitle, setJobTitle]       = useState('')
  const [directPhone, setDirectPhone] = useState('')

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

        const p = user.assignment as any
        if (!p) throw new Error('Could not load profile')

        setSalutation(p.salutation || '')
        setFirstName(p.first_name || '')
        setLastName(p.last_name || '')
        setPreferredName(p.preferred_name || '')
        setEmail(p.email || user.user.email || '')
        setRole(p.role || '')
        setPersonId(p.id || '')
        setJobTitle(p.job_title || '')
        setDirectPhone(p.direct_phone || '')

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
      const { createClient } = await import('@/lib/supabase')
      const supabase = createClient()

      const firstTrimmed = firstName.trim()
      const lastTrimmed  = lastName.trim()
      const { error: dbErr } = await supabase
        .from('people')
        .update({
          first_name:     firstTrimmed || null,
          last_name:      lastTrimmed  || null,
          full_name:      [firstTrimmed, lastTrimmed].filter(Boolean).join(' ') || firstTrimmed,
          salutation:     salutation || null,
          preferred_name: preferredName.trim() || null,
          job_title:      jobTitle.trim()    || null,
          direct_phone:   directPhone.trim() || null,
          updated_at:     new Date().toISOString(),
        })
        .eq('email', email)

      if (dbErr) {
        // preferred_name column may not exist yet — retry without it
        if (dbErr.message?.includes('preferred_name')) {
          const { error: dbErr2 } = await supabase
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
          if (dbErr2) throw new Error(dbErr2.message || 'Save failed')
        } else {
          throw new Error(dbErr.message || 'Save failed')
        }
      }

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

  // Derived display values
  const displayName  = [salutation, firstName, lastName].filter(Boolean).join(' ')
  const smsName      = preferredName.trim() || firstName.trim() || 'Your Name'
  const smsContact   = directPhone.trim() || email
  const smsSignOff   = smsContact
    ? `${smsName}, Capital Rooms | ${smsContact}`
    : `${smsName}, Capital Rooms`

  const roleLabel: Record<string, string> = {
    administrator: 'Administrator',
    admin: 'Administrator',
    lettings: 'Lettings',
    cleaner: 'Cleaner',
  }

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
      <PageHero eyebrow="Your profile" title={displayName || firstName || 'My Profile'} subtitle={`${roleLabel[role] || role} · ${email}`} />

      <main className="mx-auto max-w-6xl px-lg py-xl">

        <form onSubmit={handleSave} className="space-y-lg">

          {/* ── Name ── */}
          <section className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
            <div className="px-xl py-lg border-b border-neutral-100">
              <h2 className="text-sm font-semibold text-neutral-900">Name</h2>
              <p className="text-xs text-neutral-500 mt-xs">How your name appears on letters and documents.</p>
            </div>
            <div className="px-xl py-lg space-y-md">
              <div>
                <label className="block text-xs font-semibold text-neutral-600 mb-xs uppercase tracking-wide">
                  Salutation <span className="font-normal normal-case text-neutral-400">optional</span>
                </label>
                <select
                  value={salutation}
                  onChange={e => setSalutation(e.target.value)}
                  className="w-full px-md py-sm border border-neutral-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900 text-sm text-neutral-900"
                >
                  {SALUTATIONS.map(s => (
                    <option key={s} value={s}>{s || '— None —'}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-md">
                <div>
                  <label className="block text-xs font-semibold text-neutral-600 mb-xs uppercase tracking-wide">
                    First name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    placeholder="First name"
                    required
                    className="w-full px-md py-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900 text-sm text-neutral-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-600 mb-xs uppercase tracking-wide">Last name</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    placeholder="Last name"
                    className="w-full px-md py-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900 text-sm text-neutral-900"
                  />
                </div>
              </div>
              {displayName && (
                <p className="text-xs text-neutral-400">
                  Full name: <span className="font-semibold text-neutral-700">{displayName}</span>
                </p>
              )}
            </div>
          </section>

          {/* ── Contact & Sign-off ── */}
          <section className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
            <div className="px-xl py-lg border-b border-neutral-100">
              <h2 className="text-sm font-semibold text-neutral-900">Contact &amp; Sign-off</h2>
              <p className="text-xs text-neutral-500 mt-xs">
                Your contact details appear at the end of every SMS you send and on PDFs you generate.
                Tenants can reply directly to you.
              </p>
            </div>
            <div className="px-xl py-lg space-y-md">

              {/* Preferred name */}
              <div>
                <label className="block text-xs font-semibold text-neutral-600 mb-xs uppercase tracking-wide">
                  Preferred name <span className="font-normal normal-case text-neutral-400">for SMS sign-off — defaults to first name</span>
                </label>
                <input
                  type="text"
                  value={preferredName}
                  onChange={e => setPreferredName(e.target.value)}
                  placeholder={firstName || 'e.g. Harry'}
                  className="w-full px-md py-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900 text-sm text-neutral-900"
                />
              </div>

              {/* Direct phone */}
              <div>
                <label className="block text-xs font-semibold text-neutral-600 mb-xs uppercase tracking-wide">
                  Direct mobile number <span className="font-normal normal-case text-neutral-400">recommended</span>
                </label>
                <input
                  type="tel"
                  value={directPhone}
                  onChange={e => setDirectPhone(e.target.value)}
                  placeholder="e.g. 07700 900 123"
                  className="w-full px-md py-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900 text-sm text-neutral-900"
                />
              </div>

              {/* Job title */}
              <div>
                <label className="block text-xs font-semibold text-neutral-600 mb-xs uppercase tracking-wide">
                  Job title <span className="font-normal normal-case text-neutral-400">optional — appears on PDFs</span>
                </label>
                <input
                  type="text"
                  value={jobTitle}
                  onChange={e => setJobTitle(e.target.value)}
                  placeholder="e.g. Director, Lettings Manager"
                  className="w-full px-md py-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900 text-sm text-neutral-900"
                />
              </div>

              {/* SMS sign-off preview */}
              <div className="rounded-xl bg-neutral-50 border border-neutral-200 p-md">
                <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">SMS sign-off preview</p>
                <div className="flex justify-end">
                  <div className="max-w-xs rounded-2xl rounded-br-sm bg-neutral-800 px-md py-sm text-sm text-white leading-relaxed">
                    …Please get in touch if you have any questions.{' '}
                    <span className="text-neutral-300">-{smsSignOff}</span>
                  </div>
                </div>
                {!directPhone.trim() && (
                  <p className="text-xs text-amber-600 mt-sm flex items-center gap-xs">
                    <span>⚠</span>
                    No mobile set — your email address will be used instead. Add a number so tenants can text back.
                  </p>
                )}
              </div>

              {/* PDF sign-off preview */}
              <div className="rounded-xl bg-neutral-50 border border-neutral-200 p-md">
                <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">PDF sign-off preview</p>
                <p className="text-xs text-neutral-400 mb-sm">Yours sincerely,</p>
                <p className="text-xs text-neutral-300 italic mb-sm">[signature]</p>
                <p className="text-sm font-bold text-neutral-900">{displayName || firstName || 'Your Name'}</p>
                {jobTitle    && <p className="text-xs text-neutral-500 mt-xs">{jobTitle}</p>}
                {directPhone && <p className="text-xs text-neutral-500">{directPhone}</p>}
              </div>

            </div>
          </section>

          {/* ── Account ── */}
          <section className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
            <div className="px-xl py-lg border-b border-neutral-100">
              <h2 className="text-sm font-semibold text-neutral-900">Account</h2>
            </div>
            <div className="px-xl py-lg space-y-md">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-xs">Email</p>
                  <p className="text-sm text-neutral-900">{email}</p>
                </div>
                <span className="inline-flex items-center rounded-full bg-neutral-100 px-sm py-xs text-xs font-semibold text-neutral-600">
                  {roleLabel[role] || role}
                </span>
              </div>
              <p className="text-xs text-neutral-400 pt-xs border-t border-neutral-100">
                To change your email or password, use the Supabase dashboard or contact an administrator.
              </p>
            </div>
          </section>

          {/* ── Push Notifications ── */}
          <section className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
            <div className="px-xl py-lg border-b border-neutral-100">
              <h2 className="text-sm font-semibold text-neutral-900">Push Notifications</h2>
              <p className="text-xs text-neutral-500 mt-xs">
                Instant alerts on this device — new tickets, messages, and more.
              </p>
            </div>
            <div className="px-xl py-lg">
              {!pushSupported ? (
                <div className="space-y-sm">
                  <p className="text-sm font-medium text-neutral-700">Not available in browser tabs</p>
                  <p className="text-xs text-neutral-500 leading-relaxed">
                    Push notifications require the app to be installed. In <strong>Safari</strong>, tap{' '}
                    <strong>Share ⬆</strong> → <strong>"Add to Home Screen"</strong>, then open from your home screen.
                  </p>
                </div>
              ) : pushStatus === 'denied' ? (
                <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-md py-sm">
                  Notifications are blocked by your browser. Go to <strong>Settings → Notifications</strong> for this site and allow them, then refresh.
                </p>
              ) : (
                <div className="flex items-center justify-between gap-md">
                  <div className="flex items-center gap-sm">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${pushStatus === 'subscribed' ? 'bg-green-500' : 'bg-neutral-300'}`} />
                    <span className="text-sm text-neutral-700">
                      {pushStatus === 'checking' ? 'Checking…' : pushStatus === 'subscribed' ? 'Enabled on this device' : 'Not enabled'}
                    </span>
                  </div>
                  {pushStatus !== 'checking' && (
                    pushStatus === 'subscribed' ? (
                      <button
                        type="button"
                        onClick={disablePush}
                        disabled={pushLoading}
                        className="text-xs text-neutral-400 hover:text-red-600 transition-colors disabled:opacity-40 underline underline-offset-2"
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
                        {pushLoading ? 'Enabling…' : 'Enable'}
                      </button>
                    )
                  )}
                </div>
              )}
              {pushMsg && (
                <p className={`text-xs rounded-lg px-md py-sm border mt-md ${pushMsg.startsWith('✅') ? 'bg-green-50 border-green-100 text-green-700' : 'bg-amber-50 border-amber-100 text-amber-700'}`}>
                  {pushMsg}
                </p>
              )}
            </div>
          </section>

          {/* ── Feedback + Save ── */}
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-lg py-md text-sm text-red-700">
              {error}
            </div>
          )}
          {saved && (
            <div className="rounded-xl border border-green-200 bg-green-50 px-lg py-md text-sm text-green-700 font-medium">
              ✅ Profile saved successfully.
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-neutral-900 py-md text-sm font-bold text-white hover:bg-neutral-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>

        </form>
      </main>
    </div>
  )
}
