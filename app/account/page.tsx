'use client'
// My account — for everyone who signs in (office, lettings, tenants, landlords, contractors, cleaners). 12 Oct 2026.
// Change password, two-step sign-in (authenticator app), sign out. Nobody can look a password up — not the office, not
// Supabase — so the page offers to let the browser/phone save it instead. ?setup=1 = arrived from an invite email.
import BackButton from '@/app/components/BackButton'
import AppBar from '@/components/AppBar'
import { use, useEffect, useState } from 'react'
import { REQUIRE_TWO_STEP_FOR_ADMINS } from '@/lib/access/areas'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { one, type PageSearchParams } from '@/lib/pageSearchParams'
import TwoStepCode, { needsTwoStep } from '@/components/TwoStepCode'

const HOME: Record<string, string> = { administrator: '/admin', admin: '/admin', lettings: typeof window !== 'undefined' && window.innerWidth >= 768 ? '/admin' : '/lettings', tenant: '/tenant', landlord: '/landlord', contractor: '/contractor', cleaner: '/cleaner', agent: '/agent' }
const ROLE: Record<string, string> = { administrator: 'Administrator', admin: 'Administrator', lettings: 'Lettings', tenant: 'Tenant', landlord: 'Landlord', contractor: 'Contractor', cleaner: 'Cleaner', agent: 'Agent' }
const STAFF = ['administrator', 'admin', 'lettings']

