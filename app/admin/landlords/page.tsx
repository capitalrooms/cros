'use client'

// /admin/landlords retired (3 Nov 2026 admin tidy-up): People › Landlords lists them and adds new ones, and each
// landlord's own page holds AML and notification settings. Old links land there. The old page is in git history.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Moved() {
  const router = useRouter()
  useEffect(() => { router.replace('/admin/people?tab=landlords') }, [router])
  return null
}
