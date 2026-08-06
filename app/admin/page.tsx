'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { signOut } from '@/lib/auth'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import { AdminDashboardSkeleton } from '@/app/components/SkeletonLoading'

export default function AdminDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function checkAuth() {
      try {
        const data = await getCurrentUser()

        if (!data) {
          router.push('/login')
          return
        }

        if (data.assignment?.role !== 'administrator') {
          console.warn('User is not an administrator:', data.assignment?.role)
          router.push('/login')
          return
        }

        setUser(data.user)
        setLoading(false)
      } catch (err) {
        console.error('Auth check error:', err)
        router.push('/login')
      }
    }

    checkAuth()
  }, [router])

  if (loading) {
    return <AdminDashboardSkeleton />
  }

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
              Welcome, Administrator
            </h2>
            <p className="text-base text-neutral-600">
              Logged in as: <span className="font-medium">{user?.email}</span>
            </p>
          </div>

          {/* Dashboard sections */}
          <div className="grid grid-cols-1 gap-lg">
            <SectionLink
              title="System Overview"
              href="/admin/overview"
              description="Real-time KPIs, occupancy rate, platform health, quick actions"
            />
            <SectionLink
              title="Availability"
              href="/admin/available-and-lettings"
              description="View available rooms sorted by date, manage applications and move-ins"
            />
            <SectionLink
              title="Properties & Rooms"
              href="/admin/properties"
              description="Manage properties, rooms, licensing, and compliance information"
            />
            <SectionLink
              title="Tenancies"
              href="/admin/tenancies"
              description="Assign tenants to rooms with communication preferences and notification opt-ins"
            />
            <SectionLink
              title="Property Notes"
              href="/admin/property-notes"
              description="Post updates visible on tenant dashboards — cleaning notes, agent updates, announcements"
            />
            <SectionLink
              title="All Maintenance"
              href="/admin/maintenance"
              description="View and manage all maintenance tickets across all properties"
            />
            <SectionLink
              title="Compliance"
              href="/admin/compliance"
              description="Track certifications, expiry dates, and compliance status"
            />
            <SectionLink
              title="Contacts"
              href="/admin/people"
              description="Add, edit, and manage contractors, cleaners"
            />
            <SectionLink
              title="Landlords"
              href="/admin/landlords"
              description="Invite landlords and assign properties to them"
            />
            <Section title="Property Visits" />
            <Section title="House Notices" />
          </div>
        </div>
      </main>
    </div>
  )
}

function Section({ title }: { title: string }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-lg p-xl">
      <h3 className="text-base font-semibold text-neutral-900">{title}</h3>
      <p className="text-sm text-neutral-500 mt-md">Coming soon...</p>
    </div>
  )
}

function SectionLink({ title, href, description }: { title: string; href: string; description: string }) {
  return (
    <Link href={href}>
      <div className="bg-white border border-neutral-200 rounded-lg p-xl hover:border-neutral-300 hover:shadow-sm transition-all cursor-pointer">
        <h3 className="text-base font-semibold text-neutral-900">{title}</h3>
        <p className="text-sm text-neutral-600 mt-md">{description}</p>
        <p className="text-xs text-neutral-900 mt-md font-medium">View →</p>
      </div>
    </Link>
  )
}
