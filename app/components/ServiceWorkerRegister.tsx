'use client'

import { useEffect } from 'react'

/**
 * Registers the PWA service worker in production.
 *
 * In development we do the opposite: the offline-fallback worker keeps serving a
 * cached "you're offline" page whenever the dev server restarts, which looks like
 * the app is stuck on a placeholder. So in dev we unregister any existing worker
 * and wipe its caches, then reload once to drop the stale page.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => {
          const hadWorker = regs.length > 0
          regs.forEach((r) => r.unregister())
          const cleared =
            'caches' in window
              ? caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
              : Promise.resolve()
          if (hadWorker) cleared.then(() => window.location.reload())
        })
        .catch(() => {})
      return
    }

    const register = () => navigator.serviceWorker.register('/sw.js').catch(() => {})
    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register)
    return () => window.removeEventListener('load', register)
  }, [])

  return null
}
