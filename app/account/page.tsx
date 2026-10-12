'use client'
// My account — for everyone who signs in (office, lettings, tenants, landlords, contractors, cleaners). 12 Oct 2026.
// Change password, two-step sign-in (authenticator app), sign out. Nobody can look a password up — not the office, not
// Supabase — so the page offers to let the browser/phone save it instead. ?setup=1 = arrived from an invite email.
import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { one, type PageSearchParams } from '@/lib/pageSearchParams'
import TwoStepCode, { needsTwoStep } from '@/components/TwoStepCode'
import Logo from '@/components/Logo'

const HOME: Record<string, string> = { administrator: '/admin', admin: '/admin', lettings: '/lettings', tenant: '/tenant', landlord: '/landlord', contractor: '/contractor', cleaner: '/cleaner', agent: '/agent' }
const ROLE: Record<string, string> = { administrator: 'Administrator', admin: 'Administrator', lettings: 'Lettings', tenant: 'Tenant', landlord: 'Landlord', contractor: 'Contractor', cleaner: 'Cleaner', agent: 'Agent' }
const STAFF = ['administrator', 'admin', 'lettings']

export default function AccountPage({ searchParams }: { searchParams: PageSearchParams }) {
  const setup = one(use(searchParams).setup) === '1'
  const [sb] = useState(() => createClient())
  const [state, setState] = useState<'loading' | 'code' | 'ready'>('loading')
  const [me, setMe] = useState<{ email: string; name: string; role: string } | null>(null)
  const [twoStep, setTwoStep] = useState<{ id: string } | null>(null)

  async function load() {
    const { data: { user } } = await sb.auth.getUser()
    if (!user?.email) { window.location.replace('/login'); return }
    if (await needsTwoStep(sb)) { setState('code'); return }
    const { data: p } = await sb.from('people').select('first_name, last_name, role').ilike('email', user.email).order('created_at').limit(1).maybeSingle()
    setMe({ email: user.email, name: [p?.first_name, p?.last_name].filter(Boolean).join(' '), role: p?.role ?? '' })
    const { data: f } = await sb.auth.mfa.listFactors()
    setTwoStep(f?.totp?.find(x => x.status === 'verified') ?? null)
    setState('ready')
  }
  useEffect(() => { load() }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  async function signOut() { await sb.auth.signOut().catch(() => null); window.location.replace('/login') }

  const card = 'rounded-2xl border border-neutral-200 bg-white p-lg'
  return (
    <div className="min-h-screen bg-neutral-100">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-lg py-md">
        <Logo />
        {me && HOME[me.role] && <Link href={HOME[me.role]} className="text-sm font-semibold text-neutral-700 hover:text-neutral-900">Back to the app →</Link>}
      </header>
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
            <TwoStepCard sb={sb} factor={twoStep} staff={STAFF.includes(me.role)} onChange={load} />
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

function TwoStepCard({ sb, factor, staff, onChange }: { sb: ReturnType<typeof createClient>; factor: { id: string } | null; staff: boolean; onChange: () => void }) {
  const [enrol, setEnrol] = useState<{ id: string; qr: string; secret: string } | null>(null)
  const [code, setCode] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')

  async function start() {
    setBusy(true); setError('')
    // a half-finished set-up from before would block a new one
    const { data: f } = await sb.auth.mfa.listFactors()
    for (const x of f?.all ?? []) if (x.status !== 'verified') await sb.auth.mfa.unenroll({ factorId: x.id }).catch(() => null)
    const { data, error: err } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Capital Rooms ${new Date().toISOString().slice(0, 10)}` })
    setBusy(false)
    if (err || !data) { setError(err?.message || 'Could not start set-up'); return }
    setEnrol({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
  }
  async function finishSetup(e: React.FormEvent) {
    e.preventDefault(); if (!enrol) return
    setBusy(true); setError('')
    const { error: err } = await sb.auth.mfa.challengeAndVerify({ factorId: enrol.id, code: code.replace(/\s/g, '') })
    setBusy(false)
    if (err) { setError('That code didn’t work — try the one showing now.'); setCode(''); return }
    setEnrol(null); setCode(''); onChange()
  }
  async function remove() {
    if (!factor || !window.confirm('Turn off two-step sign-in? You’ll sign in with your password alone.')) return
    setBusy(true); setError('')
    const { error: err } = await sb.auth.mfa.unenroll({ factorId: factor.id })
    setBusy(false)
    if (err) { setError(err.message); return }
    onChange()
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-lg">
      <div className="flex items-start justify-between gap-md">
        <div>
          <h2 className="text-base font-bold text-neutral-900">Two-step sign-in</h2>
          <p className="mt-xs text-sm text-neutral-600">After your password, you also type a 6-digit code from an app on your phone — so a stolen password alone can’t get in.{staff ? ' Strongly recommended for office accounts.' : ''}</p>
        </div>
        <span className={`shrink-0 rounded-full px-sm py-0.5 text-xs font-semibold ${factor ? 'bg-green-100 text-green-800' : 'bg-neutral-100 text-neutral-600'}`}>{factor ? 'On' : 'Off'}</span>
      </div>
      {error && <p className="mt-md rounded-xl border border-red-200 bg-red-50 p-sm text-sm text-red-700">{error}</p>}
      {factor ? (
        <button type="button" onClick={remove} disabled={busy} className="mt-md rounded-xl border border-neutral-300 px-md py-sm text-sm font-semibold text-neutral-800 hover:bg-neutral-50 disabled:opacity-40">Turn off</button>
      ) : enrol ? (
        <form onSubmit={finishSetup} className="mt-md space-y-sm">
          <p className="text-sm text-neutral-700"><strong>1.</strong> On your phone, open an authenticator app (Google Authenticator, Microsoft Authenticator, or iPhone’s Passwords app) and scan this code:</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enrol.qr} alt="Set-up code to scan" className="h-44 w-44 rounded-xl border border-neutral-200 bg-white p-xs" />
          <p className="text-xs text-neutral-500">Can’t scan? Enter this key instead: <span className="select-all break-all font-mono text-neutral-800">{enrol.secret}</span></p>
          <p className="text-sm text-neutral-700"><strong>2.</strong> Type the 6-digit code it shows:</p>
          <input value={code} onChange={e => setCode(e.target.value.replace(/[^\d\s]/g, '').slice(0, 7))} inputMode="numeric" autoComplete="one-time-code" placeholder="123 456" aria-label="6-digit code"
            className="w-48 rounded-xl border border-neutral-300 bg-white px-md py-sm text-center text-xl tracking-[0.3em] tabular-nums text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900" />
          <div className="flex gap-sm">
            <button type="submit" disabled={busy || code.replace(/\s/g, '').length !== 6} className="rounded-xl bg-neutral-900 px-md py-sm text-sm font-bold text-white disabled:opacity-40">{busy ? 'Checking…' : 'Turn on'}</button>
            <button type="button" onClick={() => { setEnrol(null); setCode('') }} className="rounded-xl px-md py-sm text-sm text-neutral-600 hover:bg-neutral-100">Cancel</button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={start} disabled={busy} className="mt-md rounded-xl bg-neutral-900 px-md py-sm text-sm font-bold text-white disabled:opacity-40">{busy ? 'One moment…' : 'Set up two-step sign-in'}</button>
      )}
    </section>
  )
}
