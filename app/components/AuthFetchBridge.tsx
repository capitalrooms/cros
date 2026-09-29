'use client'

// Sessions live in localStorage, so API routes can't see who's signed in from cookies. This attaches the
// signed-in user's access token as a Bearer header to every same-origin /api request (unless the caller
// already set one — e.g. lib/adminFetch). Server side: lib/serverAuth.ts.
//
// Installed at module load (not in an effect) so it's in place before any page's first fetch.
import { createClient } from '@/lib/supabase'

declare global { interface Window { __crosAuthFetch?: boolean } }

function install() {
  if (typeof window === 'undefined' || window.__crosAuthFetch) return
  window.__crosAuthFetch = true
  const original = window.fetch.bind(window)
  const supabase = createClient()

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const sameOrigin = url.startsWith('/') || url.startsWith(window.location.origin)
      if (sameOrigin && url.includes('/api/')) {
        const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
        if (!headers.has('authorization')) {
          const { data } = await supabase.auth.getSession()
          const token = data.session?.access_token
          if (token) {
            headers.set('authorization', `Bearer ${token}`)
            return original(input, { ...init, headers })
          }
        }
      }
    } catch { /* never block a request because of this */ }
    return original(input, init)
  }
}

install()

export default function AuthFetchBridge() {
  return null
}
