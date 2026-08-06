'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import Logo from '@/components/Logo'

/** Must match the role routing in app/login/page.tsx. */
const DASHBOARDS: Record<string, string> = {
  administrator: '/admin',
  tenant: '/tenant',
  contractor: '/contractor',
  cleaner: '/cleaner',
  landlord: '/landlord',
}

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    async function route() {
      try {
        const data = await getCurrentUser()
        const role = data?.assignment?.role
        router.replace(role ? DASHBOARDS[role] ?? '/login' : '/login')
      } catch {
        router.replace('/login')
      }
    }

    route()
  }, [router])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-lg bg-neutral-50">
      <Logo className="h-16 w-auto" priority />
      <p className="text-sm text-neutral-400">Loading…</p>
    </div>
  )
}
