'use client'

// /admin/tenant-safety-checks retired (3 Nov 2026 admin audit): the old tenant safety-checks list — now Compliance › Safety checks. Nothing linked here any more; old bookmarks land on the
// screen that replaced it. The old page is in git history.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Moved() {
  const router = useRouter()
  useEffect(() => { router.replace('/admin/compliance?tab=monthly-checks') }, [router])
  return null
}