export default function AccountPage({ searchParams }: { searchParams: PageSearchParams }) {
  const setupParam = one(use(searchParams).setup)
  const setup = setupParam === '1'
  const [sb] = useState(() => createClient())
  const [state, setState] = useState<'loading' | 'code' | 'ready'>('loading')
  const [me, setMe] = useState<{ email: string; name: string; role: string } | null>(null)
  const [twoStep, setTwoStep] = useState<Factor[]>([])

  async function load() {
    const { data: { user } } = await sb.auth.getUser()
    if (!user?.email) { window.location.replace('/login'); return }
    if (await needsTwoStep(sb)) { setState('code'); return }
    const { data: p } = await sb.from('people').select('salutation, first_name, last_name, role').ilike('email', user.email).order('created_at').limit(1).maybeSingle()
    setMe({ email: user.email, name: [p?.salutation, p?.first_name, p?.last_name].filter(Boolean).join(' '), role: p?.role ?? '' })
    const { data: f } = await sb.auth.mfa.listFactors()
    setTwoStep(((f?.all ?? []) as Factor[]).filter(x => x.status === 'verified'))
    setState('ready')
  }
  useEffect(() => { load() }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  async function signOut() { await sb.auth.signOut().catch(() => null); window.location.replace('/login') }

  const card = 'rounded-2xl border border-neutral-200 bg-white p-lg'
  return (
    <div className="min-h-screen bg-neutral-100">
      {/* the one top bar every user has (21 Oct 2026 — this page had its own white header) */}
      <AppBar left={<BackButton href={(me && HOME[me.role]) || '/home'} />} />
      <main className="mx-auto max-w-xl space-y-md px-lg py-xl">
        {state === 'loading' && <p className="text-sm text-neutral-500">Loading…</p>}
        {state === 'code' && <div className={card}><TwoStepCode sb={sb} onDone={() => { setState('loading'); load() }} onCancel={signOut} /></div>}
        {state === 'ready' && me && (
          <>
            <div>
              <h1 className="text-2xl font-bold text-neutral-900">My account</h1>
              <p className="mt-xs text-sm text-neutral-600">{me.name ? `${me.name} · ` : ''}{me.email}{ROLE[me.role] ? ` · ${ROLE[me.role]}` : ''}</p>
            </div>
            {setup && <p className="rounded-2xl border border-green-200 bg-green-50 p-md text-sm text-green-900">Welcome to Capital Rooms. Choose your password below to finish setting up your account.</p>}
            <PasswordCard sb={sb} email={me.email} setup={setup} home={HOME[me.role]} />
            {!twoStep.length && setupParam === 'two-step' && (
              <p className="rounded-2xl border border-amber-300 bg-amber-50 p-md text-sm text-amber-900"><strong>Set up two-step sign-in to carry on.</strong> Administrator accounts can see everything in CROS, so they need Face ID (or a code) as well as your password. It takes a few seconds: press “Use Face ID” (or Touch ID) below and follow the prompt.</p>
            )}
            <TwoStepCard sb={sb} factors={twoStep} staff={STAFF.includes(me.role)} required={REQUIRE_TWO_STEP_FOR_ADMINS && ['administrator', 'admin'].includes(me.role)} onChange={load} />
            <section className={card}>
              <h2 className="text-base font-bold text-neutral-900">Sign out</h2>
              <p className="mt-xs text-sm text-neutral-600">Signs you out on this device.</p>
              <button type="button" onClick={signOut} className="mt-md rounded-xl border border-neutral-300 px-md py-sm text-sm font-semibold text-neutral-800 hover:bg-neutral-50">Sign out</button>
            </section>
          </>
        )}
      </main>
    </div>
  )
}

function PasswordCard({ sb, email, setup, home }: { sb: ReturnType<typeof createClient>; email: string; setup: boolean; home?: string }) {
  const [pw, setPw] = useState(''), [pw2, setPw2] = useState(''), [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false)
  async function save(e: React.FormEvent) {
    e.preventDefault(); setError('')
    if (pw.length < 10) { setError('Use at least 10 characters. A few words strung together is easiest to remember.'); return }
    if (pw !== pw2) { setError('The two passwords don’t match.'); return }
    setBusy(true)
    const { error: err } = await sb.auth.updateUser({ password: pw })
    setBusy(false)
    if (err) { setError(/weak|pwned|leak/i.test(err.message) ? 'That password has appeared in a data leak elsewhere — please choose a different one.' : err.message); return }
    setSaved(true); setPw(''); setPw2('')
  }
  const inp = 'mt-xs w-full rounded-xl border border-neutral-300 bg-white px-md py-sm text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900'
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-lg">
      <h2 className="text-base font-bold text-neutral-900">{setup ? 'Choose your password' : 'Change password'}</h2>
      <p className="mt-xs text-sm text-neutral-600">Nobody can look your password up — not even the office. When your browser or phone offers to save it, say yes: it fills it in for you next time, and you can see it in your saved passwords (on iPhone: Settings › Passwords).</p>
      {saved ? (
        <div className="mt-md space-y-sm">
          <p className="rounded-xl border border-green-200 bg-green-50 p-sm text-sm text-green-900">Password saved. Use it next time you sign in.</p>
          {setup && home && <Link href={home} className="inline-block rounded-xl bg-neutral-900 px-md py-sm text-sm font-bold text-white">Go to the app →</Link>}
        </div>
      ) : (
        <form onSubmit={save} className="mt-md space-y-sm">
          {/* the email in the form lets password managers save it under the right account */}
          <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
          <label className="block text-xs font-semibold text-neutral-600">New password
            <input type={show ? 'text' : 'password'} name="new-password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} className={inp} required />
          </label>
          <label className="block text-xs font-semibold text-neutral-600">Type it again
            <input type={show ? 'text' : 'password'} name="confirm-password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} className={inp} required />
          </label>
          <label className="flex items-center gap-xs text-xs text-neutral-600"><input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} /> Show what I’m typing</label>
          {error && <p className="rounded-xl border border-red-200 bg-red-50 p-sm text-sm text-red-700">{error}</p>}
          <button type="submit" disabled={busy} className="rounded-xl bg-neutral-900 px-md py-sm text-sm font-bold text-white disabled:opacity-40">{busy ? 'Saving…' : 'Save password'}</button>
        </form>
      )}
    </section>
  )
}

