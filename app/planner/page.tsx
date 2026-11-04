'use client'

// Shared planner — the person's side (cleaner, contractor, lettings, or a project landlord): their board with the
// office. Opened from their app, planner notifications and the "Your shared planner" email.
// 4 Nov 2026 (Harry: "it's hardly a shared planner look"): staff get the same planner as landlords
// (components/LandlordPlanner) — grouped by house, status, who and when on each line, notes and photos — not a plain list.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import PublicShell from '@/components/public/PublicShell'
import LandlordPlanner from '@/components/LandlordPlanner'

const HOME: Record<string, string> = { cleaner: '/cleaner', contractor: '/contractor', lettings: '/lettings', landlord: '/landlord', administrator: '/admin/planner/shared', admin: '/admin/planner/shared' }

export default function MemberPlannerPage() {
  const router = useRouter()
  const [home, setHome] = useState<string | null>(null)
  useEffect(() => {
    getCurrentUser().then(u => {
      const role = u?.assignment?.role
      if (!role) { router.push('/login'); return }
      if (role === 'administrator' || role === 'admin') { router.replace('/admin/planner/shared'); return }
      setHome(HOME[role] ?? '/')
    })
  }, [router])
  if (!home) return <div className="min-h-screen bg-white" />
  return (
    <PublicShell signedIn label="Planner">
      <div className="mx-auto max-w-6xl px-6 py-8 md:px-14 md:py-12">
        <p className="pub-eyebrow m-0 mb-1">With Capital Rooms</p>
        <h1 className="pub-h2 mb-6">Your planner</h1>
        <LandlordPlanner />
      </div>
    </PublicShell>
  )
}
