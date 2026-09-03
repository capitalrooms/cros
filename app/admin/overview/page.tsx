'use client'

import { useEffect, useState } from 'react'
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading'
import { useRouter } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import Link from 'next/link'

interface SystemStats {
  totalProperties: number
  totalRooms: number
  totalTenancies: number
  activeViewings: number
  pendingJobs: number
  completedJobs: number
  availableRooms: number
  occupiedRooms: number
  usersCount: number
}

export default function OverviewPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<SystemStats>({
    totalProperties: 0,
    totalRooms: 0,
    totalTenancies: 0,
    activeViewings: 0,
    pendingJobs: 0,
    completedJobs: 0,
    availableRooms: 0,
    occupiedRooms: 0,
    usersCount: 0,
  })

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      if (!data || data.assignment?.role !== 'administrator' && data.assignment?.role !== 'admin') {
        router.push('/login')
        return
      }

      const supabase = createClient()

      // Fetch all stats
      const [props, rooms, tenancies, viewings, jobs, users] = await Promise.all([
        supabase.from('properties').select('id', { count: 'exact' }),
        supabase.from('rooms').select('id, status', { count: 'exact' }),
        supabase.from('tenancies').select('id', { count: 'exact' }),
        supabase
          .from('viewings')
          .select('id')
          .gte('viewing_date', new Date().toISOString().split('T')[0]),
        supabase.from('maintenance_tickets').select('id, status'),
        supabase.from('role_assignments').select('id', { count: 'exact' }),
      ])

      const jobsData = jobs[1] || []
      const roomsData = rooms[1] || []
      const availableCount = roomsData.filter((r: any) => r.status === 'available').length
      const occupiedCount = roomsData.filter((r: any) => r.status === 'occupied').length
      const pendingCount = jobsData.filter((j: any) => j.status === 'pending').length
      const completedCount = jobsData.filter((j: any) => j.status === 'completed').length

      setStats({
        totalProperties: props[2] || 0,
        totalRooms: rooms[2] || 0,
        totalTenancies: tenancies[2] || 0,
        activeViewings: viewings[1]?.length || 0,
        pendingJobs: pendingCount,
        completedJobs: completedCount,
        availableRooms: availableCount,
        occupiedRooms: occupiedCount,
        usersCount: users[2] || 0,
      })

      setLoading(false)
    }

    init()
  }, [router])

  if (loading) return <GenericPageSkeleton />;

  const occupancyRate = stats.totalRooms > 0
    ? Math.round((stats.occupiedRooms / stats.totalRooms) * 100)
    : 0

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin" />} />

      <main className="mx-auto max-w-6xl px-lg py-lg">
        {/* Header */}
        <div className="mb-3xl">
          <h1 className="text-3xl font-bold text-neutral-900">System Overview</h1>
          <p className="mt-sm text-sm text-neutral-600">
            Real-time snapshot of Capital Rooms platform status
          </p>
        </div>

        {/* KPIs */}
        <div className="grid gap-lg md:grid-cols-2 lg:grid-cols-4 mb-3xl">
          <KPICard label="Properties" value={stats.totalProperties} icon="🏢" />
          <KPICard label="Rooms" value={stats.totalRooms} icon="🚪" />
          <KPICard label="Tenancies" value={stats.totalTenancies} icon="👥" />
          <KPICard label="Users" value={stats.usersCount} icon="👤" />
        </div>

        {/* Occupancy & Activity */}
        <div className="grid gap-lg md:grid-cols-3 mb-3xl">
          <StatusCard
            title="Occupancy Rate"
            value={`${occupancyRate}%`}
            subtext={`${stats.occupiedRooms} of ${stats.totalRooms} occupied`}
            color="bg-blue-50 border-blue-200"
          />
          <StatusCard
            title="Available Now"
            value={stats.availableRooms}
            subtext="rooms ready to let"
            color="bg-green-50 border-green-200"
          />
          <StatusCard
            title="Upcoming Viewings"
            value={stats.activeViewings}
            subtext="scheduled this month"
            color="bg-purple-50 border-purple-200"
          />
        </div>

        {/* Maintenance & Jobs */}
        <div className="grid gap-lg md:grid-cols-2 mb-3xl">
          <div className="rounded-2xl border-2 border-neutral-200 bg-white p-lg">
            <h3 className="font-bold text-neutral-900 mb-md text-lg">Maintenance Jobs</h3>
            <div className="space-y-sm">
              <div className="flex items-center justify-between">
                <span className="text-neutral-700">Pending Approval</span>
                <span className="text-2xl font-bold text-yellow-600">{stats.pendingJobs}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-700">Completed This Month</span>
                <span className="text-2xl font-bold text-green-600">{stats.completedJobs}</span>
              </div>
              <div className="mt-md pt-md border-t border-neutral-200">
                <p className="text-xs text-neutral-500">
                  Completion rate: {stats.completedJobs > 0 ? '✓ On track' : 'No data yet'}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border-2 border-neutral-200 bg-white p-lg">
            <h3 className="font-bold text-neutral-900 mb-md text-lg">Platform Health</h3>
            <div className="space-y-md">
              <div className="flex items-center gap-md">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="text-sm text-neutral-700">All systems operational</span>
              </div>
              <div className="flex items-center gap-md">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="text-sm text-neutral-700">Database connected</span>
              </div>
              <div className="flex items-center gap-md">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="text-sm text-neutral-700">Notifications enabled</span>
              </div>
              <div className="mt-md pt-md border-t border-neutral-200">
                <p className="text-xs text-neutral-500">Last updated: just now</p>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="rounded-2xl border-2 border-neutral-200 bg-white p-lg">
          <h3 className="font-bold text-neutral-900 mb-md text-lg">Quick Actions</h3>
          <div className="grid gap-md md:grid-cols-2 lg:grid-cols-4">
            <QuickActionCard href="/admin/properties" icon="🏠" label="Add Property" />
            <QuickActionCard href="/admin/tenancies" icon="👥" label="Add Tenancy" />
            <QuickActionCard href="/admin/property-notes" icon="📝" label="Post Note" />
            <QuickActionCard href="/admin/compliance" icon="✅" label="Check Compliance" />
          </div>
        </div>
      </main>
    </div>
  )
}

function KPICard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="rounded-2xl border-2 border-neutral-200 bg-white p-lg text-center">
      <p className="text-4xl mb-md">{icon}</p>
      <p className="text-3xl font-bold text-neutral-900">{value}</p>
      <p className="text-xs text-neutral-500 uppercase tracking-wide mt-md">{label}</p>
    </div>
  )
}

function StatusCard({
  title,
  value,
  subtext,
  color,
}: {
  title: string
  value: string | number
  subtext: string
  color: string
}) {
  return (
    <div className={`rounded-2xl border-2 ${color} p-lg`}>
      <p className="text-xs font-bold text-neutral-600 uppercase">{title}</p>
      <p className="text-3xl font-bold text-neutral-900 mt-md">{value}</p>
      <p className="text-xs text-neutral-600 mt-md">{subtext}</p>
    </div>
  )
}

function QuickActionCard({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <a href={href}>
      <div className="rounded-lg border-2 border-neutral-200 bg-neutral-50 p-md hover:border-neutral-900 hover:shadow-md transition-all cursor-pointer text-center">
        <p className="text-3xl mb-md">{icon}</p>
        <p className="text-sm font-bold text-neutral-900">{label}</p>
      </div>
    </a>
  )
}
