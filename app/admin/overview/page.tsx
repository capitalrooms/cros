'use client'

// /admin/overview retired (3 Nov 2026 admin audit): the old Property Audit — its figures are on the Dashboard. Nothing linked here any more; old bookmarks land on the
// screen that replaced it. The old page is in git history.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Moved() {
  const router = useRouter()
  useEffect(() => { router.replace('/admin') }, [router])
  return null
}
