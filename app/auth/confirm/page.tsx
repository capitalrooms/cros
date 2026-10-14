'use client'

// Opens a one-time link CROS emailed (lib/auth/links): reset password, sign in, or accept an invite. The link only
// works when the person taps Continue — email security scanners that open links can't use it up. Someone with
// two-step sign-in then enters their code (components/TwoStepCode) before going on.
import { use, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { one, type PageSearchParams } from '@/lib/pageSearchParams'
import TwoStepCode, { needsTwoStep } from '@/components/TwoStepCode'

const WORDS: Record<string, { title: string; button: string }> = {
  recovery: { title: 'Reset your password', button: 'Continue to choose a new password' },
  invite: { title: 'Welcome to Capital Rooms', button: 'Continue to your account' },
  email: { title: 'Sign in to Capital Rooms', button: 'Continue — sign me in' },
}

export default function ConfirmPage({ searchParams }: { searchParams: PageSearchParams }) {
  const sp = use(searchParams)
  const tokenHash = one(sp.token_hash) || ''
  const type = (one(sp.type) || 'email') as 'recovery' | 'invite' | 'email'
  const next = one(sp.next) || '/'
  const [sb] = useState(() => createClient())
  const [busy, setBusy] = useState(false)
  const [code, setCode] = useState(false)
  const [error, setError] = useState(tokenHash ? '' : 'This link is incomplete. Ask for a new one from the login page.')
  const w = WORDS[type] ?? WORDS.email
  // only our own pages after sign-in
  const dest = type === 'recovery' ? '/auth/reset-password' : next.startsWith('/') && !next.startsWith('//') ? next : '/'

  async function go() {
    setBusy(true); setError('')
    const { error: err } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: type as any })
    if (err) { setError('This link has expired or has already been used. Ask for a new one from the login page.'); setBusy(false); return }
    // new-device sign-in alert (app/api/auth/sign-in-alert) — not for a password reset (that link is the owner fixing it)
    if (type !== 'recovery') { const { data: s } = await sb.auth.getSession(); if (s.session) fetch('/api/auth/sign-in-alert', { method: 'POST', keepalive: true, headers: { Authorization: `Bearer ${s.session.access_token}` } }).catch(() => {}) }
    if (await needsTwoStep(sb)) { setCode(true); setBusy(false); return }
    window.location.replace(dest)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-900 px-lg">
      <div className="w-full max-w-md rounded-3xl bg-white p-xl shadow-2xl text-center">
        {code ? (
          <TwoStepCode sb={sb} onDone={() => window.location.replace(dest)} onCancel={async () => { await sb.auth.signOut().catch(() => null); window.location.replace('/login') }} />
        ) : (
          <>
            <h1 className="text-2xl font-bold text-neutral-900">{w.title}</h1>
            {error ? (
              <>
                <p className="mt-md rounded-xl border border-red-200 bg-red-50 p-md text-sm text-red-700">{error}</p>
                <a href="/login" className="mt-lg block rounded-xl bg-neutral-900 py-md text-sm font-bold text-white">Go to the login page</a>
              </>
            ) : (
              <button type="button" onClick={go} disabled={busy} className="mt-lg w-full rounded-xl bg-neutral-900 py-md text-sm font-bold text-white disabled:opacity-50">{busy ? 'One moment…' : w.button}</button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
