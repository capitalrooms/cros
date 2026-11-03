'use client'

// /admin/calendar retired (3 Nov 2026 admin tidy-up): an older view of viewings, repairs and cleans together —
// Diary › Everything shows the same. Old links land there. The old page is in git history.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Moved() {
  const router = useRouter()
  useEffect(() => { router.replace('/admin/agency-diary') }, [router])
  return null
}
