'use client'

// /admin/property-documents retired (3 Nov 2026 admin audit): the old property documents list — now Documents. Nothing linked here any more; old bookmarks land on the
// screen that replaced it. The old page is in git history.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Moved() {
  const router = useRouter()
  useEffect(() => { router.replace('/admin/documents') }, [router])
  return null
}
