'use client'
// Two-step sign-in (12 Oct 2026; Face ID / Touch ID passkeys added 14 Oct 2026): a passkey, or the 6-digit code from an authenticator app (Google Authenticator, Microsoft
// Authenticator, 1Password, iPhone Passwords…). Anyone who has set it up must enter it after their password, after an
// emailed sign-in link, and before changing their password — the office screens refuse a sign-in without it
// (lib/adminAuth, lib/portalAuth). Set up and removed on /account.
import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

/** Signed in, has two-step set up, and hasn't entered the code yet this sign-in. */
export async function needsTwoStep(sb: SupabaseClient): Promise<boolean> {
  const { data } = await sb.auth.mfa.getAuthenticatorAssuranceLevel()
  return data?.nextLevel === 'aal2' && data?.currentLevel !== 'aal2'
}

export default function TwoStepCode({ sb, onDone, onCancel }: { sb: SupabaseClient; onDone: () => void; onCancel?: () => void }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // what this person has set up: a passkey (Face ID / Touch ID — 14 Oct 2026) and/or an authenticator app
  const [ways, setWays] = useState<{ passkey: string | null; app: string | null } | null>(null)
  const [useCode, setUseCode] = useState(false)
  useEffect(() => {
    sb.auth.mfa.listFactors().then(({ data: f }) => {
      const verified = (f?.all ?? []).filter(x => x.status === 'verified')
      setWays({ passkey: verified.find(x => x.factor_type === 'webauthn')?.id ?? null, app: verified.find(x => x.factor_type === 'totp')?.id ?? null })
    })
  }, [sb])

  async function withPasskey() {
    if (!ways?.passkey) return
    setBusy(true); setError('')
    const { error: err } = await sb.auth.mfa.webauthn.authenticate({ factorId: ways.passkey, webauthn: {} } as never)
    setBusy(false)
    if (err) { setError(/cancel|NotAllowed|abort/i.test(err.message) ? 'Cancelled — tap the button to try again.' : 'That didn’t work on this device. Try again, or use your code if you set one up.'); return }
    onDone()
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    const factorId = ways?.app
    if (!factorId) { setBusy(false); onDone(); return }
    const { error: err } = await sb.auth.mfa.challengeAndVerify({ factorId, code: code.replace(/\s/g, '') })
    setBusy(false)
    if (err) { setError('That code didn’t work. Codes change every 30 seconds — try the one showing now.'); setCode(''); return }
    onDone()
  }

  if (!ways) return <p className="text-sm text-neutral-500">One moment…</p>

  if (ways.passkey && !useCode) return (
    <div className="space-y-md text-left">
      <div>
        <p className="text-base font-bold text-neutral-900">Confirm it’s you</p>
        <p className="mt-xs text-sm text-neutral-600">Use Face ID, Touch ID or your device’s screen lock.</p>
      </div>
      {error && <p className="rounded-xl border border-red-200 bg-red-50 p-sm text-sm text-red-700">{error}</p>}
      <button type="button" onClick={withPasskey} disabled={busy} autoFocus
        className="w-full rounded-xl bg-neutral-900 py-sm text-sm font-bold text-white disabled:opacity-40">{busy ? 'Follow the prompt…' : 'Use Face ID / Touch ID'}</button>
      {ways.app && <button type="button" onClick={() => { setUseCode(true); setError('') }} className="w-full text-xs text-neutral-600 underline">Use a code from my authenticator app instead</button>}
      {onCancel && <button type="button" onClick={onCancel} className="w-full text-xs text-neutral-500 underline">Sign out</button>}
      <p className="text-xs text-neutral-500">New phone or computer? Sign in on a device you’ve already set up, or ask the office to reset two-step sign-in.</p>
    </div>
  )

  return (
    <form onSubmit={verify} className="space-y-md text-left">
      <div>
        <p className="text-base font-bold text-neutral-900">Enter your sign-in code</p>
        <p className="mt-xs text-sm text-neutral-600">Open your authenticator app and type the 6-digit code for Capital Rooms.</p>
      </div>
      <input value={code} onChange={e => setCode(e.target.value.replace(/[^\d\s]/g, '').slice(0, 7))} inputMode="numeric" autoComplete="one-time-code"
        autoFocus placeholder="123 456" aria-label="6-digit code"
        className="w-full rounded-xl border border-neutral-300 bg-white px-md py-sm text-center text-2xl tracking-[0.3em] tabular-nums text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900" />
      {error && <p className="rounded-xl border border-red-200 bg-red-50 p-sm text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={busy || code.replace(/\s/g, '').length !== 6}
        className="w-full rounded-xl bg-neutral-900 py-sm text-sm font-bold text-white disabled:opacity-40">{busy ? 'Checking…' : 'Continue'}</button>
      {ways.passkey && <button type="button" onClick={() => { setUseCode(false); setError('') }} className="w-full text-xs text-neutral-600 underline">Use Face ID / Touch ID instead</button>}
      {onCancel && <button type="button" onClick={onCancel} className="w-full text-xs text-neutral-500 underline">Sign out</button>}
      <p className="text-xs text-neutral-500">Lost your phone? Ask the office to remove two-step sign-in from your account.</p>
    </form>
  )
}
