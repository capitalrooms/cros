'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { signIn } from '@/lib/auth'
import { authenticateWithPasskey, isPasskeySupported } from '@/lib/webauthn'
import { createClient } from '@/lib/supabase'
import Logo from '@/components/Logo'

// Inner component that reads search params (requires Suspense wrapper)
function LoginForm() {
  const router        = useRouter()
  const searchParams  = useSearchParams()

  const [email, setEmail]             = useState('')
  const [password, setPassword]       = useState('')
  const [error, setError]             = useState('')
  const [loading, setLoading]         = useState(false)
  const [passkeySupported, setPasskeySupported] = useState(false)
  const [passkeyLoading, setPasskeyLoading]     = useState(false)

  // Magic-link mode — shown when email pre-filled from URL
  const [magicMode, setMagicMode]     = useState(false)
  const [magicSent, setMagicSent]     = useState(false)
  const [magicLoading, setMagicLoading] = useState(false)
  const [prefilled, setPrefilled]     = useState(false)

  // Forgot password
  const [showForgot, setShowForgot]   = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotMsg, setForgotMsg]     = useState('')

  useEffect(() => {
    isPasskeySupported().then(setPasskeySupported).catch(() => setPasskeySupported(false))

    // Pre-fill from ?email= or ?phone= query param
    const qEmail = searchParams.get('email')
    const qPhone = searchParams.get('phone')

    if (qEmail) {
      setEmail(qEmail)
      setForgotEmail(qEmail)
      setPrefilled(true)
      setMagicMode(true)   // offer magic link when arriving from an email/SMS
    } else if (qPhone) {
      // Look up email from phone number
      fetch(`/api/lookup-email?phone=${encodeURIComponent(qPhone)}`)
        .then(r => r.json())
        .then(({ email: found }) => {
          if (found) {
            setEmail(found)
            setForgotEmail(found)
            setPrefilled(true)
            setMagicMode(true)
          }
        })
        .catch(() => {})
    }
  }, [searchParams])

  // ── Sign in with email + password ────────────────────────────────────────
  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await signIn(email, password)
      if (!result.success) {
        setError(
          result.error === 'not_recognized'
            ? result.message
            : 'Invalid email or password. Please try again.'
        )
        setLoading(false)
        return
      }
      const role = result.assignment?.role
      const path = { administrator: '/admin', admin: '/admin', tenant: '/tenant',
        contractor: '/contractor', cleaner: '/cleaner', landlord: '/landlord',
        lettings: '/lettings', agent: '/agent' }[role ?? ''] ?? '/tenant'

      router.push(path)
      setTimeout(() => { if (typeof window !== 'undefined') window.location.href = path }, 1000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.')
      setLoading(false)
    }
  }

  // ── Send magic sign-in link ───────────────────────────────────────────────
  async function handleMagicLink() {
    if (!email) return
    setMagicLoading(true)
    setError('')
    const supabase = createClient()
    const appUrl   = process.env.NEXT_PUBLIC_APP_URL || window.location.origin
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${appUrl}/tenant` },
    })
    setMagicLoading(false)
    if (err) {
      setError('Could not send sign-in link. Please try again or use your password.')
    } else {
      setMagicSent(true)
    }
  }

  // ── Passkey ───────────────────────────────────────────────────────────────
  async function handlePasskeyLogin() {
    setError('')
    setPasskeyLoading(true)
    try {
      const result = await authenticateWithPasskey()
      if (result.success && result.user) {
        const path = { administrator: '/admin', admin: '/admin', tenant: '/tenant',
          contractor: '/contractor', cleaner: '/cleaner', landlord: '/landlord',
          lettings: '/lettings', agent: '/agent' }[result.user.role] ?? '/tenant'
        router.push(path)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Passkey authentication failed.')
    } finally {
      setPasskeyLoading(false)
    }
  }

  // ── Forgot password ───────────────────────────────────────────────────────
  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault()
    setForgotMsg('')
    setForgotLoading(true)
    try {
      const res  = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail }),
      })
      const data = await res.json()
      if (data?.resetLink?.startsWith('http')) {
        setForgotMsg(data.resetLink)
      } else {
        setForgotMsg(data.message || 'Check your email for the reset link.')
      }
      setForgotEmail('')
    } catch {
      setForgotMsg('An error occurred. Please try again.')
    } finally {
      setForgotLoading(false)
    }
  }

  const inp  = 'cr-input w-full bg-transparent border-0 border-b border-white/15 pb-3 pt-1 text-white text-base placeholder:text-white/25 focus:outline-none focus:border-white/70 transition-colors'
  const lbl  = 'block text-[11px] uppercase tracking-[0.18em] text-white/40 mb-2'
  const btn  = 'w-full rounded-full border border-white/25 py-3.5 text-sm font-medium tracking-wide text-white hover:bg-white hover:text-neutral-950 disabled:opacity-40 transition-colors'
  const btnGold = 'w-full rounded-full py-3.5 text-sm font-semibold tracking-wide text-white disabled:opacity-40 transition-colors'

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-black px-lg">
      <div className="relative w-full max-w-sm">

        {/* Logo */}
        <div className="text-center" style={{ marginBottom: '4.5rem' }}>
          <div className="cr-rise inline-flex items-center justify-center">
            <Logo variant="emblem" height={52} invert priority />
          </div>
          <div className="cr-fade-up mt-xl flex justify-center" style={{ animationDelay: '1000ms' }}>
            <Logo variant="wordmark" height={40} invert />
          </div>
        </div>

        <div className="cr-fade-up" style={{ animationDelay: '1150ms' }}>

          {/* ── Forgot password view ── */}
          {showForgot ? (
            <>
              <p className="mb-2xl text-center text-sm text-white/50">
                Enter your email and we&apos;ll send you a link to sign in.
              </p>
              {forgotMsg && (
                <div className="mb-xl text-sm">
                  {forgotMsg.startsWith('http') ? (
                    <div className="text-white/80">
                      <p className="mb-md">Your sign-in link is ready:</p>
                      <a href={forgotMsg} target="_blank" rel="noopener noreferrer"
                        className="block break-all font-mono text-xs text-white/70 underline hover:text-white">
                        {forgotMsg}
                      </a>
                    </div>
                  ) : (
                    <p className="text-center text-white/60">{forgotMsg}</p>
                  )}
                </div>
              )}
              <form onSubmit={handleForgotPassword} className="space-y-2xl">
                <div>
                  <label className={lbl}>Email</label>
                  <input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)}
                    placeholder="you@example.com" autoComplete="email" className={inp} required />
                </div>
                <button type="submit" disabled={forgotLoading} className={btn}>
                  {forgotLoading ? 'Sending…' : 'Send sign-in link'}
                </button>
              </form>
              <div className="mt-xl text-center">
                <button onClick={() => setShowForgot(false)}
                  className="text-xs tracking-wide text-white/40 hover:text-white/90 transition-colors">
                  Back to sign in
                </button>
              </div>
            </>

          /* ── Magic link sent confirmation ── */
          ) : magicSent ? (
            <div className="text-center space-y-lg">
              <p className="text-4xl">✉️</p>
              <p className="text-white font-semibold">Check your email</p>
              <p className="text-sm text-white/50 leading-relaxed">
                We&apos;ve sent a sign-in link to<br />
                <span className="text-white/80">{email}</span>
              </p>
              <p className="text-xs text-white/30 leading-relaxed">
                Tap the link in that email and you&apos;ll be signed in automatically.
                No password needed.
              </p>
              <button onClick={() => setMagicSent(false)}
                className="text-xs tracking-wide text-white/40 hover:text-white/70 transition-colors">
                Try a different method
              </button>
            </div>

          /* ── Main sign-in view ── */
          ) : (
            <>
              {error && <p className="mb-lg text-center text-sm text-red-400/90">{error}</p>}

              {/* Magic link fast-path — shown when arriving from email/SMS */}
              {magicMode && prefilled && (
                <div className="mb-2xl">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-white/40 mb-sm">
                    Signing in as
                  </p>
                  <p className="text-white text-sm font-medium mb-lg truncate">{email}</p>
                  <button
                    onClick={handleMagicLink}
                    disabled={magicLoading}
                    className={`${btnGold} mb-md`}
                    style={{ background: 'linear-gradient(135deg, #b07d1a 0%, #d4a832 100%)' }}
                  >
                    {magicLoading ? 'Sending…' : 'Send me a sign-in link →'}
                  </button>
                  <p className="text-[11px] text-white/30 text-center mb-2xl">
                    A link will be sent to your email — tap it to sign in instantly.
                    No password needed.
                  </p>
                  <div className="flex items-center gap-md mb-2xl">
                    <div className="flex-1 h-px bg-white/10" />
                    <span className="text-[11px] text-white/30 uppercase tracking-widest">or use password</span>
                    <div className="flex-1 h-px bg-white/10" />
                  </div>
                </div>
              )}

              <form onSubmit={handleEmailLogin} className="space-y-2xl">
                {!prefilled && (
                  <div>
                    <label className={lbl}>Email</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                      placeholder="you@example.com" autoComplete="email" className={inp} required />
                  </div>
                )}
                <div>
                  <label className={lbl}>Password</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••" autoComplete="current-password" className={inp} required />
                </div>
                <button type="submit" disabled={loading} className={btn}>
                  {loading ? 'Signing in…' : 'Sign in'}
                </button>
              </form>

              <div className="mt-xl flex items-center justify-between text-xs">
                {passkeySupported ? (
                  <button onClick={handlePasskeyLogin} disabled={passkeyLoading}
                    className="tracking-wide text-white/40 hover:text-white/90 transition-colors disabled:opacity-40">
                    {passkeyLoading ? 'Authenticating…' : 'Use Face ID'}
                  </button>
                ) : <span />}
                <button onClick={() => { setShowForgot(true); setForgotEmail(email) }}
                  className="tracking-wide text-white/40 hover:text-white/90 transition-colors">
                  {prefilled ? 'Set a password' : 'Forgot password?'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="cr-fade-up absolute bottom-xl opacity-30" style={{ animationDelay: '1300ms' }}>
        <Logo variant="wordmark" height={13} invert />
      </div>
    </div>
  )
}

// Suspense wrapper required for useSearchParams in Next.js App Router
export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white/80 animate-spin" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}
