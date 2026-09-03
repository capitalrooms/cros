'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getCurrentUser, signOut } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import { displayName } from '@/lib/people'
import AppBar from '@/components/AppBar'
import RoleGreeting from '@/app/components/RoleGreeting'
import BackButton from '@/app/components/BackButton'
import ViewAsBanner from '@/app/components/ViewAsBanner'
import PropertyFinancialSummary from '@/app/components/PropertyFinancialSummary'

// Notification categories the landlord can self-manage
const NOTIF_CATEGORIES: { key: string; label: string; description: string; mandatory?: boolean }[] = [
  { key: 'urgent',               label: '🚨 Urgent issues',            description: 'Emergency maintenance at your property', mandatory: true },
  { key: 'job_approval',         label: '✅ Job approvals',             description: 'Large or costly jobs needing your sign-off' },
  { key: 'job_updates',          label: '🔧 Job updates',               description: 'Contractor visits booked, jobs completed' },
  { key: 'rent_received',        label: '💷 Rent received',             description: 'Monthly rent payment confirmed' },
  { key: 'rent_arrears',         label: '⚠️ Rent arrears',              description: 'Tenant is late or in arrears' },
  { key: 'financial_statements', label: '📄 Monthly statements',        description: 'New statement ready to view' },
  { key: 'compliance_expiry',    label: '📋 Compliance expiry',         description: 'Certificates expiring within 60 days' },
  { key: 'compliance_breach',    label: '🔴 Compliance breach',         description: 'Issue requiring attention' },
  { key: 'tenant_changes',       label: '🏠 Tenant changes',            description: 'Move-in, move-out, or notice given' },
  { key: 'cleaner_visits',       label: '🧹 Cleaner visits',            description: 'Scheduled cleans and completion reports' },
  { key: 'viewings',             label: '👀 Viewings',                  description: 'Viewing appointments at your property' },
]

interface Statement {
  id: string
  statement_reference: string
  statement_date: string
  period_start: string
  period_end: string
  gross_rent: number
  management_fees: number
  property_charges: number
  net_to_landlord: number
  paid_date?: string
  property_id: string
  properties?: { name: string; address: string }
}

