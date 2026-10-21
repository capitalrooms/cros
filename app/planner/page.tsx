'use client'

// Shared planner — the person's side (cleaner, contractor, lettings, or a project landlord): their board with the
// office. Opened from their app and from planner notifications.

import AppBar from '@/components/AppBar'
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
      <AppBar left={<BackButton href={home} />} />
      <main className="mx-auto max-w-2xl px-lg py-lg">
        <h1 className="mb-md text-2xl font-bold text-neutral-900">With Capital Rooms</h1>
        <SharedPlanner mode="member" />
      </main>
    </div>
  )
}
