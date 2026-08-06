'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from '@/lib/auth'
import { authenticateWithPasskey, isPasskeySupported } from '@/lib/webauthn'

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

      const validRoles = ['admin', 'tenant', 'contractor', 'cleaner', 'agent', 'landlord']
      const role = validRoles.includes(assignment.role) ? assignment.role : 'tenant'

      await new Promise(resolve => setTimeout(resolve, 100))
      router.push(`/${role}`)

      setTimeout(() => {
        if (typeof window !== 'undefined') {
          window.location.href = `/${role}`
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
        const role = result.user.role || 'tenant'
        router.push(`/${role}`)
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
      setForgotMessage('Reset link sent! Check your email.')
      setForgotEmail('')
    } catch (err) {
      setForgotMessage(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setForgotLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900 px-lg">
      <div className="w-full max-w-md">
        {/* Logo/Brand */}
        <div className="text-center mb-3xl">
          <div className="inline-block mb-lg">
            <div className="w-12 h-12 bg-gradient-to-br from-white to-neutral-200 rounded-2xl flex items-center justify-center">
              <span className="text-2xl font-black text-neutral-900">CR</span>
            </div>
          </div>
          <h1 className="text-3xl font-bold text-white">Capital Rooms</h1>
          <p className="mt-md text-neutral-400">Property management platform</p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-3xl p-lg md:p-2xl shadow-2xl">
          {!showForgotPassword ? (
            <>
              <h2 className="text-2xl font-bold text-neutral-900 mb-md">Welcome back</h2>
              <p className="text-sm text-neutral-600 mb-2xl">
                Sign in to manage properties, viewings, and maintenance
              </p>

              {error && (
                <div className="mb-lg rounded-xl bg-red-50 border border-red-200 p-md text-sm text-red-700">
                  {error}
                </div>
              )}

              {/* Passkey Button */}
              {passkeySupported && (
                <button
                  onClick={handlePasskeyLogin}
                  disabled={passkeyLoading}
                  className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold py-md hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 transition-all mb-lg flex items-center justify-center gap-md"
                >
                  <span>👤</span>
                  {passkeyLoading ? 'Authenticating...' : 'Sign in with Face ID'}
                </button>
              )}

              {/* Email/Password Form */}
              <form onSubmit={handleEmailLogin} className="space-y-lg">
                <div>
                  <label className="block text-sm font-bold text-neutral-900 mb-md">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-xl border border-neutral-300 px-lg py-md text-base focus:outline-none focus:ring-2 focus:ring-neutral-900"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-neutral-900 mb-md">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-neutral-300 px-lg py-md text-base focus:outline-none focus:ring-2 focus:ring-neutral-900"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-neutral-900 text-white font-bold py-md hover:bg-neutral-800 disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Signing in…' : 'Sign in'}
                </button>
              </form>

              {/* Forgot Password Link */}
              <div className="mt-lg pt-lg border-t border-neutral-200">
                <button
                  onClick={() => setShowForgotPassword(true)}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium w-full text-center"
                >
                  Forgot your password?
                </button>
              </div>

              <div className="mt-lg pt-lg border-t border-neutral-200">
                <p className="text-xs text-neutral-500 text-center">
                  Demo credentials available from your property manager
                </p>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-neutral-900 mb-md">Reset password</h2>
              <p className="text-sm text-neutral-600 mb-2xl">
                Enter your email and we'll send you a password reset link
              </p>

              {forgotMessage && (
                <div className={`mb-lg rounded-xl p-md text-sm ${
                  forgotMessage.includes('sent') || forgotMessage.includes('Check')
                    ? 'bg-green-50 border border-green-200 text-green-700'
                    : 'bg-red-50 border border-red-200 text-red-700'
                }`}>
                  {forgotMessage}
                </div>
              )}

              <form onSubmit={handleForgotPassword} className="space-y-lg">
                <div>
                  <label className="block text-sm font-bold text-neutral-900 mb-md">Email</label>
                  <input
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full rounded-xl border border-neutral-300 px-lg py-md text-base focus:outline-none focus:ring-2 focus:ring-neutral-900"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="w-full rounded-xl bg-neutral-900 text-white font-bold py-md hover:bg-neutral-800 disabled:opacity-50 transition-colors"
                >
                  {forgotLoading ? 'Sending…' : 'Send reset link'}
                </button>
              </form>

              <div className="mt-lg">
                <button
                  onClick={() => setShowForgotPassword(false)}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium w-full text-center"
                >
                  Back to login
                </button>
              </div>
            </>
          )}

          {/* Footer */}
          <div className="mt-2xl text-center text-neutral-500 text-xs">
            <p>Capital Rooms — Professional property management</p>
          </div>
        </div>
      </div>
    </div>
  )
}
