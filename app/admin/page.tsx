'use client'

import { useEffect, useState, Component, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { signOut } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import RoleGreeting from '@/app/components/RoleGreeting'
import EnableNotifications from '@/app/components/EnableNotifications'
import { AdminDashboardSkeleton } from '@/app/components/SkeletonLoading'
import ThreeDayCalendar from '@/app/components/ThreeDayCalendar'
import AdminAddAppointmentModal from '@/app/components/AdminAddAppointmentModal'
import AdminNotificationBell from '@/app/components/AdminNotificationBell'
import SignOutButton from '@/app/components/SignOutButton'

// ── Error boundary — catches any render crash and shows a readable message ────
class AdminErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-neutral-100 flex items-center justify-center p-xl">
          <div className="max-w-md w-full rounded-2xl border border-red-200 bg-white p-xl">
            <p className="text-lg font-bold text-red-700 mb-md">Admin dashboard failed to load</p>
            <p className="text-sm text-neutral-600 mb-lg">Please screenshot this and send it to the developer:</p>
            <pre className="text-xs bg-neutral-100 rounded-lg p-md overflow-auto text-neutral-800 whitespace-pre-wrap break-all">
              {this.state.error?.message || String(this.state.error)}
            </pre>
            <button
              onClick={() => window.location.href = '/admin'}
              className="mt-lg w-full rounded-xl bg-neutral-900 py-md text-sm font-semibold text-white"
            >
              Retry
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ── Dashboard tile groups ──────────────────────────────────────────────────────
// Tiles within each group are listed alphabetically; the sort below enforces it
// dynamically so any future addition lands in the right position automatically.
interface DashTile { emoji: string; name: string; desc: string; href: string }
interface DashGroup { id: string; emoji: string; name: string; summary: string; tiles: DashTile[] }

const DASH_GROUPS: DashGroup[] = [
  {
    id: 'financials',
    emoji: '💰',
    name: 'Financials',
    summary: 'Accounts, expenses, fees, and imported statements',
    tiles: [
      { emoji: '🏦', name: 'Agency Accounts',   desc: 'Rent ledger, landlord remittance, fee income, and arrears',             href: '/admin/accounts' },
      { emoji: '⚡', name: 'AutoLedger',         desc: 'BCC statements@ to auto-import expenses from email',                    href: '/admin/autoledger' },
      { emoji: '🏷️', name: 'Expense Review',    desc: 'Categorise unmatched landlord expense lines',                           href: '/admin/expense-review' },
      { emoji: '💵', name: 'Fee Income',          desc: 'Monthly management fee dashboard with YoY comparison',                  href: '/admin/income' },
      { emoji: '📥', name: 'Import Statements',  desc: 'Bulk import historical statements from accounting software',            href: '/admin/statements/import' },
    ],
  },
  {
    id: 'lettings',
    emoji: '🔑',
    name: 'Lettings Pipeline',
    summary: 'Available rooms, viewings, applicants, and send invites',
    tiles: [
      { emoji: '📋', name: 'Applicants',        desc: 'Track applicants from invite through to tenant conversion',              href: '/admin/applicants' },
      { emoji: '📨', name: 'Invite to Apply',   desc: 'Send an application link by email or SMS after a viewing',              href: '/admin/invite-to-apply' },
      { emoji: '🔑', name: 'Lettings',          desc: 'Available properties & viewings',                                        href: '/admin/available-and-lettings' },
    ],
  },
  {
    id: 'compliance',
    emoji: '✅',
    name: 'Compliance & Safety',
    summary: 'Fire door checks, tenant safety confirmations, SAR log',
    tiles: [
      { emoji: '✅', name: 'Compliance Logs',               desc: 'Fire door & smoke alarm checks',                             href: '/admin/compliance-logs' },
      { emoji: '🔐', name: 'Suspected Activity Reports',    desc: 'Internal SAR log — MLR 2017 / POCA 2002',                    href: '/admin/sar' },
      { emoji: '🧪', name: 'Tenant Safety Checks',          desc: 'Monitor fire door & smoke alarm confirmations',              href: '/admin/tenant-safety-checks' },
      { emoji: '📖', name: 'Tenant Guides',                 desc: 'Edit guide content, visibility, acknowledgment, and images',  href: '/admin/guides' },
    ],
  },
  {
    id: 'comms',
    emoji: '💬',
    name: 'Communications',
    summary: 'Message hub, templates, and quick-send to properties',
    tiles: [
      { emoji: '💬', name: 'Communications',     desc: 'Every message, filterable by type & property',                          href: '/admin/communications' },
      { emoji: '✉️', name: 'Message Templates', desc: 'All automated messages — triggers, recipients, channels',               href: '/admin/message-templates' },
      { emoji: '📢', name: 'Quick Notify',       desc: 'Send messages to properties & people instantly',                        href: '/admin/notify' },
    ],
  },
  {
    id: 'properties',
    emoji: '🏢',
    name: 'Properties & Units',
    summary: 'Property info, all rooms, and maintenance tickets',
    tiles: [
      { emoji: '⚡', name: 'AI File Scanner',     desc: 'AI extraction for documents & photos',                                 href: '/admin/ai-upload' },
      { emoji: '🏠', name: 'All Units',          desc: 'View & manage all rooms across every property',                         href: '/admin/active-rooms' },
      { emoji: '🧹', name: 'Cleaning',            desc: 'Move-out clean assignments — pending, accepted, completed & declined', href: '/admin/cleaner-jobs' },
      { emoji: '🔧', name: 'Maintenance',        desc: 'All maintenance tickets',                                               href: '/admin/maintenance' },
      { emoji: '🏢', name: 'Property Info',      desc: 'Details, floor plans, compliance',                                      href: '/admin/properties' },
      { emoji: '📋', name: 'Property Tasks',     desc: 'Internal to-dos, cert deadlines, and task-to-ticket conversions',       href: '/admin/property-tasks' },
    ],
  },
  {
    id: 'people',
    emoji: '👥',
    name: 'Contacts',
    summary: 'Tenants, staff, contractors, and landlords',
    tiles: [
      { emoji: '👥', name: 'People',             desc: 'Tenants, staff, contractors, landlords',                                href: '/admin/people' },
    ],
  },
]

// Sort tiles within every group alphabetically (so future additions land correctly)
DASH_GROUPS.forEach(g => g.tiles.sort((a, b) => a.name.localeCompare(b.name)))
// Sort the groups themselves alphabetically
DASH_GROUPS.sort((a, b) => a.name.localeCompare(b.name))

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

interface KpiData {
  properties:     number
  availableRooms: number
  openTasks:      number
  openJobs:       number
  viewingsWeek:   number
}

function AdminDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [adminName, setAdminName] = useState('')
  const [loading, setLoading] = useState(true)
  const [alerts, setAlerts] = useState<CertAlert[]>([])
  const [kpi, setKpi] = useState<KpiData>({ properties: 0, availableRooms: 0, openTasks: 0, openJobs: 0, viewingsWeek: 0 })
  const [commsLive, setCommsLive] = useState<boolean | null>(null)
  const [showAddAppointmentModal, setShowAddAppointmentModal] = useState(false)
  const [calendarSlotDate, setCalendarSlotDate] = useState('')
  const [calendarSlotTime, setCalendarSlotTime] = useState('')
  const [calendarExpanded, setCalendarExpanded] = useState(false)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})

  function toggleGroup(id: string) {
    setOpenGroups(prev => ({ ...prev, [id]: !prev[id] }))
  }

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
        const p = data.assignment as any
        setAdminName(p.first_name || p.name || data.user?.email?.split('@')[0] || '')

        // Is tenant/applicant messaging live? Drives the safe-mode banner.
        fetch('/api/comms-status').then((r) => r.json()).then((d) => setCommsLive(!!d.live)).catch(() => {})

        // Load KPI data + compliance alerts in parallel
        try {
          const supabase = createClient()
          const today = new Date(); today.setHours(0,0,0,0)

          // Week bounds for viewings
          const weekStart = today.toISOString().split('T')[0]
          const weekEnd = new Date(today.getTime() + 7 * 86400000).toISOString().split('T')[0]

          const [propsRes, roomsRes, tasksRes, jobsRes, viewingsRes] = await Promise.all([
            supabase.from('properties').select('id, name, gas_safe_cert_expiry, electrical_cert_expiry, license_expiry, insurance_expiry, fire_detection_expiry, emergency_lighting_expiry, pat_test_expiry, fire_risk_assessment_expiry', { count: 'exact' }),
            supabase.from('rooms').select('id', { count: 'exact' }).eq('status', 'available'),
            supabase.from('property_tasks').select('id', { count: 'exact' }).eq('status', 'open'),
            supabase.from('maintenance_tickets').select('id', { count: 'exact' }).not('status', 'in', '("completed","closed","cancelled")'),
            supabase.from('viewings').select('id', { count: 'exact' }).gte('viewing_date', weekStart).lte('viewing_date', weekEnd),
          ])

          setKpi({
            properties:     propsRes.count     ?? 0,
            availableRooms: roomsRes.count      ?? 0,
            openTasks:      tasksRes.count      ?? 0,
            openJobs:       jobsRes.count       ?? 0,
            viewingsWeek:   viewingsRes.count   ?? 0,
          })

          // Compliance alerts — anything within 14 days or overdue
          const list: CertAlert[] = []
          for (const p of propsRes.data || []) {
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
          <div className="flex items-center gap-md">
            <AdminNotificationBell />
            <SignOutButton onSignOut={handleSignOut} />
          </div>
        }
      />

      <main className="mx-auto max-w-6xl px-lg py-2xl">
        <div className="space-y-3xl">
          {/* Greeting - shared across every role dashboard */}
          <RoleGreeting role="Admin Dashboard" name={adminName} subtitle="Here's what's happening across your properties." />

          <EnableNotifications />

          {/* ── KPI strip ─────────────────────────────────────────────── */}
          <div className="flex gap-sm overflow-x-auto pb-1 -mx-lg px-lg sm:mx-0 sm:px-0 sm:grid sm:grid-cols-5">
            {[
              { label: 'Properties',      value: kpi.properties,     bad: false,                              href: '/admin/active-rooms' },
              { label: 'Available rooms', value: kpi.availableRooms, bad: kpi.availableRooms === 0,           href: '/admin/available-and-lettings' },
              { label: 'Open tasks',      value: kpi.openTasks,      bad: kpi.openTasks > 0,                  href: '/admin/property-tasks' },
              { label: 'Open jobs',       value: kpi.openJobs,       bad: kpi.openJobs > 0,                   href: '/admin/maintenance' },
              { label: 'Viewings / week', value: kpi.viewingsWeek,   bad: false,                              href: '/admin/available-and-lettings' },
            ].map(k => (
              <Link key={k.label} href={k.href} className="block shrink-0 sm:shrink w-[calc(20vw-12px)] min-w-[72px] sm:w-auto">
                <div className="rounded-xl bg-neutral-900 border border-neutral-800 p-md hover:border-neutral-700 transition-colors cursor-pointer h-full">
                  <p className={`text-3xl font-black tabular-nums ${k.bad ? 'text-red-400' : 'text-white'}`}>{k.value}</p>
                  <p className="text-xs font-medium text-white/40 mt-xs leading-tight">{k.label}</p>
                </div>
              </Link>
            ))}
          </div>

          {/* 3-Day Calendar with Toggle */}
          <div className="flex items-center justify-between gap-lg mb-lg">
            <button
              onClick={() => setCalendarExpanded(!calendarExpanded)}
              className="flex items-center gap-md hover:opacity-80 transition-opacity"
            >
              <span className="text-lg font-semibold text-neutral-900">
                {calendarExpanded ? '📅' : '📅'} Calendar
              </span>
              <span className="text-xs text-neutral-600">
                {calendarExpanded ? '▼ Hide' : '▶ Show'}
              </span>
            </button>
            <button
              onClick={() => setShowAddAppointmentModal(true)}
              className="rounded-lg bg-blue-600 px-lg py-md text-sm font-bold text-white hover:bg-blue-700"
            >
              + Add Appointment
            </button>
          </div>

          {calendarExpanded && (
            <ThreeDayCalendar
              appointments={[]}
              role="admin"
              onAppointmentClick={() => router.push('/admin/appointments')}
              onSlotTap={(date, time) => {
                setCalendarSlotDate(date)
                setCalendarSlotTime(time)
                setShowAddAppointmentModal(true)
              }}
            />
          )}

          {/* Demo Mode Banner - Tenants NOT receiving notifications */}
          <div className="rounded-lg border-2 border-neutral-300 bg-neutral-50 p-lg">
            <h3 className="font-semibold text-neutral-900">🚧 Demo Mode</h3>
            <p className="mt-sm text-sm text-neutral-700">
              Tenants are <strong>not currently receiving notifications</strong>. This is a demo environment. When live, all tenant communications will be sent via email and push notifications.
            </p>
          </div>

          {/* Compliance Alerts */}
          {alerts.length > 0 && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-lg">
              <div className="flex items-center justify-between gap-lg mb-md">
                <h3 className="font-semibold text-white">
                  ⚠️ {alerts.length} compliance deadline{alerts.length > 1 ? 's' : ''} need attention
                </h3>
                <Link
                  href="/admin/property-tasks"
                  className="text-sm font-semibold text-red-400 hover:text-red-300 underline whitespace-nowrap"
                >
                  View all & book →
                </Link>
              </div>
              <ul className="space-y-xs text-sm text-neutral-400">
                {alerts.slice(0, 6).map((a, i) => (
                  <li key={i} className="flex items-center gap-sm">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${a.days < 0 ? 'bg-red-500' : 'bg-amber-400'}`} />
                    <span className="font-medium text-neutral-200">{a.property}</span> — {a.label}
                    <span className={`font-bold ml-auto pl-sm ${a.days < 0 ? 'text-red-400' : 'text-amber-400'}`}>
                      {a.days < 0
                        ? `${Math.abs(a.days)}d overdue`
                        : a.days === 0 ? 'today'
                        : `${a.days}d`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Quick-access standalone tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-sm">
            <Link href="/admin/property-tasks" className="block group">
              <div className="rounded-xl border border-violet-200 bg-violet-50 px-lg py-md flex items-center gap-md hover:border-violet-300 hover:bg-violet-100 transition-colors h-full">
                <span className="text-2xl leading-none">📋</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-sm">
                    <h3 className="text-sm font-semibold text-violet-900">Property Tasks</h3>
                    {kpi.openTasks > 0 && (
                      <span className="text-xs font-bold bg-violet-200 text-violet-800 px-xs py-0.5 rounded-full">{kpi.openTasks} open</span>
                    )}
                  </div>
                  <p className="text-xs text-violet-600 mt-0.5">To-dos, cert deadlines, task → ticket</p>
                </div>
                <span className="text-violet-400 group-hover:text-violet-600 transition-colors shrink-0">→</span>
              </div>
            </Link>

            <Link href="/admin/new-business" className="block group">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-lg py-md flex items-center gap-md hover:border-emerald-300 hover:bg-emerald-100 transition-colors h-full">
                <span className="text-2xl leading-none">🏗</span>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-emerald-900">New Business</h3>
                  <p className="text-xs text-emerald-600 mt-0.5">Valuations, welcome packs, onboarding</p>
                </div>
                <span className="text-emerald-400 group-hover:text-emerald-600 transition-colors shrink-0">→</span>
              </div>
            </Link>

            <Link href="/admin/planner" className="block group">
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-lg py-md flex items-center gap-md hover:border-blue-300 hover:bg-blue-100 transition-colors h-full">
                <span className="text-2xl leading-none">🗓</span>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-blue-900">Planner</h3>
                  <p className="text-xs text-blue-600 mt-0.5">Schedule, diary, and upcoming work</p>
                </div>
                <span className="text-blue-400 group-hover:text-blue-600 transition-colors shrink-0">→</span>
              </div>
            </Link>
          </div>

          {/* ── Grouped accordion dashboard ──────────────────────────────── */}
          <div className="space-y-sm">

            {/* Category accordion groups */}
            {DASH_GROUPS.map(group => {
              const isOpen = !!openGroups[group.id]
              return (
                <div key={group.id} className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
                  {/* Group header — click to toggle */}
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    className="w-full flex items-center gap-md px-lg py-md text-left hover:bg-neutral-50 transition-colors"
                  >
                    <span className="text-xl leading-none shrink-0">{group.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-sm">
                        <h3 className="text-sm font-semibold text-neutral-900">{group.name}</h3>
                        <span className="text-[11px] font-medium bg-neutral-100 text-neutral-500 px-xs py-0.5 rounded-full leading-none">
                          {group.tiles.length}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-500 mt-0.5 truncate">{group.summary}</p>
                    </div>
                    <span className={`shrink-0 text-neutral-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </span>
                  </button>

                  {/* Revealed tiles */}
                  {isOpen && (
                    <div className="border-t border-neutral-100 px-lg pb-lg pt-md grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-md">
                      {group.tiles.map(tile => (
                        <Link key={tile.href} href={tile.href} className="group/tile block">
                          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-md transition-all hover:border-neutral-300 hover:bg-white hover:shadow-sm">
                            <div className="text-xl mb-xs">{tile.emoji}</div>
                            <h4 className="text-sm font-semibold text-neutral-900 mb-xs">{tile.name}</h4>
                            <p className="text-xs text-neutral-500 leading-snug">{tile.desc}</p>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

          </div>

          {/* Profile / settings — gear icon, bottom-left, aligned with left edge of tiles */}
          <div className="flex items-start">
            <Link
              href="/admin/profile"
              title="Profile settings"
              className="flex items-center justify-center w-9 h-9 rounded-full border border-neutral-300 bg-white hover:bg-neutral-50 hover:border-neutral-400 transition-colors text-neutral-500 hover:text-neutral-700"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 10a2 2 0 100-4 2 2 0 000 4z" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M13.2 8c0-.3 0-.6-.1-.9l1.4-1.1-1.2-2-1.7.7a5 5 0 00-1.6-.9L9.6 2H6.4l-.4 1.8a5 5 0 00-1.6.9L2.7 4l-1.2 2 1.4 1.1c0 .3-.1.6-.1.9s0 .6.1.9L1.5 10l1.2 2 1.7-.7c.5.4 1 .7 1.6.9l.4 1.8h3.2l.4-1.8c.6-.2 1.1-.5 1.6-.9l1.7.7 1.2-2-1.4-1.1c.1-.3.1-.6.1-.9z" stroke="currentColor" strokeWidth="1.4"/>
              </svg>
            </Link>
          </div>
        </div>

        {/* Add Appointment Modal */}
        <AdminAddAppointmentModal
          isOpen={showAddAppointmentModal}
          initialDate={calendarSlotDate || undefined}
          initialTime={calendarSlotTime || undefined}
          onClose={() => { setShowAddAppointmentModal(false); setCalendarSlotDate(''); setCalendarSlotTime('') }}
          onSuccess={() => {
            // Refresh appointments if needed
            setShowAddAppointmentModal(false)
          }}
        />
      </main>
    </div>
  )
}

// Wrap with error boundary so any iOS crash shows a readable message
export default function AdminDashboardWithBoundary() {
  return (
    <AdminErrorBoundary>
      <AdminDashboard />
    </AdminErrorBoundary>
  )
}
