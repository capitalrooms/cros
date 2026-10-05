'use client'

// Opens a one-time link CROS emailed (lib/auth/links): reset password, sign in, or accept an invite. The link only
// works when the person taps Continue — email security scanners that open links can't use it up.
import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const WORDS: Record<string, { title: string; button: string }> = {
  recovery: { title: 'Reset your password', button: 'Continue to choose a new password' },
  invite: { title: 'Welcome to Capital Rooms', button: 'Continue to your account' },
  email: { title: 'Sign in to Capital Rooms', button: 'Continue — sign me in' },
}

function Confirm() {
  const sp = useSearchParams()
  const tokenHash = sp.get('token_hash') || ''
  const type = (sp.get('type') || 'email') as 'recovery' | 'invite' | 'email'
  const next = sp.get('next') || '/'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(tokenHash ? '' : 'This link is incomplete. Ask for a new one from the login page.')
  const w = WORDS[type] ?? WORDS.email

  async function go() {
    setBusy(true); setError('')
    const { error: err } = await createClient().auth.verifyOtp({ token_hash: tokenHash, type: type as any })
    if (err) { setError('This link has expired or has already been used. Ask for a new one from the login page.'); setBusy(false); return }
    // only our own pages after sign-in
    window.location.replace(type === 'recovery' ? '/auth/reset-password' : next.startsWith('/') && !next.startsWith('//') ? next : '/')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-900 px-lg">
      <div className="w-full max-w-md rounded-3xl bg-white p-xl shadow-2xl text-center">
        <h1 className="text-2xl font-bold text-neutral-900">{w.title}</h1>
        {error ? (
          <>
            <p className="mt-md rounded-xl border border-red-200 bg-red-50 p-md text-sm text-red-700">{error}</p>
            <a href="/login" className="mt-lg block rounded-xl bg-neutral-900 py-md text-sm font-bold text-white">Go to the login page</a>
          </>
        ) : (
          <button type="button" onClick={go} disabled={busy} className="mt-lg w-full rounded-xl bg-neutral-900 py-md text-sm font-bold text-white disabled:opacity-50">{busy ? 'One moment…' : w.button}</button>
        )}
      </div>
    </div>
  )
}

export default function ConfirmPage() {
  return <Suspense fallback={<div className="min-h-screen bg-neutral-900" />}><Confirm /></Suspense>
}
