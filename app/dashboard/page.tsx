'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'

export default function DashboardRedirect() {
  const router = useRouter()

  useEffect(() => {
    async function checkUserAndRedirect() {
      const data = await getCurrentUser()

      if (!data) {
        router.push('/login')
        return
      }

      const dashboardMap: Record<string, string> = {
        administrator: '/admin',
        tenant: '/tenant',
        contractor: '/contractor',
        cleaner: '/cleaner',
        landlord: '/landlord',
      }

      const role = data.assignment?.role
      const path = role ? dashboardMap[role] : '/login'
      router.push(path)
    }

    checkUserAndRedirect()
  }, [router])

  return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-neutral-500">Redirecting...</p>
    </div>
  )
}
