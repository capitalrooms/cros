'use client'

// /admin/accounts retired (3 Nov 2026 finance audit). It was an older all-in-one page whose rent tab wrote "received" and
// "paid" straight onto rent charges with no receipt or audit line. Each of its tabs now lives on its own screen; old
// links land there. The old page is in git history (before commit "Income is one place").
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

const TO: Record<string, string> = { 'rent-roll': '/admin/rent-roll', 'landlord-accounts': '/admin/statements', 'agency-income': '/admin/income', arrears: '/admin/arrears' }

export default function AccountsMoved() {
  const router = useRouter()
  useEffect(() => { router.replace(TO[new URLSearchParams(window.location.search).get('tab') ?? ''] ?? '/admin/finance') }, [router])
  return null
}
