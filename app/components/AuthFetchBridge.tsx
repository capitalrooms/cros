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
      // viewing a tenant's app is read-only: nothing that sends or changes anything leaves the browser (lib/viewAs)
      const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase()
      let viewing: string | null = null
      try { viewing = window.location.pathname.startsWith('/tenant') ? sessionStorage.getItem('cros-view-as') : null } catch { /* private mode */ }
      if (viewing && method !== 'GET' && method !== 'HEAD' && ((sameOrigin && url.includes('/api/')) || /\/(rest|storage)\/v1\//.test(url))) {
        return new Response(JSON.stringify({ error: 'You’re viewing their app, which is read-only — nothing was sent or changed.' }), { status: 403, headers: { 'content-type': 'application/json' } })
      }
      if (sameOrigin && url.includes('/api/')) {
        const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
        let changed = false
        // an administrator viewing a tenant's app: say whose (the server only honours it for reading — lib/viewAs)
        try {
          const va = window.location.pathname.startsWith('/tenant') ? sessionStorage.getItem('cros-view-as') : null
          if (va && !headers.has('x-view-as')) { headers.set('x-view-as', va); changed = true }
        } catch { /* private mode */ }
        if (!headers.has('authorization')) {
          const { data } = await supabase.auth.getSession()
          const token = data.session?.access_token
          if (token) { headers.set('authorization', `Bearer ${token}`); changed = true }
        }
        if (changed) return original(input, { ...init, headers })
      }
    } catch { /* never block a request because of this */ }
    return original(input, init)
  }
}

install()

export default function AuthFetchBridge() {
  return null
}
