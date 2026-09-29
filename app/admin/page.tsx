'use client'

import { useEffect, useState, Component, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import AdminAddAppointmentModal from '@/app/components/AdminAddAppointmentModal'
import MobileToday from './components/MobileToday'
import { pendingLicenceIds } from '@/lib/compliance/hmoLicence'

// ── Error boundary ─────────────────────────────────────────────────────────────
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
            <pre className="text-xs bg-neutral-100 rounded-lg p-md overflow-auto text-neutral-800 whitespace-pre-wrap break-all">
              {this.state.error?.message || String(this.state.error)}
            </pre>
            <button onClick={() => window.location.href = '/admin'}
              className="mt-lg w-full rounded-xl bg-neutral-900 py-md text-sm font-semibold text-white">Retry</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ── Compliance cert fields ─────────────────────────────────────────────────────
const CERT_CHECKS = [
  { field: 'gas_safe_cert_expiry',        label: 'Gas safety' },
  { field: 'electrical_cert_expiry',      label: 'Electrical (EICR)' },
  { field: 'license_expiry',              label: 'HMO licence' },
  { field: 'insurance_expiry',            label: 'Insurance' },
  { field: 'fire_detection_expiry',       label: 'Fire detection' },
  { field: 'emergency_lighting_expiry',   label: 'Emergency lighting' },
  { field: 'pat_test_expiry',             label: 'PAT test' },
  { field: 'fire_risk_assessment_expiry', label: 'Fire risk assessment' },
]

// ── Types ──────────────────────────────────────────────────────────────────────
interface ActionItem {
  key:      string
  priority: 'red' | 'amber' | 'blue'
  text:     string
  sub:      string
  href:     string
  cta:      string
}

interface PropertyRow {
  id:             string
  name:           string
  address:        string
  totalRooms:     number
  occupiedRooms:  number
  compBadge:      'ok' | 'warn' | 'overdue'
  compLabel:      string
  openJobs:       number
}

interface DaySlot {
  label: string   // "TODAY · MON 15"
  date:  string   // ISO date "2026-09-15"
  events: { time: string; text: string; type: 'viewing' | 'maintenance' | 'other' }[]
}

// ── Dashboard ──────────────────────────────────────────────────────────────────
function AdminDashboard() {
  const router = useRouter()
  const [adminName, setAdminName] = useState('')
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [commsLive, setCommsLive] = useState<boolean | null>(null)

  // KPI
  const [kpiProperties,    setKpiProperties]    = useState(0)
  const [kpiAvailRooms,    setKpiAvailRooms]    = useState(0)
  const [kpiActiveTen,     setKpiActiveTen]     = useState(0)
  const [kpiUrgent,        setKpiUrgent]        = useState(0)

  // Sections
  const [actions,    setActions]    = useState<ActionItem[]>([])
  const [portfolio,  setPortfolio]  = useState<PropertyRow[]>([])
  const [days,       setDays]       = useState<DaySlot[]>([])

  useEffect(() => {
    async function load() {
      const data = await getCurrentUser()
      if (!data || (data.assignment?.role !== 'administrator' && data.assignment?.role !== 'admin')) {
        router.push('/login')
        return
      }

      const p = data.assignment as any
      setAdminName(p.first_name || p.name || data.user?.email?.split('@')[0] || '')

      fetch('/api/comms-status').then(r => r.json()).then(d => setCommsLive(!!d.live)).catch(() => {})

      const supabase = createClient()
      const today = new Date(); today.setHours(0, 0, 0, 0)
      const todayStr = today.toISOString().split('T')[0]
      const in4days  = new Date(today.getTime() + 4 * 86400000).toISOString().split('T')[0]

      try {
        const [propsRes, roomsRes, tenRes, jobsRes, viewingsRes, apptRes] = await Promise.all([
          // Properties with compliance dates + room count + job count
          supabase.from('properties').select(
            'id, name, address, gas_safe_cert_expiry, electrical_cert_expiry, license_expiry, insurance_expiry, fire_detection_expiry, emergency_lighting_expiry, pat_test_expiry, fire_risk_assessment_expiry'
          ),
          // Rooms with status + property_id
          supabase.from('rooms').select('id, property_id, status'),
          // Active tenancies (no end date or future end date)
          supabase.from('tenancies').select('id', { count: 'exact' }).or(`end_date.is.null,end_date.gte.${todayStr}`),
          // Open jobs per property (through room → property)
          supabase.from('maintenance_tickets').select('id, property_id').not('status', 'in', '("completed","closed","cancelled")'),
          // Viewings this week
          supabase.from('viewings').select('id, viewing_date, viewing_slot, rooms(name, properties(name))').gte('viewing_date', todayStr).lte('viewing_date', in4days).order('viewing_date').order('viewing_slot'),
          // Appointments in next 4 days
          supabase.from('admin_appointments').select('id, appointment_date, appointment_time, appointment_slot, title, appointment_type, type, properties(name)').gte('appointment_date', todayStr).lte('appointment_date', in4days).order('appointment_date').order('appointment_time'),
        ])

        // ── KPIs ──
        const props = propsRes.data || []
        setKpiProperties(props.length)

        const rooms = roomsRes.data || []
        setKpiAvailRooms(rooms.filter(r => r.status === 'available').length)

        setKpiActiveTen(tenRes.count || 0)

        // ── Compliance alerts → action items + urgent count ──
        const actionList: ActionItem[] = []
        let urgentCount = 0
        const licencePending = await pendingLicenceIds(supabase)   // application with the council → not urgent

        for (const prop of props) {
          for (const c of CERT_CHECKS) {
            const raw = (prop as any)[c.field]
            if (!raw) continue
            if (c.field === 'license_expiry' && licencePending.has(prop.id)) continue
            const expiry = new Date(raw)
            const days = Math.floor((expiry.getTime() - today.getTime()) / 86400000)
            if (days > 14) continue
            urgentCount++
            const priority = days < 0 ? 'red' : days <= 7 ? 'amber' : 'blue'
            const daysText = days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'today' : `in ${days}d`
            actionList.push({
              key:      `cert-${prop.id}-${c.field}`,
              priority,
              text:     `${c.label} — ${prop.name}`,
              sub:      `Compliance · expires ${expiry.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · ${daysText}`,
              href:     `/admin/property-compliance-dashboard`,
              cta:      'View cert →',
            })
          }
        }

        setKpiUrgent(urgentCount)
        setActions(actionList.sort((a, b) => {
          const order = { red: 0, amber: 1, blue: 2 }
          return order[a.priority] - order[b.priority]
        }))

        // ── Portfolio table ──
        const jobs = jobsRes.data || []
        const jobsByProp: Record<string, number> = {}
        for (const j of jobs) {
          if (j.property_id) jobsByProp[j.property_id] = (jobsByProp[j.property_id] || 0) + 1
        }

        const roomsByProp: Record<string, { total: number; occupied: number }> = {}
        for (const r of rooms) {
          if (!r.property_id) continue
          if (!roomsByProp[r.property_id]) roomsByProp[r.property_id] = { total: 0, occupied: 0 }
          roomsByProp[r.property_id].total++
          if (r.status === 'occupied') roomsByProp[r.property_id].occupied++
        }

        const portfolioRows: PropertyRow[] = props.map(prop => {
          const rc = roomsByProp[prop.id] || { total: 0, occupied: 0 }

          // Worst compliance status for this property
          let worstDays = Infinity
          let worstLabel = 'All valid'
          for (const c of CERT_CHECKS) {
            const raw = (prop as any)[c.field]
            if (!raw) continue
            const d = Math.floor((new Date(raw).getTime() - today.getTime()) / 86400000)
            if (d < worstDays) { worstDays = d; worstLabel = c.label }
          }
          const compBadge = worstDays < 0 ? 'overdue' : worstDays <= 14 ? 'warn' : 'ok'
          const compLabel = compBadge === 'ok'
            ? 'All valid'
            : compBadge === 'overdue'
              ? `${worstLabel} overdue`
              : `${worstLabel} ${worstDays === 0 ? 'today' : `in ${worstDays}d`}`

          return {
            id:            prop.id,
            name:          prop.name,
            address:       prop.address || '',
            totalRooms:    rc.total,
            occupiedRooms: rc.occupied,
            compBadge,
            compLabel,
            openJobs:      jobsByProp[prop.id] || 0,
          }
        }).sort((a, b) => a.name.localeCompare(b.name))

        setPortfolio(portfolioRows)

        // ── 4-day calendar ──
        const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
        const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

        const slotMap: Record<string, DaySlot> = {}
        for (let i = 0; i < 4; i++) {
          const d = new Date(today.getTime() + i * 86400000)
          const iso = d.toISOString().split('T')[0]
          const label = `${i === 0 ? 'TODAY · ' : ''}${dayNames[d.getDay()]} ${d.getDate()} ${monthNames[d.getMonth()]}`
          slotMap[iso] = { label, date: iso, events: [] }
        }

        for (const v of (viewingsRes.data || [])) {
          const iso = v.viewing_date
          if (!slotMap[iso]) continue
          const room = (v.rooms as any)
          const prop = room?.properties
          slotMap[iso].events.push({
            time: v.viewing_slot || '',
            text: `Viewing · ${prop?.name || ''}${room?.name ? ` · ${room.name}` : ''}`,
            type: 'viewing',
          })
        }

        for (const a of (apptRes.data || [])) {
          const iso = a.appointment_date
          if (!slotMap[iso]) continue
          const prop = (a.properties as any)
          const apptType = a.appointment_type || a.type || ''
          slotMap[iso].events.push({
            time: a.appointment_time || a.appointment_slot || '',
            text: `${a.title || apptType || 'Appointment'}${prop?.name ? ` · ${prop.name}` : ''}`,
            type: apptType === 'maintenance' ? 'maintenance' : 'other',
          })
        }

        // Sort events within each day by time
        Object.values(slotMap).forEach(s => s.events.sort((a, b) => a.time.localeCompare(b.time)))
        setDays(Object.values(slotMap))

      } catch (e) {
        console.error('Dashboard load error:', e)
      }

      setLoading(false)
    }

    load()
  }, [router])

  if (loading) return (
    <div className="flex items-center justify-center min-h-[200px]">
      <p className="text-sm text-neutral-400">Loading dashboard…</p>
    </div>
  )

  const dayLabel = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div>
      <main className="mx-auto max-w-6xl px-lg py-xl space-y-xl">

        {/* ── Greeting ── */}
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">
            Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {adminName}
          </h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            {dayLabel}
            {kpiUrgent > 0 && (
              <span className="ml-2 text-red-600 font-medium">
                · {kpiUrgent} urgent {kpiUrgent === 1 ? 'item needs' : 'items need'} action
              </span>
            )}
          </p>
        </div>

        {/* ── KPI strip ── */}
        <div className="grid grid-cols-4 gap-sm">
          {[
            { label: 'Properties',       value: kpiProperties, href: '/admin/active-rooms',              red: false },
            { label: 'Available rooms',  value: kpiAvailRooms, href: '/admin/available-and-lettings',    red: kpiAvailRooms === 0 },
            { label: 'Active tenancies', value: kpiActiveTen,  href: '/admin/tenancies',                 red: false },
            { label: 'Urgent actions',   value: kpiUrgent,     href: '/admin/property-compliance-dashboard', red: kpiUrgent > 0 },
          ].map(k => (
            <Link key={k.label} href={k.href} className="block">
              <div className="rounded-xl bg-white border border-neutral-200 p-md hover:border-neutral-300 hover:shadow-sm transition-all">
                <p className={`text-3xl font-black tabular-nums ${k.red ? 'text-red-500' : 'text-neutral-900'}`}>{k.value}</p>
                <p className="text-xs text-neutral-500 mt-xs">{k.label}</p>
              </div>
            </Link>
          ))}
        </div>

        {/* Demo mode banner */}
        {commsLive === false && (
          <div className="rounded-lg border border-neutral-300 bg-neutral-50 px-lg py-md text-sm text-neutral-700">
            Tenant notifications are currently <strong>paused</strong>. Changes you make will not trigger messages to tenants until notifications are enabled.
          </div>
        )}

        {/* ── Action queue ── */}
        {actions.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-sm">
              <h2 className="text-sm font-bold text-neutral-700 uppercase tracking-wide">
                ⚡ Action queue
                <span className="ml-2 text-neutral-400 font-normal normal-case tracking-normal">
                  — {actions.length} item{actions.length > 1 ? 's' : ''} across all properties
                </span>
              </h2>
              <Link href="/admin/property-compliance-dashboard" className="text-xs text-amber-700 font-semibold hover:underline">View all →</Link>
            </div>
            <div className="rounded-xl bg-white border border-neutral-200 divide-y divide-neutral-100 overflow-hidden">
              {actions.slice(0, 6).map(a => (
                <div key={a.key} className="flex items-center gap-md px-lg py-md">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    a.priority === 'red' ? 'bg-red-500' : a.priority === 'amber' ? 'bg-amber-400' : 'bg-blue-400'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-neutral-900 truncate">{a.text}</p>
                    <p className="text-xs text-neutral-400 truncate">{a.sub}</p>
                  </div>
                  <Link
                    href={a.href}
                    className={`shrink-0 text-xs font-semibold rounded-lg px-sm py-xs transition-colors ${
                      a.priority === 'red'
                        ? 'bg-red-50 text-red-700 hover:bg-red-100'
                        : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                    }`}
                  >
                    {a.cta}
                  </Link>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Portfolio ── */}
        {portfolio.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-sm">
              <h2 className="text-sm font-bold text-neutral-700 uppercase tracking-wide">
                🏢 Portfolio
                <span className="ml-2 text-neutral-400 font-normal normal-case tracking-normal">— click any row to open property</span>
              </h2>
            </div>
            <div className="rounded-xl bg-white border border-neutral-200 overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-lg px-lg py-sm border-b border-neutral-100">
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Property</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 w-20 text-center">Occ.</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 w-28">Compliance</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 w-12 text-center">Jobs</span>
              </div>
              {portfolio.map(row => {
                const pct = row.totalRooms > 0 ? (row.occupiedRooms / row.totalRooms) : 0
                return (
                  <Link key={row.id} href={`/admin/properties/${row.id}`} className="block group">
                    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-lg px-lg py-md border-b border-neutral-50 hover:bg-neutral-50 transition-colors items-center">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-neutral-900 group-hover:text-amber-800 truncate">{row.name}</p>
                        <p className="text-xs text-neutral-400 truncate">{row.address}</p>
                      </div>
                      <div className="w-20 flex flex-col items-center gap-0.5">
                        {row.totalRooms > 0 ? (
                          <>
                            <div className="w-full bg-neutral-100 rounded-full h-1.5 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${pct === 1 ? 'bg-emerald-500' : pct >= 0.5 ? 'bg-amber-400' : 'bg-red-400'}`}
                                style={{ width: `${pct * 100}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-neutral-400 tabular-nums">{row.occupiedRooms}/{row.totalRooms}</span>
                          </>
                        ) : (
                          <span className="text-xs text-neutral-300">—</span>
                        )}
                      </div>
                      <div className="w-28">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-medium rounded-full px-2 py-0.5 ${
                          row.compBadge === 'ok'      ? 'bg-emerald-50 text-emerald-700' :
                          row.compBadge === 'overdue' ? 'bg-red-50 text-red-700' :
                                                        'bg-amber-50 text-amber-800'
                        }`}>
                          {row.compBadge === 'ok' ? '✓' : '⚠'}
                          <span className="truncate max-w-[88px]">{row.compLabel}</span>
                        </span>
                      </div>
                      <div className="w-12 text-center">
                        {row.openJobs > 0
                          ? <span className="text-sm font-bold text-amber-700">{row.openJobs}</span>
                          : <span className="text-sm text-neutral-300">0</span>
                        }
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        {/* ── 4-day calendar strip ── */}
        <section>
          <div className="flex items-center justify-between mb-sm">
            <h2 className="text-sm font-bold text-neutral-700 uppercase tracking-wide">📅 Next 4 days</h2>
            <button
              onClick={() => setShowAddModal(true)}
              className="text-xs bg-blue-600 text-white rounded-lg px-sm py-xs font-semibold hover:bg-blue-700 transition-colors"
            >
              + Add appointment
            </button>
          </div>
          <div className="grid grid-cols-4 gap-sm">
            {days.map(day => (
              <div key={day.date} className={`rounded-xl border bg-white p-md min-h-[80px] ${
                day.date === new Date().toISOString().split('T')[0] ? 'border-amber-300' : 'border-neutral-200'
              }`}>
                <p className={`text-[10px] font-bold uppercase tracking-wider mb-sm ${
                  day.date === new Date().toISOString().split('T')[0] ? 'text-amber-700' : 'text-neutral-400'
                }`}>{day.label}</p>
                {day.events.length === 0 ? (
                  <p className="text-xs text-neutral-300 italic">—</p>
                ) : (
                  <ul className="space-y-xs">
                    {day.events.map((e, i) => (
                      <li key={i} className="flex items-start gap-1">
                        <span className={`mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                          e.type === 'viewing' ? 'bg-blue-400' : e.type === 'maintenance' ? 'bg-amber-400' : 'bg-emerald-400'
                        }`} />
                        <div className="min-w-0">
                          {e.time && <span className="text-[10px] text-neutral-400 font-mono">{e.time.substring(0,5)} </span>}
                          <span className="text-[11px] text-neutral-700 leading-tight">{e.text}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>

      </main>

      <AdminAddAppointmentModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => setShowAddModal(false)}
      />
    </div>
  )
}

// Phones get the Today feed; tablets and desktops keep the dashboard exactly as it was.
function usePhone() {
  const [phone, setPhone] = useState<boolean | null>(null)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const on = () => setPhone(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return phone
}

export default function AdminDashboardWithBoundary() {
  const phone = usePhone()
  if (phone === null) return null
  return (
    <AdminErrorBoundary>
      {phone ? <MobileToday /> : <AdminDashboard />}
    </AdminErrorBoundary>
  )
}
