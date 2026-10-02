'use client'

// Shared planner — the person's side (cleaner, contractor, lettings, or a project landlord): their board with the
// office. Opened from their app and from planner notifications.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import BackButton from '@/app/components/BackButton'
import SharedPlanner from '@/components/SharedPlanner'

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
  if (!home) return <div className="min-h-screen bg-neutral-100" />
  return (
    <div className="min-h-screen bg-neutral-100">
      <header className="sticky top-0 z-40 flex items-center gap-md bg-neutral-950 px-lg py-md text-white" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}>
        <BackButton href={home} />
        <h1 className="text-lg font-bold">With Capital Rooms</h1>
      </header>
      <main className="mx-auto max-w-2xl px-lg py-lg">
        <SharedPlanner mode="member" />
      </main>
    </div>
  )
}
