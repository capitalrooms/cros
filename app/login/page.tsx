'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from '@/lib/auth'
import { authenticateWithPasskey, isPasskeySupported } from '@/lib/webauthn'
import Logo from '@/components/Logo'

export default function EnhancedLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotMessage, setForgotMessage] = useState('')
  const [passkeySupported, setPasskeySupported] = useState(false)
  const [passkeyLoading, setPasskeyLoading] = useState(false)

  useEffect(() => {
    // Check if device supports passkeys
    isPasskeySupported().then(setPasskeySupported).catch(() => setPasskeySupported(false))
  }, [])

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await signIn(email, password)

      if (!result.success) {
        const errorMsg = result.error === 'not_recognized'
          ? result.message
          : 'Invalid email or password. Please check your credentials and try again.'
        setError(errorMsg)
        setLoading(false)
        return
      }

      const assignment = result.assignment
      if (!assignment || !assignment.role) {
        setError('Your account is not properly set up. Please contact your administrator.')
        setLoading(false)
        return
      }

      // Map each stored role to its dashboard route path
      const roleRoutes: Record<string, string> = {
        administrator: '/admin',
        admin: '/admin',
        tenant: '/tenant',
        contractor: '/contractor',
        cleaner: '/cleaner',
        landlord: '/landlord',
        lettings: '/lettings',
        agent: '/agent',
      }
      const path = roleRoutes[assignment.role] || '/tenant'

      await new Promise(resolve => setTimeout(resolve, 100))
      router.push(path)

      setTimeout(() => {
        if (typeof window !== 'undefined') {
          window.location.href = path
        }
      }, 1000)
    } catch (err) {
      const errorMsg = err instanceof Error
        ? err.message
        : 'An unexpected error occurred. Please try again.'
      setError(errorMsg)
      console.error('Login error:', err)
      setLoading(false)
    }
  }

  async function handlePasskeyLogin() {
    setError('')
    setPasskeyLoading(true)

    try {
      const result = await authenticateWithPasskey()

      if (result.success && result.user) {
        const roleRoutes: Record<string, string> = {
          administrator: '/admin', admin: '/admin', tenant: '/tenant',
          contractor: '/contractor', cleaner: '/cleaner', landlord: '/landlord',
          lettings: '/lettings', agent: '/agent',
        }
        router.push(roleRoutes[result.user.role] || '/tenant')
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Passkey authentication failed'
      setError(errorMsg)
      console.error('Passkey error:', err)
    } finally {
      setPasskeyLoading(false)
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault()
    setForgotMessage('')
    setForgotLoading(true)

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail }),
      })

      if (!res.ok) {
        const error = await res.json()
        setForgotMessage(error.error || 'Failed to send reset email')
        return
      }

      const data = await res.json()
      console.log('Full API response:', data)
      if (data?.resetLink) {
        setForgotMessage(data.resetLink)
      } else if (data?.debug) {
        setForgotMessage(`Debug: ${JSON.stringify(data.debug)}`)
      } else if (data?.message) {
        setForgotMessage(data.message)
      } else {
        setForgotMessage(JSON.stringify(data) || 'Unable to generate reset link')
      }
      setForgotEmail('')
    } catch (err) {
      setForgotMessage(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setForgotLoading(false)
    }
  }

  const inputClass =
    'cr-input w-full bg-transparent border-0 border-b border-white/15 pb-3 pt-1 text-white text-base placeholder:text-white/25 focus:outline-none focus:border-white/70 transition-colors'
  const labelClass = 'block text-[11px] uppercase tracking-[0.18em] text-white/40 mb-2'

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-black px-lg">

      <div className="relative w-full max-w-sm">
        {/* Brand — the emblem rises up from the bottom on load */}
        <div className="text-center" style={{ marginBottom: '4.5rem' }}>
          <div className="cr-rise inline-flex items-center justify-center">
            <Logo variant="emblem" height={52} invert priority />
          </div>
          <div
            className="cr-fade-up mt-xl flex justify-center"
            style={{ animationDelay: '1000ms' }}
          >
            <Logo variant="wordmark" height={40} invert />
          </div>
        </div>

        {/* Form fades in after the emblem settles */}
        <div className="cr-fade-up" style={{ animationDelay: '1150ms' }}>
          {!showForgotPassword ? (
            <>
              {error && (
                <p className="mb-lg text-center text-sm text-red-400/90">{error}</p>
              )}

              <form onSubmit={handleEmailLogin} className="space-y-2xl">
                <div>
                  <label className={labelClass}>Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    className={inputClass}
                    required
                  />
                </div>

                <div>
                  <label className={labelClass}>Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className={inputClass}
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-full border border-white/25 py-3.5 text-sm font-medium tracking-wide text-white hover:bg-white hover:text-neutral-950 disabled:opacity-40 transition-colors"
                >
                  {loading ? 'Signing in…' : 'Sign in'}
                </button>
              </form>

              <div className="mt-xl flex items-center justify-between text-xs">
                {passkeySupported ? (
                  <button
                    onClick={handlePasskeyLogin}
                    disabled={passkeyLoading}
                    className="tracking-wide text-white/40 hover:text-white/90 transition-colors disabled:opacity-40"
                  >
                    {passkeyLoading ? 'Authenticating…' : 'Use Face ID'}
                  </button>
                ) : (
                  <span />
                )}
                <button
                  onClick={() => setShowForgotPassword(true)}
                  className="tracking-wide text-white/40 hover:text-white/90 transition-colors"
                >
                  Forgot password?
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="mb-2xl text-center text-sm text-white/50">
                Enter your email and we&apos;ll send a reset link
              </p>

              {forgotMessage && (
                <div className="mb-xl text-sm">
                  {forgotMessage.startsWith('http') ? (
                    <div className="text-white/80">
                      <p className="mb-md">Your reset link is ready:</p>
                      <a
                        href={forgotMessage}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block break-all font-mono text-xs text-white/70 underline hover:text-white"
                      >
                        {forgotMessage}
                      </a>
                    </div>
                  ) : (
                    <p className="text-center text-white/60">{forgotMessage}</p>
                  )}
                </div>
              )}

              <form onSubmit={handleForgotPassword} className="space-y-2xl">
                <div>
                  <label className={labelClass}>Email</label>
                  <input
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    className={inputClass}
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="w-full rounded-full border border-white/25 py-3.5 text-sm font-medium tracking-wide text-white hover:bg-white hover:text-neutral-950 disabled:opacity-40 transition-colors"
                >
                  {forgotLoading ? 'Sending…' : 'Send reset link'}
                </button>
              </form>

              <div className="mt-xl text-center">
                <button
                  onClick={() => setShowForgotPassword(false)}
                  className="text-xs tracking-wide text-white/40 hover:text-white/90 transition-colors"
                >
                  Back to sign in
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Minimal footer — wordmark from source */}
      <div
        className="cr-fade-up absolute bottom-xl opacity-30"
        style={{ animationDelay: '1300ms' }}
      >
        <Logo variant="wordmark" height={13} invert />
      </div>
    </div>
  )
}
