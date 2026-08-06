'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Application error:', error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900 px-lg">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl p-lg md:p-2xl shadow-2xl">
          <div className="text-center mb-lg">
            <p className="text-4xl mb-md">⚠️</p>
            <h2 className="text-2xl font-bold text-neutral-900">Something went wrong</h2>
          </div>

          <p className="text-sm text-neutral-600 mb-lg text-center">
            We encountered an unexpected error. Here's what you can try:
          </p>

          <div className="bg-neutral-50 rounded-lg p-md mb-lg text-xs text-neutral-600 max-h-48 overflow-y-auto">
            <p className="font-mono text-red-600">{error.message}</p>
          </div>

          <div className="space-y-md">
            <button
              onClick={() => reset()}
              className="w-full rounded-xl bg-neutral-900 text-white font-bold py-md hover:bg-neutral-800 transition-colors"
            >
              Try again
            </button>

            <a href="/login">
              <button className="w-full rounded-xl border-2 border-neutral-300 text-neutral-900 font-bold py-md hover:bg-neutral-50 transition-colors">
                Return to login
              </button>
            </a>
          </div>

          <p className="text-xs text-neutral-500 text-center mt-lg">
            If this keeps happening, contact support with error code: {error.digest}
          </p>
        </div>
      </div>
    </div>
  )
}
