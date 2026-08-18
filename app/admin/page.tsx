'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { signOut } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import EnableNotifications from '@/app/components/EnableNotifications'
import { AdminDashboardSkeleton } from '@/app/components/SkeletonLoading'

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
          <div>
            <h2 className="text-xl font-semibold text-neutral-900 mb-md">
              Welcome, Administrator
            </h2>
            <p className="text-base text-neutral-600">
              Logged in as: <span className="font-medium">{user?.email}</span>
            </p>
          </div>

          <EnableNotifications />

          {/* Safe-mode banner: tenant/applicant messaging on/off. */}
          {commsLive !== null && (
            commsLive ? (
              <div className="rounded-2xl border-2 border-green-300 bg-green-50 p-lg">
                <h3 className="font-bold text-green-800">🔔 Tenant notifications are LIVE</h3>
                <p className="mt-xs text-sm text-green-900">
                  Tenants and applicants will receive push, email and SMS from actions in the app.
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-lg">
                <h3 className="font-bold text-amber-800">🔕 Safe mode — tenant notifications are paused</h3>
                <p className="mt-xs text-sm text-amber-900">
                  You can add properties, tenants and real data freely — no tenant or applicant will be
                  messaged. Staff (contractors, cleaners) still get their notifications. To go live, set
                  <span className="font-mono"> TENANT_COMMS_LIVE=true</span> in the hosting environment and redeploy.
                </p>
              </div>
            )
          )}

          {/* Compliance deadlines — stays here until the dates are updated. */}
          {alerts.length > 0 && (
            <div className="rounded-2xl border-2 border-red-300 bg-red-50 p-lg">
              <div className="flex items-center justify-between gap-md">
                <h3 className="font-bold text-red-800">
                  ⚠️ {alerts.length} compliance deadline{alerts.length > 1 ? 's' : ''} need attention
                </h3>
                <Link
                  href="/admin/compliance"
                  className="shrink-0 text-sm font-bold text-red-700 underline hover:text-red-900"
                >
                  Review →
                </Link>
              </div>
              <ul className="mt-md space-y-xs text-sm text-red-900">
                {alerts.slice(0, 8).map((a, i) => (
                  <li key={i}>
                    <span className="font-semibold">{a.property}</span> — {a.label}{' '}
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

          {/* Dashboard sections */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
            <SectionLink
              icon="📊"
              title="System Overview"
              href="/admin/overview"
              description="Real-time KPIs, occupancy rate, platform health, quick actions"
            />
            <SectionLink
              icon="🏢"
              title="Properties & Rooms"
              href="/admin/properties"
              description="Manage properties, rooms, licensing and compliance"
            />
            <SectionLink
              icon="🚪"
              title="Lettings"
              href="/admin/available-and-lettings"
              description="Occupied rooms and available properties — two tabs"
            />
            <SectionLink
              icon="📅"
              title="Appointments"
              href="/admin/appointments"
              description="Book landlord visits, contractors, cleaners, inspections — notify tenants"
            />
            <SectionLink
              icon="🔧"
              title="All Maintenance"
              href="/admin/maintenance"
              description="View and manage maintenance tickets across all properties"
            />
            <SectionLink
              icon="🛡️"
              title="Compliance"
              href="/admin/compliance"
              description="Certificates · Safety Checks · Dashboard — all compliance in one place"
            />
            <SectionLink
              icon="📁"
              title="Documents"
              href="/admin/documents"
              description="Upload, manage, and file — three tabs: Upload · Inbox · Pending Review"
            />
            <SectionLink
              icon="👥"
              title="People"
              href="/admin/people"
              description="Manage tenants, staff, landlords, and administrators — all in one place"
            />
          </div>
        </div>
      </main>
    </div>
  )
}

function Section({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="flex items-center gap-lg rounded-2xl border border-neutral-200 bg-white/60 p-lg">
      <div className="shrink-0 grid h-12 w-12 place-items-center rounded-xl bg-neutral-100 text-xl opacity-60">
        {icon}
      </div>
      <div className="min-w-0">
        <h3 className="text-base font-bold text-neutral-400">{title}</h3>
        <p className="mt-xs text-xs font-medium uppercase tracking-wide text-neutral-400">
          Coming soon
        </p>
      </div>
    </div>
  )
}

function SectionLink({
  icon,
  title,
  href,
  description,
}: {
  icon: string
  title: string
  href: string
  description: string
}) {
  return (
    <Link href={href} className="group block">
      <div className="flex items-start gap-md rounded-lg bg-white border border-neutral-200 p-md transition-all hover:border-neutral-300 hover:shadow-sm">
        <div className="shrink-0 text-2xl pt-sm">{icon}</div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
          <p className="mt-xs text-xs leading-relaxed text-neutral-600">{description}</p>
        </div>
      </div>
    </Link>
  )
}
