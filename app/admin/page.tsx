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

// Compliance dates that must never lapse. Test dates renew annually, so their
// deadline is the test date + 1 year.
const CERT_CHECKS: { field: string; label: string; addYear?: boolean }[] = [
  { field: 'gas_safe_cert_expiry', label: 'Gas safety' },
  { field: 'electrical_cert_expiry', label: 'Electrical (EICR)' },
  { field: 'license_expiry', label: 'HMO licence' },
  { field: 'insurance_expiry', label: 'Insurance' },
  { field: 'fire_detection_test_date', label: 'Fire detection', addYear: true },
  { field: 'emergency_lighting_test_date', label: 'Emergency lighting', addYear: true },
  { field: 'pat_test_date', label: 'PAT test', addYear: true },
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
              'id, name, gas_safe_cert_expiry, electrical_cert_expiry, license_expiry, insurance_expiry, fire_detection_test_date, emergency_lighting_test_date, pat_test_date'
            )
          const today = new Date()
          today.setHours(0, 0, 0, 0)
          const list: CertAlert[] = []
          for (const p of props || []) {
            for (const c of CERT_CHECKS) {
              const raw = (p as any)[c.field]
              if (!raw) continue
              const d = new Date(raw)
              if (c.addYear) d.setFullYear(d.getFullYear() + 1)
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
              icon="🔑"
              title="Availability"
              href="/admin/available-and-lettings"
              description="Available rooms by date, applications and move-ins"
            />
            <SectionLink
              icon="🏢"
              title="Properties & Rooms"
              href="/admin/properties"
              description="Manage properties, rooms, licensing and compliance"
            />
            <SectionLink
              icon="👥"
              title="Tenancies"
              href="/admin/tenancies"
              description="Assign tenants to rooms and set notification preferences"
            />
            <SectionLink
              icon="📝"
              title="Property Notes"
              href="/admin/property-notes"
              description="Post updates to tenant dashboards — cleaning, announcements"
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
              description="Track certifications, expiry dates and compliance status"
            />
            <SectionLink
              icon="🚪"
              title="Tenant Safety Checks"
              href="/admin/tenant-safety-checks"
              description="Monitor fire door and smoke alarm check responses"
            />
            <SectionLink
              icon="📊"
              title="Property Compliance Dashboard"
              href="/admin/property-compliance-dashboard"
              description="View all tenant checks by room and month, request photos from all tenants"
            />
            <SectionLink
              icon="✨"
              title="AI Document Upload"
              href="/admin/ai-upload"
              description="Upload a certificate, tenancy or reference — AI files it for you"
            />
            <SectionLink
              icon="📥"
              title="Document Inbox"
              href="/admin/inbox"
              description="Docs forwarded by email — review the AI's ruling and file them"
            />
            <SectionLink
              icon="📄"
              title="Documents Pending Review"
              href="/admin/documents"
              description="Extracted document data awaiting property approval + filing"
            />
            <SectionLink
              icon="👷"
              title="Contacts"
              href="/admin/people"
              description="Add, edit and manage contractors and cleaners"
            />
            <SectionLink
              icon="🤝"
              title="Landlords"
              href="/admin/landlords"
              description="Invite landlords and assign properties to them"
            />
            <SectionLink
              icon="📑"
              title="Landlord Statements"
              href="/admin/statements"
              description="Upload or enter statements — auto-matched to each property"
            />
            <Section icon="📅" title="Property Visits" />
            <Section icon="📢" title="House Notices" />
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
      <div className="flex items-center gap-lg rounded-2xl border border-neutral-200 bg-white p-lg shadow-sm transition-all hover:-translate-y-0.5 hover:border-neutral-900/20 hover:shadow-lg">
        <div className="shrink-0 grid h-12 w-12 place-items-center rounded-xl bg-neutral-100 text-xl transition-colors group-hover:bg-neutral-900">
          <span className="transition-transform group-hover:scale-110">{icon}</span>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-neutral-900">{title}</h3>
          <p className="mt-xs text-sm leading-snug text-neutral-500">{description}</p>
        </div>
        <span className="shrink-0 text-lg text-neutral-300 transition-all group-hover:translate-x-1 group-hover:text-neutral-900">
          →
        </span>
      </div>
    </Link>
  )
}
