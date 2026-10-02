'use client'

// The old property list (big black cards) is retired: All Units is the one portfolio view, on desktop and phone.
// Anything still linking here lands on All Units. (The old page is in git history before 2 Oct 2026.)

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function PropertiesRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/admin/active-rooms') }, [router])
  return <div className="min-h-screen bg-neutral-100" />
}
