'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function ResetPasswordContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!token) {
      setError('Invalid reset link. No token provided.')
    }
  }, [token])

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      setLoading(false)
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      setLoading(false)
      return
    }

    try {
      const res = await fetch('/api/auth/reset-password-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to reset password')
        setLoading(false)
        return
      }

      setSuccess(true)
      setTimeout(() => {
        router.push('/login')
      }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900 px-lg">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-3xl p-lg md:p-2xl shadow-2xl">
            <div className="mb-lg rounded-xl bg-red-50 border border-red-200 p-md text-sm text-red-700">
              Invalid reset link. Please request a new password reset.
            </div>
            <button
              onClick={() => router.push('/login')}
              className="w-full rounded-xl bg-neutral-900 text-white font-bold py-md hover:bg-neutral-800 transition-colors"
            >
              Back to login
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900 px-lg">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-3xl p-lg md:p-2xl shadow-2xl">
            <div className="text-center mb-lg">
              <div className="text-4xl mb-md">✅</div>
              <h2 className="text-2xl font-bold text-neutral-900">Password reset!</h2>
              <p className="text-sm text-neutral-600 mt-md">
                Your password has been successfully reset. Redirecting to login...
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900 px-lg">
      <div className="w-full max-w-md">
        <div className="text-center mb-3xl">
          <div className="inline-block mb-lg">
            <div className="w-12 h-12 bg-gradient-to-br from-white to-neutral-200 rounded-2xl flex items-center justify-center">
              <span className="text-2xl font-black text-neutral-900">CR</span>
            </div>
          </div>
          <h1 className="text-3xl font-bold text-white">Capital Rooms</h1>
          <p className="mt-md text-neutral-400">Reset your password</p>
        </div>

        <div className="bg-white rounded-3xl p-lg md:p-2xl shadow-2xl">
          <h2 className="text-2xl font-bold text-neutral-900 mb-md">Create new password</h2>
          <p className="text-sm text-neutral-600 mb-2xl">
            Enter a new password to secure your account
          </p>

          {error && (
            <div className="mb-lg rounded-xl bg-red-50 border border-red-200 p-md text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleResetPassword} className="space-y-lg">
            <div>
              <label className="block text-sm font-bold text-neutral-900 mb-md">New Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-neutral-300 px-lg py-md text-base focus:outline-none focus:ring-2 focus:ring-neutral-900"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-neutral-900 mb-md">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
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
              {loading ? 'Resetting…' : 'Reset password'}
            </button>
          </form>

          <div className="mt-lg pt-lg border-t border-neutral-200">
            <button
              onClick={() => router.push('/login')}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium w-full text-center"
            >
              Back to login
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <ResetPasswordContent />
    </Suspense>
  )
}
