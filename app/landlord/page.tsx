'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getCurrentUser, signOut } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import { displayName } from '@/lib/people'
import ViewAsBanner from '@/app/components/ViewAsBanner'
import PropertyFinancialSummary from '@/app/components/PropertyFinancialSummary'
import LandlordPlanner from '@/components/LandlordPlanner'
import PublicShell from '@/components/public/PublicShell'
import LandlordDocuments from './LandlordDocuments'
import { hiName } from '@/lib/people'
import { landlordSections, type LandlordSection } from '@/lib/access/landlordSections'

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
  const [portfolioPeriod, setPortfolioPeriod] = useState<'3m' | '6m' | '12m' | 'all'>('12m')
  // the parts of the app the office has switched on for this landlord (lib/access/landlordSections, 14 Oct 2026)
  const [sections, setSections] = useState<LandlordSection[]>([])
  const [boardId, setBoardId] = useState<string | null>(null)

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
          .select('id, salutation, first_name, last_name, full_name, email, role')
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
        // their name as people know it (the record has no "name" column — it fell back to the email: "Hello, test-onboard")
        { const { data: me } = await createClient().from('people').select('salutation, first_name, last_name, full_name, company').eq('id', (data.assignment as any)?.id).maybeSingle()
          setName(hiName(me as any) !== 'there' ? hiName(me as any) : '') }
        pid = (data.assignment as any)?.id ?? null
        setPersonId(pid)
      }

      const supabase = createClient()

      // Load statements — full financial columns for both portfolio summary and property picker
      const { data: statementsData } = await supabase
        .from('landlord_statements')
        .select('id, property_id, statement_date, gross_rent, management_fees, property_charges, net_to_landlord, paid_date, properties(name, address)')
        .eq('landlord_id', pid!)
        .order('statement_date', { ascending: false })

      setStatements((statementsData as any) || [])
      if (statementsData && statementsData.length > 0) {
        setSelectedProperty((statementsData[0] as any).property_id)
      }

      // Load notification prefs
      if (pid) {
        const { data: personRow } = await supabase.from('people').select('landlord_comms_enabled, access_areas').eq('id', pid).single()
        setCommsEnabled(personRow?.landlord_comms_enabled ?? false)
        // their planner board with the office: their own (from the planner route), or — viewing as them — looked up
        let board: string | null = null
        if (asParam && isAdmin) {
          const { data: b } = await supabase.from('planner_shared_boards').select('id').eq('member_person_id', pid).is('archived_at', null).maybeSingle()
          board = (b as any)?.id ?? null
        } else {
          const d = await fetch('/api/planner/shared').then(r => (r.ok ? r.json() : null)).catch(() => null)
          board = d?.board?.id ?? null
        }
        setBoardId(board)
        setSections(landlordSections((personRow as any)?.access_areas, !!board))

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

  // Portfolio summary — totals across all properties for the selected period
  const portfolioCutoff = (() => {
    if (portfolioPeriod === 'all') return null
    const d = new Date()
    d.setMonth(d.getMonth() - (portfolioPeriod === '3m' ? 3 : portfolioPeriod === '6m' ? 6 : 12))
    return d.toISOString().split('T')[0]
  })()
  const portfolioStmts = portfolioCutoff
    ? statements.filter(s => s.statement_date >= portfolioCutoff)
    : statements
  const portfolioTotals = portfolioStmts.reduce(
    (acc, s) => ({
      gross:   acc.gross   + parseFloat(String(s.gross_rent          || 0)),
      fees:    acc.fees    + parseFloat(String(s.management_fees     || 0)),
      charges: acc.charges + parseFloat(String(s.property_charges    || 0)),
      net:     acc.net     + parseFloat(String(s.net_to_landlord     || 0)),
    }),
    { gross: 0, fees: 0, charges: 0, net: 0 }
  )
  const gbp = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  if (loading) {
    return <PublicShell centred signedIn><p className="pub-muted mx-auto max-w-6xl px-6 py-24 text-[16px] md:px-14">Loading…</p></PublicShell>
  }

  // the landlord-onboarding look (components/public) — 14 Oct 2026, Harry: "do it in the onboarding landlord style"
  const wrap = 'mx-auto max-w-6xl px-6 md:px-14'
  return (
    <PublicShell centred signedIn label={viewingAs ? `Viewing as ${name}` : 'Your account'}>
      {viewingAs && <ViewAsBanner name={viewingAs.name} role={viewingAs.role} personId={viewingAs.id} />}

      <section className={`${wrap} pt-10 md:pt-14`}>
        <p className="pub-eyebrow pub-enter m-0 mb-4">Capital Rooms · landlord</p>
        <h1 className="pub-serif pub-enter m-0 text-[34px] leading-[1.05] md:text-[56px]">Hello, {name || 'there'}</h1>
        <p className="pub-intro pub-enter-2 mt-4 max-w-2xl">
          {sections.includes('planner')
            ? 'Everything we’re working on together, by property. Tap a line to open it.'
            : sections.includes('statements') ? 'Financial summaries for your properties.' : 'Welcome to Capital Rooms.'}
        </p>
      </section>

      {/* Shared planner with the office — both sides add and edit; viewing as them, the same screen read only */}
      {sections.includes('planner') && (
        <section className={`${wrap} pt-8 md:pt-12`}>
          <h2 className="pub-h2 mb-5">Planner</h2>
          {viewingAs
            ? (boardId ? <LandlordPlanner previewBoardId={boardId} /> : <p className="pub-note">No board yet — switch the planner on from their profile.</p>)
            : <LandlordPlanner />}
        </section>
      )}

      <section className={`${wrap} pt-12`}>
        {sections.includes('statements') && (<>

        {/* Portfolio summary */}
        {statements.length > 0 && (
          <div className="mb-2xl">
            <div className="flex items-center justify-between mb-md flex-wrap gap-sm">
              <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
                Portfolio total{properties.length > 1 ? ` · ${properties.length} properties` : ''}
              </p>
              <div className="flex items-center gap-xs">
                {(['3m', '6m', '12m', 'all'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setPortfolioPeriod(p)}
                    className={`text-xs px-sm py-xs rounded-full font-medium transition-colors ${
                      portfolioPeriod === p
                        ? 'bg-neutral-900 text-white'
                        : 'text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100'
                    }`}
                  >
                    {p === 'all' ? 'All time' : p}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-md">
              {[
                { label: 'Gross rent',  value: portfolioTotals.gross,   colour: 'text-neutral-900' },
                { label: 'Mgmt fees',   value: portfolioTotals.fees,    colour: 'text-red-600' },
                { label: 'Expenses',    value: portfolioTotals.charges, colour: 'text-red-600' },
                { label: 'Net income',  value: portfolioTotals.net,     colour: 'text-green-700' },
              ].map(m => (
                <div key={m.label} className="rounded-2xl bg-white border border-neutral-200 px-md py-md shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400">{m.label}</p>
                  <p className={`text-xl font-black mt-xs tabular-nums ${m.colour}`}>{gbp(m.value)}</p>
                </div>
              ))}
            </div>
            {portfolioCutoff && (
              <p className="text-xs text-neutral-400 mt-sm text-right">
                {portfolioStmts.length} statement{portfolioStmts.length !== 1 ? 's' : ''} from {new Date(portfolioCutoff).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })} onwards
              </p>
            )}
          </div>
        )}

        {/* Property Selector */}
        {properties.length > 0 && (
          <div className="mb-3xl rounded-2xl p-lg" style={{ background: '#EEF0F3', border: '1px solid #DDE1E6' }}>
            <label htmlFor="landlord-property" className="block text-xs font-bold uppercase tracking-widest mb-md" style={{ color: '#5B6470' }}>
              {properties.length > 1 ? 'Select property' : 'Your property'}
            </label>
            <div className="relative">
              <select
                id="landlord-property"
                value={selectedProperty}
                onChange={(e) => setSelectedProperty(e.target.value)}
                disabled={properties.length < 2}
                className="w-full rounded-lg px-md py-sm pr-10 text-base font-bold appearance-none cursor-pointer disabled:cursor-default disabled:opacity-100"
                style={{ background: '#fff', color: '#1F2329', border: '1px solid #D3D8DE' }}
              >
                {properties.map((prop) => {
                  // the full address once — not "208 Rotherhithe Street — 208 Rotherhithe Street, London…"
                  const addr = String(prop.address || '').replace(/\s*\n\s*/g, ', ')
                  const name = String(prop.name || '').split('\n')[0]
                  const label = !addr ? name : !name || addr.toLowerCase().startsWith(name.toLowerCase()) ? addr : `${name} — ${addr}`
                  return <option key={prop.id} value={prop.id}>{label}</option>
                })}
              </select>
              {properties.length > 1 && <span aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm" style={{ color: '#5B6470' }}>▾</span>}
            </div>
          </div>
        )}

        {/* Financial summary — shared component (also used in admin property Financials tab) */}
        {selectedProperty
          ? <PropertyFinancialSummary propertyId={selectedProperty} />
          : (
            <div className="rounded-2xl bg-white border border-neutral-200 px-lg py-3xl text-center mb-3xl">
              <p className="text-3xl mb-md">💷</p>
              <p className="text-sm font-semibold text-neutral-600">No monthly statements</p>
              <p className="text-xs text-neutral-400 mt-xs">Monthly statements appear here for houses we manage. Lettings statements for tenants we've found you are under Your documents below.</p>
            </div>
          )
        }

        </>)}

        {/* ─── Notification Preferences ─── */}
        {commsEnabled && sections.includes('notifications') && (
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
      </section>

      {/* statements, agreements, invoices and certificates from us — let-only landlords too (21 Oct 2026) */}
      <LandlordDocuments asId={viewingAs?.id ?? null} />

      {/* account */}
      <section className={`${wrap} flex flex-wrap items-center gap-6 pb-16 pt-16`}>
        <a href="/account" className="pub-eyebrow inline-flex min-h-[44px] items-center" style={{ color: '#111' }}>Password &amp; sign-in</a>
        {!viewingAs && <button type="button" onClick={handleSignOut} className="pub-eyebrow inline-flex min-h-[44px] items-center" style={{ color: '#111' }}>Sign out</button>}
      </section>
    </PublicShell>
  )
}