export default function LandlordDashboard() {
  const router = useRouter()
  const [user, setUser]                 = useState<any>(null)
  const [statements, setStatements]     = useState<Statement[]>([])
  const [selectedProperty, setSelectedProperty] = useState('')
  const [loading, setLoading]           = useState(true)
  const [name, setName]                 = useState('')
  const [personId, setPersonId]         = useState<string | null>(null)
  const [commsEnabled, setCommsEnabled] = useState(false)
  const [prefs, setPrefs]               = useState<Record<string, boolean>>({})
  const [showNotifPrefs, setShowNotifPrefs] = useState(false)
  const [viewingAs, setViewingAs]       = useState<{ id: string; name: string; role: string } | null>(null)

  const searchParams = useSearchParams()

  useEffect(() => {
    async function checkAuth() {
      const data = await getCurrentUser()
      const asParam = searchParams.get('as')
      const isAdmin = ['administrator', 'admin'].includes(data?.assignment?.role || '')

      // ── Impersonation: admin visiting /landlord?as=[personId] ────────────
      let pid: string | null
      if (asParam && isAdmin) {
        const supabase = createClient()
        const { data: target } = await supabase
          .from('people')
          .select('id, first_name, last_name, full_name, email, role')
          .eq('id', asParam)
          .single()
        if (!target || target.role !== 'landlord') { router.push('/admin/people'); return }
        setUser(data!.user)
        const targetName = displayName(target)
        setName(targetName)
        setViewingAs({ id: asParam, name: targetName, role: target.role })
        pid = asParam
        setPersonId(pid)
      } else if (!data || data.assignment?.role !== 'landlord') {
        router.push('/login')
        return
      } else {
        setUser(data.user)
        setName((data.assignment as any).name || data.user?.email?.split('@')[0] || '')
        pid = (data.assignment as any)?.id ?? null
        setPersonId(pid)
      }

      const supabase = createClient()

      // Load statements (minimal columns — just enough for the property dropdown)
      const { data: statementsData } = await supabase
        .from('landlord_statements')
        .select('id, property_id, statement_date, properties(name, address)')
        .eq('landlord_id', pid!)
        .order('statement_date', { ascending: false })

      setStatements((statementsData as any) || [])
      if (statementsData && statementsData.length > 0) {
        setSelectedProperty((statementsData[0] as any).property_id)
      }

      // Load notification prefs
      if (pid) {
        const { data: personRow } = await supabase.from('people').select('landlord_comms_enabled').eq('id', pid).single()
        setCommsEnabled(personRow?.landlord_comms_enabled ?? false)

        const { data: prefsData } = await supabase
          .from('landlord_notification_prefs').select('category, enabled').eq('person_id', pid)
        const pm: Record<string, boolean> = {}
        for (const row of (prefsData || [])) pm[row.category] = row.enabled
        setPrefs(pm)
      }

      setLoading(false)
    }

    checkAuth()
  }, [router, searchParams])

  async function togglePref(category: string) {
    if (!personId) return
    const newVal = !(prefs[category] ?? true)
    setPrefs(prev => ({ ...prev, [category]: newVal }))
    const supabase = createClient()
    await supabase.from('landlord_notification_prefs').upsert(
      { person_id: personId, category, enabled: newVal, updated_at: new Date().toISOString() },
      { onConflict: 'person_id,category' }
    )
  }

  async function handleSignOut() {
    await signOut()
    router.push('/login')
  }

  // Build the property list for the selector from the loaded statements
  const properties = Array.from(
    new Map(
      statements.map((s) => [s.property_id, { id: s.property_id, name: s.properties?.name, address: s.properties?.address }])
    ).values()
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar left={<BackButton />} />
        <main className="mx-auto max-w-6xl px-lg py-2xl">
          <div className="animate-pulse">
            <div className="h-10 w-64 bg-neutral-300 rounded-lg mb-lg"></div>
            <div className="h-6 w-96 bg-neutral-200 rounded-lg"></div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      {viewingAs && (
        <ViewAsBanner name={viewingAs.name} role={viewingAs.role} personId={viewingAs.id} />
      )}
      <AppBar
        right={
          <div className="flex items-center gap-md">
            <a href="/landlord/profile" className="shrink-0 transition-colors hover:opacity-80 flex items-center justify-center w-8 h-8 rounded-full hover:bg-white/10" title="Profile settings">
              <span className="text-lg leading-none">⚙️</span>
            </a>
            <button onClick={handleSignOut} className="shrink-0 transition-colors hover:opacity-80 flex items-center gap-sm">
              <span>👋</span> Sign out
            </button>
          </div>
        }
      />

      <main className="mx-auto max-w-6xl px-lg py-2xl">
        <RoleGreeting role="Landlord Dashboard" name={name} subtitle="Financial summaries for your properties." />

        {/* Property Selector */}
        {properties.length > 0 && (
          <div className="mb-3xl rounded-2xl bg-neutral-900 text-white p-lg">
            <label className="block text-xs font-bold uppercase tracking-widest text-white/60 mb-md">
              Select Property
            </label>
            <select
              value={selectedProperty}
              onChange={(e) => setSelectedProperty(e.target.value)}
              className="w-full bg-neutral-800 text-white rounded-lg px-md py-sm border border-neutral-700 text-base font-bold appearance-none cursor-pointer"
              style={{ colorScheme: 'dark', color: '#ffffff' }}
            >
              {properties.map((prop) => (
                <option key={prop.id} value={prop.id} style={{ backgroundColor: '#1f2937', color: '#ffffff' }}>
                  {prop.name && prop.name !== prop.address ? `${prop.name} — ${prop.address}` : (prop.address || prop.name)}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Financial summary — shared component (also used in admin property Financials tab) */}
        {selectedProperty
          ? <PropertyFinancialSummary propertyId={selectedProperty} />
          : (
            <div className="rounded-2xl bg-white border border-neutral-200 px-lg py-3xl text-center mb-3xl">
              <p className="text-3xl mb-md">💷</p>
              <p className="text-sm font-semibold text-neutral-600">No statements yet</p>
              <p className="text-xs text-neutral-400 mt-xs">Check back soon for your financial statements.</p>
            </div>
          )
        }

        {/* ─── Notification Preferences ─── */}
        {commsEnabled && (
          <div className="mt-3xl">
            <button
              onClick={() => setShowNotifPrefs(v => !v)}
              className="flex items-center justify-between w-full rounded-2xl bg-neutral-900 px-lg py-md text-left"
            >
              <div>
                <p className="text-sm font-bold text-white">🔔 Notification preferences</p>
                <p className="text-xs text-white/40 mt-xs">Choose which updates you receive from Capital Rooms</p>
              </div>
              <span className="text-white/40 text-lg ml-md">{showNotifPrefs ? '▲' : '▼'}</span>
            </button>

            {showNotifPrefs && (
              <div className="mt-sm rounded-2xl bg-neutral-900 overflow-hidden">
                {NOTIF_CATEGORIES.map((cat, i) => {
                  const isEnabled = cat.mandatory ? true : (prefs[cat.key] ?? true)
                  return (
                    <div key={cat.key} className={`flex items-center justify-between px-lg py-md ${i < NOTIF_CATEGORIES.length - 1 ? 'border-b border-white/5' : ''}`}>
                      <div className="flex-1 min-w-0 mr-md">
                        <p className="text-sm font-semibold text-white">{cat.label}</p>
                        <p className="text-xs text-white/40">{cat.description}</p>
                      </div>
                      {cat.mandatory ? (
                        <span className="text-xs text-white/30 italic">Always on</span>
                      ) : (
                        <button
                          onClick={() => togglePref(cat.key)}
                          className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full transition-colors ${isEnabled ? 'bg-emerald-500' : 'bg-neutral-600'}`}
                        >
                          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${isEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                      )}
                    </div>
                  )
                })}
                <div className="px-lg py-md border-t border-white/5">
                  <p className="text-xs text-white/30">
                    Your property manager can see these preferences. Emergency notifications cannot be turned off.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
