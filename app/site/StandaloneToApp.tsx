'use client'
// Opened as the installed phone app (not in a browser) on the website's front page: that's the app's start, so go to
// the app's front door instead of showing the website (9 Nov 2026).
import { useEffect } from 'react'
export default function StandaloneToApp() {
  useEffect(() => {
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true
    if (standalone && (location.pathname === '/' || location.pathname === '/site')) location.replace('/app')
  }, [])
  return null
}
