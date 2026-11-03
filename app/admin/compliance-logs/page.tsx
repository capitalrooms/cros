'use client'

// /admin/compliance-logs (Inspection Logs) retired (3 Nov 2026, Harry: "safety checks and inspection logs — could they
// not fall under the former only"): Compliance › Safety checks reads and records the same fire-door and smoke-alarm
// logs (compliance_logs). Old links land there. The old page is in git history.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Moved() {
  const router = useRouter()
  useEffect(() => { router.replace('/admin/compliance?tab=monthly-checks') }, [router])
  return null
}
