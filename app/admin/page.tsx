'use client'
import PageHero from '@/components/PageHero'

import { useEffect, useState, Component, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import DashboardInfographic, { type DashboardData } from './components/DashboardInfographic'
import MobileToday from './components/MobileToday'

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

// ── Dashboard (desktop): the whole managed portfolio as infographics — app/admin/components/DashboardInfographic ──
function AdminDashboard() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState('')
  const [commsLive, setCommsLive] = useState<boolean | null>(null)

  useEffect(() => {
    (async () => {
      const u = await getCurrentUser()
      if (!u || (u.assignment?.role !== 'administrator' && u.assignment?.role !== 'admin')) { router.push('/login'); return }
      const p = u.assignment as any
      setName(p.first_name || p.name || u.user?.email?.split('@')[0] || '')
      fetch('/api/comms-status').then(r => r.json()).then(d => setCommsLive(!!d.live)).catch(() => {})
      try {
        const res = await fetch('/api/admin/dashboard')
        const d = await res.json()
        if (!res.ok) throw new Error(d.error || 'Could not load the dashboard')
        setData(d)
      } catch (e) { setError(e instanceof Error ? e.message : 'Could not load the dashboard') }
    })()
  }, [router])

  if (!data) return (
    <div>
      <PageHero
        title={<>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}</>}
        subtitle={error || new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
        stats={['Rooms let', 'On notice', 'Empty', 'Rent roll'].map(label => ({ label, value: <span className="inline-block h-6 w-10 animate-pulse rounded bg-white/10" /> }))}
      />
    </div>
  )

  return (
    <>
      {commsLive === false && (
        <div className="border-b border-neutral-300 bg-neutral-50 px-lg py-sm text-center text-xs text-neutral-700">
          Tenant notifications are <strong>paused</strong>. Nothing you change will message tenants until they are switched on.
        </div>
      )}
      <DashboardInfographic d={data} name={name} />
    </>
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
  if (phone === null) return <div className="min-h-[220px] bg-[#181614]" />
  return (
    <AdminErrorBoundary>
      {phone ? <MobileToday /> : <AdminDashboard />}
    </AdminErrorBoundary>
  )
}
