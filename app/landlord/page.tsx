'use client'

import { useEffect, useState } from 'react'
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading'
import { useRouter } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { signOut } from '@/lib/auth'
import AppBar from '@/components/AppBar'

export default function LandlordDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function checkAuth() {
      const data = await getCurrentUser()

      if (!data || data.assignment?.role !== 'landlord') {
        router.push('/login')
        return
      }

      setUser(data.user)
      setLoading(false)
    }

    checkAuth()
  }, [router])

  if (loading) return <GenericPageSkeleton />;

  async function handleSignOut() {
    await signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar
        right={
          <button
            onClick={handleSignOut}
            className="shrink-0 transition-colors hover:opacity-80 flex items-center gap-sm"
          >
            <span>👋</span> Sign out
          </button>
        }
      />

      <main className="mx-auto max-w-6xl px-lg py-2xl">
        <div className="space-y-3xl">
          <div>
            <h2 className="text-xl font-semibold text-neutral-900 mb-md">
              Welcome, Landlord
            </h2>
            <p className="text-base text-neutral-600">
              Logged in as: <span className="font-medium">{user?.email}</span>
            </p>
          </div>

          {/* Placeholder sections */}
          <div className="grid grid-cols-1 gap-lg">
            <Section title="Properties" />
            <Section title="Occupancy & Yield" />
            <Section title="Maintenance Costs" />
          </div>
        </div>
      </main>
    </div>
  )
}

function Section({ title }: { title: string }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-lg p-xl">
      <h3 className="text-lg font-semibold text-neutral-900">{title}</h3>
      <p className="text-sm text-neutral-500 mt-md">Coming soon...</p>
    </div>
  )
}
