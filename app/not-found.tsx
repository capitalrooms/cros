'use client'

import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900 px-lg">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl p-lg md:p-2xl shadow-2xl">
          <div className="text-center mb-lg">
            <p className="text-6xl mb-md font-bold text-neutral-900">404</p>
            <h2 className="text-2xl font-bold text-neutral-900">Page not found</h2>
          </div>

          <p className="text-sm text-neutral-600 mb-2xl text-center">
            The page you're looking for doesn't exist. This might happen if:
          </p>

          <ul className="text-sm text-neutral-600 mb-2xl space-y-sm ml-lg list-disc">
            <li>You're not logged in (try the login page)</li>
            <li>Your session expired (please log in again)</li>
            <li>The URL is incorrect</li>
            <li>You don't have access to this page</li>
          </ul>

          <div className="space-y-md">
            <Link href="/login">
              <button className="w-full rounded-xl bg-neutral-900 text-white font-bold py-md hover:bg-neutral-800 transition-colors">
                Go to login
              </button>
            </Link>

            <Link href="/">
              <button className="w-full rounded-xl border-2 border-neutral-300 text-neutral-900 font-bold py-md hover:bg-neutral-50 transition-colors">
                Go home
              </button>
            </Link>
          </div>

          <p className="text-xs text-neutral-500 text-center mt-lg">
            If you think this is a mistake, please contact support.
          </p>
        </div>
      </div>
    </div>
  )
}
