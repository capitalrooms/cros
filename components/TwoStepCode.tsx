'use client'
// Two-step sign-in (12 Oct 2026): the 6-digit code from an authenticator app (Google Authenticator, Microsoft
// Authenticator, 1Password, iPhone Passwords…). Anyone who has set it up must enter it after their password, after an
// emailed sign-in link, and before changing their password — the office screens refuse a sign-in without it
// (lib/adminAuth, lib/portalAuth). Set up and removed on /account.
import { useState } from 'react'
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

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    const { data: f } = await sb.auth.mfa.listFactors()
    const factor = f?.totp?.find(x => x.status === 'verified')
    if (!factor) { setBusy(false); onDone(); return }
    const { error: err } = await sb.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.replace(/\s/g, '') })
    setBusy(false)
    if (err) { setError('That code didn’t work. Codes change every 30 seconds — try the one showing now.'); setCode(''); return }
    onDone()
  }

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
      {onCancel && <button type="button" onClick={onCancel} className="w-full text-xs text-neutral-500 underline">Sign out</button>}
      <p className="text-xs text-neutral-500">Lost your phone? Ask the office to remove two-step sign-in from your account.</p>
    </form>
  )
}
