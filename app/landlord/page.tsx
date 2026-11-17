'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getCurrentUser, signOut } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import { displayName } from '@/lib/people'
import ViewAsBanner from '@/app/components/ViewAsBanner'
import PropertyFinancialSummary from '@/app/components/PropertyFinancialSummary'
import LandlordPlanner from '@/components/LandlordPlanner'
import LandlordDocuments from './LandlordDocuments'
import ExpenseHistory from './ExpenseHistory'
import UpkeepByArea from './UpkeepByArea'
import { dearName } from '@/lib/people'
import { landlordSections, type LandlordSection } from '@/lib/access/landlordSections'

// Notification categories the landlord can self-manage
const NOTIF_CATEGORIES: { key: string; label: string; description: string; mandatory?: boolean }[] = [
  { key: 'urgent',               label: 'Urgent issues',            description: 'Emergency maintenance at your property', mandatory: true },
  { key: 'job_approval',         label: 'Job approvals',             description: 'Large or costly jobs needing your sign-off' },
  { key: 'job_updates',          label: 'Job updates',               description: 'Contractor visits booked, jobs completed' },
  { key: 'rent_received',        label: 'Rent received',             description: 'Monthly rent payment confirmed' },
  { key: 'rent_arrears',         label: 'Rent arrears',              description: 'Tenant is late or in arrears' },
  { key: 'financial_statements', label: 'Monthly statements',        description: 'New statement ready to view' },
  { key: 'compliance_expiry',    label: 'Compliance expiry',         description: 'Certificates expiring within 60 days' },
  { key: 'compliance_breach',    label: 'Compliance breach',         description: 'Issue requiring attention' },
  { key: 'tenant_changes',       label: 'Tenant changes',            description: 'Move-in, move-out, or notice given' },
  { key: 'cleaner_visits',       label: 'Cleaner visits',            description: 'Scheduled cleans and completion reports' },
  { key: 'viewings',             label: 'Viewings',                  description: 'Viewing appointments at your property' },
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

type Tab = 'home' | 'statements' | 'documents' | 'spending'

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
  const [period, setPeriod] = useState<'month' | '3m' | '12m'>('month')
  const [tab, setTab] = useState<Tab>('home')
  const [houses, setHouses] = useState<{ id: string; name: string; rooms: number; let: number; due: { label: string; date: string; overdue: boolean }[] }[]>([])
  const [tenants, setTenants] = useState<{ total: number; working: number; students: number; unknown: number; fields: string[]; roomsLet: number; rooms: number; avgStayMonths: number | null } | null>(null)
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
          // landlords are greeted formally, as in every letter and email to them ("Mx Landlord", 11 Nov 2026)
          { const n = me ? dearName(me as any) : ''; setName(n && n !== 'Sir or Madam' ? n : '') } }
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

      // houses, certificates due, who lives there (app/api/landlord/overview)
      const ov = await fetch(`/api/landlord/overview${asParam && isAdmin ? `?as=${encodeURIComponent(asParam)}` : ''}`).then(r => r.ok ? r.json() : null).catch(() => null)
      if (ov) { setHouses(ov.houses ?? []); setTenants(ov.tenants ?? null) }

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

  // ── the landlord home (17 Nov 2026, Harry: "really really busy, too many different size fonts and too bold" → style A,
  // the tenant app / website look): one clear figure for the period, a bar splitting rent into you · management · costs,
  // a card per house, who lives there (counts only), and four tabs. Three type sizes; colour only where it means something.
  const now = new Date()
  const monthKey = (d: string) => d.slice(0, 7)
  const latestMonth = statements[0]?.statement_date ? monthKey(statements[0].statement_date) : null
  const thisMonth = now.toISOString().slice(0, 7)
  const periodStmts = (() => {
    if (period === 'month') { const m = statements.some(x => monthKey(x.statement_date) === thisMonth) ? thisMonth : latestMonth; return statements.filter(x => m && monthKey(x.statement_date) === m) }
    const d = new Date(); d.setMonth(d.getMonth() - (period === '3m' ? 3 : 12)); const cut = d.toISOString().slice(0, 10)
    return statements.filter(x => x.statement_date >= cut)
  })()
  const num = (v: unknown) => parseFloat(String(v || 0)) || 0
  const tot = periodStmts.reduce((a, x) => ({ gross: a.gross + num(x.gross_rent), fees: a.fees + num(x.management_fees), costs: a.costs + num(x.property_charges), net: a.net + num(x.net_to_landlord) }), { gross: 0, fees: 0, costs: 0, net: 0 })
  const pct = (n: number) => tot.gross > 0 ? Math.max(0, Math.round(n / tot.gross * 100)) : 0
  const feePct = tot.gross > 0 ? Math.round(tot.fees / tot.gross * 100) : 0
  const whole = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`
  const periodLabel = period === 'month'
    ? `Paid to you in ${new Date(`${(periodStmts[0]?.statement_date ?? now.toISOString()).slice(0, 7)}-15`).toLocaleDateString('en-GB', { month: 'long' })}`
    : period === '3m' ? 'Paid to you in the last 3 months' : 'Paid to you in the last 12 months'
  const netBy = (pid: string) => periodStmts.filter(x => x.property_id === pid).reduce((a, x) => a + num(x.net_to_landlord), 0)
  const gbp = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  void gbp
  const firstName = (name || '').replace(/^(mr|mrs|ms|miss|mx|dr|prof|sir|dame|lady|lord)\.?\s+/i, '').split(' ')[0]
  const tabs = [
    { key: 'home', label: 'Home', show: true },
    { key: 'statements', label: 'Statements', show: sections.includes('statements') },
    { key: 'documents', label: 'Documents', show: true },
    { key: 'spending', label: 'Spending', show: sections.includes('statements') },
  ].filter(t => t.show) as { key: Tab; label: string }[]

  if (loading) return <div className="garden min-h-screen bg-[#EEF2EC]" />

  const card = 'rounded-[20px] bg-white'
  return (
    <div className="garden min-h-screen bg-[#EEF2EC] pb-32 text-[#14261F]" style={{ paddingTop: 'max(calc(env(safe-area-inset-top) + 14px), 20px)' }}>
      {viewingAs && <ViewAsBanner name={viewingAs.name} role={viewingAs.role} personId={viewingAs.id} />}
      <div className="mx-auto max-w-xl space-y-4 px-4 lg:max-w-3xl">

        {tab === 'home' && (<>
          <div className="flex items-start justify-between gap-3 pt-1">
            <div>
              <p className="text-[13px] text-[#4E6158]">{now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening'}{firstName ? `, ${firstName}` : ''}</p>
              <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em]">Your properties</h1>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/lockup-ink.png" alt="Capital Rooms" style={{ height: 26, width: 'auto', marginTop: 6 }} />
          </div>

          {sections.includes('statements') && statements.length > 0 && (<>
            <div className="flex gap-2">
              {([['month', 'This month'], ['3m', '3 months'], ['12m', '12 months']] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setPeriod(k)} className={`h-9 rounded-full px-4 text-[13px] ${period === k ? 'bg-[#17332B] text-white' : 'bg-white text-[#4E6158]'}`}>{l}</button>
              ))}
            </div>
            <section className="rounded-[22px] bg-[#17332B] p-5 text-[#F1F5EE]">
              <p className="text-[13px] text-[#B9CBBF]">{periodLabel}</p>
              <p className="mt-0.5 text-[34px] font-semibold leading-none tracking-[-0.02em] tabular-nums">{whole(tot.net)}</p>
              <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
                <div style={{ width: `${pct(tot.net)}%`, background: 'var(--cr-gold, #E9B949)' }} />
                <div style={{ width: `${pct(tot.fees)}%`, background: '#7E9488' }} />
                <div style={{ width: `${pct(tot.costs)}%`, background: '#C9D6CC' }} />
              </div>
              <div className="mt-2 flex justify-between text-[12px] text-[#B9CBBF]">
                <span>You {pct(tot.net)}%</span><span>Management {feePct}%</span><span>Costs {pct(tot.costs)}%</span>
              </div>
              <p className="mt-3 text-[12px] text-[#B9CBBF]">From {whole(tot.gross)} rent · {periodStmts.length} statement{periodStmts.length === 1 ? '' : 's'}</p>
            </section>
          </>)}

          {!!houses.length && (<>
            <p className="px-1 pt-1 text-[13px] text-[#4E6158]">{houses.length} {houses.length === 1 ? 'property' : 'properties'}</p>
            <div className={`${card} px-4`}>
              {houses.map((h, i) => (
                <button key={h.id} type="button" onClick={() => { setSelectedProperty(h.id); setTab('statements'); window.scrollTo({ top: 0 }) }}
                  className={`flex w-full items-center justify-between gap-3 py-3 text-left ${i < houses.length - 1 ? 'border-b border-[#E3EAE4]' : ''}`}>
                  <span className="min-w-0">
                    <span className="block truncate text-[15px]">{h.name}</span>
                    <span className="mt-0.5 flex flex-wrap gap-1.5">
                      {h.rooms > 1 && <span className="text-[12px] text-[#4E6158]">{h.let} of {h.rooms} rooms let</span>}
                      {h.due.slice(0, 2).map(d => <span key={d.label} className={`rounded-full px-2 py-0.5 text-[11px] ${d.overdue ? 'bg-[#FCEBEB] text-[#791F1F]' : 'bg-[#FAEEDA] text-[#633806]'}`}>{d.label} {d.overdue ? 'overdue' : `due ${new Date(d.date).toLocaleDateString('en-GB', { month: 'short' })}`}</span>)}
                    </span>
                  </span>
                  {sections.includes('statements') && <span className="shrink-0 text-[15px] tabular-nums">{whole(netBy(h.id))}</span>}
                </button>
              ))}
            </div>
          </>)}

          {tenants && (<>
            <p className="px-1 pt-1 text-[13px] text-[#4E6158]">Who lives in your homes</p>
            <section className={`${card} p-4`}>
              <p className="text-[15px]">{tenants.total} tenant{tenants.total === 1 ? '' : 's'}{tenants.rooms > 1 ? ` · ${tenants.roomsLet} of ${tenants.rooms} rooms let` : ''}</p>
              <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-[#E3EAE4]" aria-hidden="true">
                <div style={{ width: `${tenants.working / tenants.total * 100}%`, background: '#17332B' }} />
                <div style={{ width: `${tenants.students / tenants.total * 100}%`, background: '#5E8C74' }} />
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-[#4E6158]">
                {!!tenants.working && <>Working {tenants.working}{tenants.fields.length ? ` · ${tenants.fields.join(', ')}` : ''}<br /></>}
                {!!tenants.students && <>Students {tenants.students}<br /></>}
                {!!tenants.unknown && <>Not told us {tenants.unknown}<br /></>}
                {tenants.avgStayMonths != null && <>Average stay so far {tenants.avgStayMonths} month{tenants.avgStayMonths === 1 ? '' : 's'}</>}
              </p>
            </section>
          </>)}

          {sections.includes('planner') && (<>
            <p className="px-1 pt-1 text-[13px] text-[#4E6158]">What we’re working on</p>
            <section className={`${card} p-4`}>
              {viewingAs ? (boardId ? <LandlordPlanner previewBoardId={boardId} /> : <p className="text-[13px] text-[#4E6158]">No board yet.</p>) : <LandlordPlanner />}
            </section>
          </>)}

          {commsEnabled && sections.includes('notifications') && (
            <section className={`${card} p-4`}>
              <button type="button" onClick={() => setShowNotifPrefs(v => !v)} className="flex w-full items-center justify-between text-left">
                <span><span className="block text-[15px]">Updates from us</span><span className="block text-[13px] text-[#4E6158]">Choose what we email you about</span></span>
                <span className="text-[#4E6158]" aria-hidden="true">{showNotifPrefs ? '⌃' : '⌄'}</span>
              </button>
              {showNotifPrefs && <div className="mt-2">{NOTIF_CATEGORIES.map((cat, i) => {
                const on = cat.mandatory ? true : (prefs[cat.key] ?? true)
                return (
                  <div key={cat.key} className={`flex items-center justify-between gap-3 py-2.5 ${i ? 'border-t border-[#E3EAE4]' : ''}`}>
                    <span className="min-w-0"><span className="block text-[14px]">{cat.label}</span><span className="block text-[12px] text-[#4E6158]">{cat.description}</span></span>
                    {cat.mandatory ? <span className="text-[12px] text-[#4E6158]">Always on</span>
                      : <button type="button" role="switch" aria-checked={on} aria-label={cat.label} onClick={() => togglePref(cat.key)} className={`relative h-7 w-12 shrink-0 rounded-full ${on ? 'bg-[#17332B]' : 'bg-[#C9D6CC]'}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-transform ${on ? 'translate-x-6' : 'translate-x-1'}`} /></button>}
                  </div>)
              })}</div>}
            </section>
          )}

          <div className="flex gap-5 px-1 pt-2 text-[13px] text-[#4E6158]">
            <a href="/account" className="underline">Password and sign-in</a>
            {!viewingAs && <button type="button" onClick={handleSignOut} className="underline">Sign out</button>}
          </div>
        </>)}

        {tab === 'statements' && (<>
          <h1 className="pt-1 text-[26px] font-semibold tracking-[-0.02em]">Statements</h1>
          {properties.length > 1 && (
            <select value={selectedProperty} onChange={e => setSelectedProperty(e.target.value)} className="h-12 w-full rounded-full border-0 bg-white px-4 text-[15px]">
              {properties.map(prop => <option key={prop.id} value={prop.id}>{String(prop.name || prop.address || '').split('\n')[0]}</option>)}
            </select>
          )}
          <section className={`${card} p-4`}>
            {selectedProperty ? <PropertyFinancialSummary propertyId={selectedProperty} /> : <p className="text-[14px] text-[#4E6158]">Monthly statements show here for the homes we manage.</p>}
          </section>
        </>)}

        {tab === 'documents' && (<>
          <h1 className="pt-1 text-[26px] font-semibold tracking-[-0.02em]">Documents</h1>
          <section className={`${card} py-2`}><LandlordDocuments asId={viewingAs?.id ?? null} /></section>
        </>)}

        {tab === 'spending' && (<>
          <h1 className="pt-1 text-[26px] font-semibold tracking-[-0.02em]">Spending</h1>
          <section className={`${card} py-2`}><ExpenseHistory asId={viewingAs?.id ?? null} /></section>
          <section className={`${card} py-2`}><UpkeepByArea asId={viewingAs?.id ?? null} /></section>
        </>)}
      </div>

      {tabs.length > 1 && (
        <nav aria-label="Landlord sections" className="fixed inset-x-3 z-40 mx-auto flex max-w-xl justify-around gap-1 rounded-[24px] bg-[#17332B] p-1.5" style={{ bottom: 'max(env(safe-area-inset-bottom), 12px)' }}>
          {tabs.map(t => (
            <button key={t.key} type="button" onClick={() => { setTab(t.key); window.scrollTo({ top: 0 }) }} aria-current={tab === t.key ? 'page' : undefined}
              className={`h-11 flex-1 rounded-[18px] text-[13px] ${tab === t.key ? 'text-[#17332B]' : 'text-[#B9CBBF]'}`} style={tab === t.key ? { background: 'var(--cr-gold, #E9B949)' } : undefined}>{t.label}</button>
          ))}
        </nav>
      )}
    </div>
  )
}
