'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { signOut } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import RoleGreeting from '@/app/components/RoleGreeting'
import EnableNotifications from '@/app/components/EnableNotifications'
import { AdminDashboardSkeleton } from '@/app/components/SkeletonLoading'
import TodayAppointmentsMap from '@/app/components/TodayAppointmentsMap'
import ThreeDayCalendar from '@/app/components/ThreeDayCalendar'

// Compliance expiry dates that must never lapse.
const CERT_CHECKS: { field: string; label: string }[] = [
  { field: 'gas_safe_cert_expiry',        label: 'Gas safety' },
  { field: 'electrical_cert_expiry',      label: 'Electrical (EICR)' },
  { field: 'license_expiry',              label: 'HMO licence' },
  { field: 'insurance_expiry',            label: 'Insurance' },
  { field: 'fire_detection_expiry',       label: 'Fire detection' },
  { field: 'emergency_lighting_expiry',   label: 'Emergency lighting' },
  { field: 'pat_test_expiry',             label: 'PAT test' },
  { field: 'fire_risk_assessment_expiry', label: 'Fire risk assessment' },
]

interface CertAlert {
  property: string
  label: string
  days: number
}

export default function AdminDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [adminName, setAdminName] = useState('')
  const [loading, setLoading] = useState(true)
  const [alerts, setAlerts] = useState<CertAlert[]>([])
  const [commsLive, setCommsLive] = useState<boolean | null>(null)

  useEffect(() => {
    async function checkAuth() {
      try {
        const data = await getCurrentUser()

        if (!data) {
          router.push('/login')
          return
        }

        if (data.assignment?.role !== 'administrator' && data.assignment?.role !== 'admin') {
          console.warn('User is not an administrator:', data.assignment?.role)
          router.push('/login')
          return
        }

        setUser(data.user)
        setAdminName((data.assignment as any)?.full_name || data.user?.email?.split('@')[0] || '')

        // Is tenant/applicant messaging live? Drives the safe-mode banner.
        fetch('/api/comms-status').then((r) => r.json()).then((d) => setCommsLive(!!d.live)).catch(() => {})

        // Compliance deadlines for the alert banner — anything within 14 days or overdue.
        try {
          const supabase = createClient()
          const { data: props } = await supabase
            .from('properties')
            .select(
              'id, name, gas_safe_cert_expiry, electrical_cert_expiry, license_expiry, insurance_expiry, fire_detection_expiry, emergency_lighting_expiry, pat_test_expiry, fire_risk_assessment_expiry'
            )
          const today = new Date()
          today.setHours(0, 0, 0, 0)
          const list: CertAlert[] = []
          for (const p of props || []) {
            for (const c of CERT_CHECKS) {
              const raw = (p as any)[c.field]
              if (!raw) continue
              const d = new Date(raw)
              const days = Math.floor((d.getTime() - today.getTime()) / 86400000)
              if (days <= 14) list.push({ property: p.name, label: c.label, days })
            }
          }
          list.sort((a, b) => a.days - b.days)
          setAlerts(list)
        } catch {
          /* non-fatal */
        }

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
          {/* Greeting - shared across every role dashboard */}
          <RoleGreeting role="Admin Dashboard" name={adminName} subtitle="Here's what's happening across your properties." />

          <EnableNotifications />

          {/* 3-Day Calendar */}
          <ThreeDayCalendar
            appointments={[]}
            role="admin"
            onAppointmentClick={(appt) => {
              router.push(`/admin/appointments`)
            }}
          />

          {/* Demo Mode Banner - Tenants NOT receiving notifications */}
          <div className="rounded-lg border-2 border-neutral-300 bg-neutral-50 p-lg">
            <h3 className="font-semibold text-neutral-900">🚧 Demo Mode</h3>
            <p className="mt-sm text-sm text-neutral-700">
              Tenants are <strong>not currently receiving notifications</strong>. This is a demo environment. When live, all tenant communications will be sent via email and push notifications.
            </p>
          </div>

          {/* Compliance Alerts */}
          {alerts.length > 0 && (
            <div className="rounded-lg border border-neutral-300 bg-white p-lg">
              <div className="flex items-center justify-between gap-lg mb-lg">
                <h3 className="font-semibold text-neutral-900">
                  ⚠️ {alerts.length} compliance deadline{alerts.length > 1 ? 's' : ''} need attention
                </h3>
                <Link
                  href="/admin/properties"
                  className="text-sm font-semibold text-neutral-600 hover:text-neutral-900 underline"
                >
                  Review →
                </Link>
              </div>
              <ul className="space-y-xs text-sm text-neutral-700">
                {alerts.slice(0, 8).map((a, i) => (
                  <li key={i}>
                    <span className="font-medium">{a.property}</span> — {a.label}{' '}
                    {a.days < 0
                      ? `expired ${Math.abs(a.days)} day${Math.abs(a.days) !== 1 ? 's' : ''} ago`
                      : a.days === 0
                      ? 'expires today'
                      : `expires in ${a.days} day${a.days !== 1 ? 's' : ''}`}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Dashboard Tiles */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-lg">
            {/* Quick Notify */}
            <Link href="/admin/notify" className="group">
              <div className="rounded-lg border border-neutral-200 bg-white p-lg transition-all hover:border-neutral-300 hover:shadow-sm">
                <div className="text-2xl mb-md">📢</div>
                <h3 className="text-sm font-semibold text-neutral-900 mb-xs">Quick Notify</h3>
                <p className="text-xs text-neutral-600">Send messages to properties & people instantly</p>
              </div>
            </Link>

            {/* AI File Upload */}
            <Link href="/admin/ai-upload" className="group">
              <div className="rounded-lg border border-neutral-200 bg-white p-lg transition-all hover:border-neutral-300 hover:shadow-sm">
                <div className="text-2xl mb-md">📁</div>
                <h3 className="text-sm font-semibold text-neutral-900 mb-xs">AI File Upload</h3>
                <p className="text-xs text-neutral-600">AI extraction for documents & photos</p>
              </div>
            </Link>

            {/* All Units */}
            <Link href="/admin/active-rooms" className="group">
              <div className="rounded-lg border border-neutral-200 bg-white p-lg transition-all hover:border-neutral-300 hover:shadow-sm">
                <div className="text-2xl mb-md">📋</div>
                <h3 className="text-sm font-semibold text-neutral-900 mb-xs">All Units</h3>
                <p className="text-xs text-neutral-600">View & manage all rooms</p>
              </div>
            </Link>

            {/* Property Info */}
            <Link href="/admin/properties" className="group">
              <div className="rounded-lg border border-neutral-200 bg-white p-lg transition-all hover:border-neutral-300 hover:shadow-sm">
                <div className="text-2xl mb-md">🏢</div>
                <h3 className="text-sm font-semibold text-neutral-900 mb-xs">Property Info</h3>
                <p className="text-xs text-neutral-600">Details, floor plans, compliance</p>
              </div>
            </Link>

            {/* Maintenance */}
            <Link href="/admin/maintenance" className="group">
              <div className="rounded-lg border border-neutral-200 bg-white p-lg transition-all hover:border-neutral-300 hover:shadow-sm">
                <div className="text-2xl mb-md">🔧</div>
                <h3 className="text-sm font-semibold text-neutral-900 mb-xs">Maintenance</h3>
                <p className="text-xs text-neutral-600">All maintenance tickets</p>
              </div>
            </Link>

            {/* People */}
            <Link href="/admin/people" className="group">
              <div className="rounded-lg border border-neutral-200 bg-white p-lg transition-all hover:border-neutral-300 hover:shadow-sm">
                <div className="text-2xl mb-md">👥</div>
                <h3 className="text-sm font-semibold text-neutral-900 mb-xs">People</h3>
                <p className="text-xs text-neutral-600">Tenants, staff, contractors, landlords</p>
              </div>
            </Link>

            {/* Lettings */}
            <Link href="/admin/available-and-lettings" className="group">
              <div className="rounded-lg border border-neutral-200 bg-white p-lg transition-all hover:border-neutral-300 hover:shadow-sm">
                <div className="text-2xl mb-md">🔑</div>
                <h3 className="text-sm font-semibold text-neutral-900 mb-xs">Lettings</h3>
                <p className="text-xs text-neutral-600">Available properties & viewings</p>
              </div>
            </Link>

            {/* Communications Hub — central, view-only, filterable feed of every
                message across the platform (built 26 Aug). */}
            <Link href="/admin/communications" className="group">
              <div className="rounded-lg border border-neutral-200 bg-white p-lg transition-all hover:border-neutral-300 hover:shadow-sm">
                <div className="text-2xl mb-md">💬</div>
                <h3 className="text-sm font-semibold text-neutral-900 mb-xs">Communications</h3>
                <p className="text-xs text-neutral-600">Every message, filterable by type & property</p>
              </div>
            </Link>

            {/* Compliance Logs */}
            <Link href="/admin/compliance-logs" className="group">
              <div className="rounded-lg border border-neutral-200 bg-white p-lg transition-all hover:border-neutral-300 hover:shadow-sm">
                <div className="text-2xl mb-md">📋</div>
                <h3 className="text-sm font-semibold text-neutral-900 mb-xs">Compliance Logs</h3>
                <p className="text-xs text-neutral-600">Fire door & smoke alarm checks</p>
              </div>
            </Link>

            {/* Tenant Safety Checks */}
            <Link href="/admin/tenant-safety-checks" className="group">
              <div className="rounded-lg border border-neutral-200 bg-white p-lg transition-all hover:border-neutral-300 hover:shadow-sm">
                <div className="text-2xl mb-md">🧪</div>
                <h3 className="text-sm font-semibold text-neutral-900 mb-xs">Tenant Safety Checks</h3>
                <p className="text-xs text-neutral-600">Monitor fire door & smoke alarm confirmations</p>
              </div>
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