type Factor = { id: string; factor_type: string; friendly_name?: string | null; status: string }
/** A rough name for this device, so a list of passkeys makes sense ("Face ID — iPhone"). */
function deviceName() {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
  const d = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Macintosh/.test(ua) ? 'Mac' : /Android/.test(ua) ? 'Android phone' : /Windows/.test(ua) ? 'Windows PC' : 'this device'
  const how = /iPhone|iPad/.test(ua) ? 'Face ID' : /Macintosh/.test(ua) ? 'Touch ID' : /Windows/.test(ua) ? 'Windows Hello' : 'Fingerprint or face'
  return `${how} — ${d}`
}
const passkeysWork = () => typeof window !== 'undefined' && !!window.PublicKeyCredential

// Two-step sign-in (14 Oct 2026, Harry: "I hate this authenticator stuff — can't you do Face ID"): a passkey —
// Face ID / Touch ID / Windows Hello on this device — is the main way; an authenticator app is the backup.
// Either counts as two-step everywhere (the session becomes "aal2"). Administrators can't remove their last one.
function TwoStepCard({ sb, factors, staff, required = false, onChange }: { sb: ReturnType<typeof createClient>; factors: Factor[]; staff: boolean; required?: boolean; onChange: () => void }) {
  const [enrol, setEnrol] = useState<{ id: string; qr: string; secret: string } | null>(null)
  const [code, setCode] = useState(''), [busy, setBusy] = useState(''), [error, setError] = useState('')
  const on = factors.length > 0
  const hasApp = factors.some(f => f.factor_type === 'totp')

  async function clearUnfinished() {
    const { data: f } = await sb.auth.mfa.listFactors()
    for (const x of f?.all ?? []) if (x.status !== 'verified') await sb.auth.mfa.unenroll({ factorId: x.id }).catch(() => null)
  }
  async function addPasskey() {
    setBusy('passkey'); setError('')
    try {
      await clearUnfinished()
      const { error: err } = await sb.auth.mfa.webauthn.register({ friendlyName: `${deviceName()} · ${new Date().toISOString().slice(0, 10)}`, webauthn: {} } as never)
      if (err) {
        setError(/disabled|not enabled|unsupported factor/i.test(err.message)
          ? 'Face ID sign-in needs switching on in Supabase first (Authentication › Multi-Factor › WebAuthn). Use the authenticator app for now, or ask Claude.'
          : /cancel|NotAllowed|abort/i.test(err.message) ? 'Cancelled — try again when you’re ready.' : err.message)
        return
      }
      onChange()
    } finally { setBusy('') }
  }
  async function start() {
    setBusy('app'); setError('')
    await clearUnfinished()
    const { data, error: err } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Authenticator app ${new Date().toISOString().slice(0, 10)}` })
    setBusy('')
    if (err || !data) { setError(err?.message || 'Could not start set-up'); return }
    setEnrol({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
  }
  async function finishSetup(e: React.FormEvent) {
    e.preventDefault(); if (!enrol) return
    setBusy('app'); setError('')
    const { error: err } = await sb.auth.mfa.challengeAndVerify({ factorId: enrol.id, code: code.replace(/\s/g, '') })
    setBusy('')
    if (err) { setError('That code didn’t work — try the one showing now.'); setCode(''); return }
    setEnrol(null); setCode(''); onChange()
  }
  async function remove(f: Factor) {
    if (required && factors.length <= 1) { setError('Administrator accounts must keep at least one way of doing two-step sign-in. Add another first, then remove this one.'); return }
    if (!window.confirm(`Remove “${f.friendly_name || (f.factor_type === 'totp' ? 'Authenticator app' : 'Passkey')}”?`)) return
    setBusy('remove'); setError('')
    const { error: err } = await sb.auth.mfa.unenroll({ factorId: f.id })
    setBusy('')
    if (err) { setError(err.message); return }
    onChange()
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-lg">
      <div className="flex items-start justify-between gap-md">
        <div>
          <h2 className="text-base font-bold text-neutral-900">Two-step sign-in</h2>
          <p className="mt-xs text-sm text-neutral-600">After your password, your phone or computer checks it’s really you — with <strong>Face ID</strong>, <strong>Touch ID</strong> or Windows Hello. A stolen password alone can’t get in.{staff && !required ? ' Strongly recommended for office accounts.' : ''}</p>
        </div>
        <span className={`shrink-0 rounded-full px-sm py-0.5 text-xs font-semibold ${on ? 'bg-green-100 text-green-800' : 'bg-neutral-100 text-neutral-600'}`}>{on ? 'On' : 'Off'}</span>
      </div>
      {error && <p className="mt-md rounded-xl border border-red-200 bg-red-50 p-sm text-sm text-red-700">{error}</p>}

      {on && (
        <ul className="mt-md divide-y divide-neutral-100 rounded-xl border border-neutral-200">
          {factors.map(f => (
            <li key={f.id} className="flex items-center justify-between gap-sm px-md py-sm text-sm">
              <span className="text-neutral-800">{f.factor_type === 'webauthn' ? '🔐 ' : '🔢 '}{f.friendly_name || (f.factor_type === 'totp' ? 'Authenticator app' : 'Passkey')}</span>
              <button type="button" onClick={() => remove(f)} disabled={!!busy} className="text-xs font-semibold text-neutral-500 underline hover:text-neutral-800 disabled:opacity-40">Remove</button>
            </li>
          ))}
        </ul>
      )}

      {enrol ? (
        <form onSubmit={finishSetup} className="mt-md space-y-sm">
          <p className="text-sm text-neutral-700"><strong>1.</strong> On your phone, open an authenticator app (Google Authenticator, Microsoft Authenticator, or iPhone’s Passwords app) and scan this code:</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enrol.qr} alt="Set-up code to scan" className="h-44 w-44 rounded-xl border border-neutral-200 bg-white p-xs" />
          <p className="text-xs text-neutral-500">Can’t scan? Enter this key instead: <span className="select-all break-all font-mono text-neutral-800">{enrol.secret}</span></p>
          <p className="text-sm text-neutral-700"><strong>2.</strong> Type the 6-digit code it shows:</p>
          <input value={code} onChange={e => setCode(e.target.value.replace(/[^\d\s]/g, '').slice(0, 7))} inputMode="numeric" autoComplete="one-time-code" placeholder="123 456" aria-label="6-digit code"
            className="w-48 rounded-xl border border-neutral-300 bg-white px-md py-sm text-center text-xl tracking-[0.3em] tabular-nums text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900" />
          <div className="flex gap-sm">
            <button type="submit" disabled={!!busy || code.replace(/\s/g, '').length !== 6} className="rounded-xl bg-neutral-900 px-md py-sm text-sm font-bold text-white disabled:opacity-40">{busy ? 'Checking…' : 'Turn on'}</button>
            <button type="button" onClick={() => { setEnrol(null); setCode('') }} className="rounded-xl px-md py-sm text-sm text-neutral-600 hover:bg-neutral-100">Cancel</button>
          </div>
        </form>
      ) : (
        <div className="mt-md flex flex-col gap-sm sm:flex-row sm:items-center">
          {passkeysWork() && (
            <button type="button" onClick={addPasskey} disabled={!!busy} className="rounded-xl bg-neutral-900 px-md py-sm text-sm font-bold text-white disabled:opacity-40">
              {busy === 'passkey' ? 'Follow the prompt on your screen…' : on ? `Add ${deviceName().split(' — ')[0]} on this device` : `Use ${deviceName().split(' — ')[0]}`}
            </button>
          )}
          {!hasApp && (
            <button type="button" onClick={start} disabled={!!busy} className="rounded-xl px-md py-sm text-sm font-semibold text-neutral-700 underline hover:text-neutral-900 disabled:opacity-40">
              {busy === 'app' ? 'One moment…' : on ? 'Add an authenticator app as a backup' : 'Use an authenticator app instead'}
            </button>
          )}
        </div>
      )}
      {on && <p className="mt-sm text-xs text-neutral-500">Set it up on each phone or computer you use. iPhones and Macs on the same Apple account share it. Lost your phone? {required ? 'It can be reset in Supabase (Authentication › Users).' : 'Ask the office to reset it.'}</p>}
    </section>
  )
}
