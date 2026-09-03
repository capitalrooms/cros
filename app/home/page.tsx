'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'

/**
 * /home — role-aware home redirect.
 *
 * The Capital Rooms logo in the AppBar links here so tapping it always
 * takes the user back to their own dashboard, regardless of which role
 * they're logged in as.
 */
export default function HomePage() {
  const router = useRouter()

  useEffect(() => {
    getCurrentUser().then(data => {
      const role = data?.assignment?.role
      if (!role) {
        router.replace('/login')
        return
      }
      if (['administrator', 'admin'].includes(role)) {
        router.replace('/admin')
      } else if (role === 'lettings') {
        router.replace('/lettings')
      } else if (role === 'tenant') {
        router.replace('/tenant')
      } else if (['contractor', 'cleaner'].includes(role)) {
        router.replace('/cleaner')
      } else if (role === 'landlord') {
        router.replace('/landlord')
      } else {
        router.replace('/login')
      }
    })
  }, [])

  return <div className="min-h-screen bg-neutral-900" />
}
