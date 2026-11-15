'use client'

// Shared planner — the person's side (cleaner, contractor, lettings, or a project landlord): their board with the
// office. Opened from their app, planner notifications and the "Your shared planner" email.
// 4 Nov 2026 (Harry: "it's hardly a shared planner look"): staff get the same planner as landlords
// (components/LandlordPlanner) — grouped by house, status, who and when on each line, notes and photos — not a plain list.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { display } from '@/app/components/garden/kit'
import { RoleTabBar } from '@/app/components/RoleTabBar'
import LandlordPlanner from '@/components/LandlordPlanner'

const HOME: Record<string, string> = { cleaner: '/cleaner', contractor: '/contractor', lettings: '/lettings', landlord: '/landlord', administrator: '/admin/planner/shared', admin: '/admin/planner/shared' }

export default function MemberPlannerPage() {
  const router = useRouter()
  const [home, setHome] = useState<string | null>(null)
  const [role, setRole] = useState('')
  useEffect(() => {
    getCurrentUser().then(u => {
      const role = u?.assignment?.role
      if (!role) { router.push('/login'); return }
      if (role === 'administrator' || role === 'admin') { router.replace('/admin/planner/shared'); return }
      setRole(role); setHome(HOME[role] ?? '/')
    })
  }, [router])
  if (!home) return <div className="min-h-screen bg-[#EEF2EC]" />
  // the role apps' look, with a way back (15 Nov 2026, Harry: "a planner which you cannot come back from, also in old style")
  return (
    <div className="garden min-h-screen bg-[#EEF2EC]" style={{ paddingTop: 'max(calc(env(safe-area-inset-top) + 12px), 16px)' }}>
      <div className="mx-auto max-w-6xl px-4 pb-8 lg:px-lg">
        <a href={home} className="inline-flex h-9 items-center gap-1 rounded-full bg-white px-3 text-sm font-semibold text-[#14261F] shadow-[0_2px_0_#DCE5DD]">‹ Back</a>
        <p className="mt-4 text-[13px] font-semibold text-[#4E6158]">With Capital Rooms</p>
        <h1 className="mb-4 text-[28px] font-extrabold leading-tight tracking-[-0.02em] text-[#14261F]" style={display}>Notes, jobs &amp; photos</h1>
        <LandlordPlanner />
      </div>
      {(role === 'contractor' || role === 'cleaner') && <RoleTabBar role={role} active={null} />}
    </div>
  )
}
