'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import LandlordCard, { fromPeople, LandlordCardData, LandlordProperty } from '@/app/components/LandlordCard'

const STAGES: Record<number, string> = {
  1: 'New enquiry',
  2: 'Welcome pack sent',
  3: 'Docs received',
  4: 'Verified',
  5: 'Agreement sent',
  6: 'Fully onboarded',
}

const NOTIF_CATEGORIES = [
  { key: 'urgent',               label: '🚨 Urgent issues' },
  { key: 'job_approval',         label: '✅ Job approvals' },
  { key: 'job_updates',          label: '🔧 Job updates' },
  { key: 'rent_received',        label: '💷 Rent received' },
  { key: 'rent_arrears',         label: '⚠️ Rent arrears' },
  { key: 'financial_statements', label: '📄 Monthly statements' },
  { key: 'compliance_expiry',    label: '📋 Compliance expiry' },
  { key: 'compliance_breach',    label: '🔴 Compliance breach' },
  { key: 'tenant_changes',       label: '🏠 Tenant changes' },
  { key: 'cleaner_visits',       label: '🧹 Cleaner visits' },
  { key: 'viewings',             label: '👀 Viewings' },
]

function fmt(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function LandlordProfilePage({ params }: { params: Promise<{ personId: string }> }) {
  const router    = useRouter()
  const { personId } = use(params)

  const [cardData, setCardData]           = useState<LandlordCardData | null>(null)
  const [person, setPerson]               = useState<any | null>(null)
  const [properties, setProperties]       = useState<any[]>([])
  const [onboarding, setOnboarding]       = useState<any | null>(null)
  const [statements, setStatements]       = useState<any[]>([])
  const [notifPrefs, setNotifPrefs]       = useState<Record<string, boolean>>({})
  const [loading, setLoading]             = useState(true)
  const [activeTab, setActiveTab]         = useState<'overview' | 'properties' | 'aml' | 'statements' | 'notifications'>('overview')

  const [inviting, setInviting]           = useState(false)
  const [inviteMsg, setInviteMsg]         = useState<string | null>(null)
  const [togglingComms, setTogglingComms] = useState(false)
  const [savingRisk, setSavingRisk]       = useState(false)
  const [riskLevel, setRiskLevel]         = useState('')
  const [riskNotes, setRiskNotes]         = useState('')

  const supabase = createClient()

  useEffect(() => {
    async function init() {
      const user = await getCurrentUser()
      if (!user || (user.assignment?.role !== 'administrator' && user.assignment?.role !== 'admin')) {
        router.push('/login')
        return
      }

      // Load person
      const { data: p } = await supabase.from('people').select('*').eq('id', personId).single()
      if (!p) { router.push('/admin/landlords'); return }
      setPerson(p)
      setRiskLevel(p.aml_risk_level ?? '')
      setRiskNotes(p.aml_risk_notes ?? '')

      // Load properties linked to this landlord
      const { data: props } = await supabase
        .from('properties')
        .select('id, name, address, management_fee_pct, property_type, cc_emails')
        .eq('landlord_id', personId)
        .order('name')
      setProperties(props || [])

      // Load most recent onboarding record
      const { data: ob } = await supabase
        .from('landlord_onboarding')
        .select('*')
        .eq('landlord_people_id', personId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      setOnboarding(ob)

      // Load statements
      const { data: stmts } = await supabase
        .from('landlord_statements')
        .select('id, period_label, gross_rent, net_to_landlord, created_at, property_id, properties(name)')
        .in('property_id', (props || []).map((pp: any) => pp.id))
        .order('created_at', { ascending: false })
        .limit(12)
      setStatements(stmts || [])

      // Load notification prefs
      const { data: prefs } = await supabase
        .from('landlord_notification_prefs')
        .select('category, enabled')
        .eq('person_id', personId)
      const prefsMap: Record<string, boolean> = {}
      for (const pr of prefs || []) prefsMap[pr.category] = pr.enabled
      setNotifPrefs(prefsMap)

      // Build card data
      const propsMapped: LandlordProperty[] = (props || []).map((pp: any) => ({
        id: pp.id,
        name: pp.name || pp.address,
        address: pp.address,
        managementFeePct: pp.management_fee_pct ?? null,
      }))
      setCardData(fromPeople(p, propsMapped, ob))

      setLoading(false)
    }
    init()
  }, [personId, router])

  /* ── Invite to app ── */
  async function handleInvite() {
    setInviting(true); setInviteMsg(null)
    const res  = await fetch('/api/invite-tenant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ personId }) })
    const json = await res.json()
    setInviting(false)
    setInviteMsg(res.ok ? `✓ Invite sent to ${json.sentTo}` : `⚠ ${json.error}`)
    setTimeout(() => setInviteMsg(null), 6000)
  }

  /* ── Toggle master comms ── */
  async function toggleComms() {
    if (!person) return
    setTogglingComms(true)
    const next = !person.landlord_comms_enabled
    await supabase.from('people').update({ landlord_comms_enabled: next }).eq('id', personId)
    setPerson((p: any) => ({ ...p, landlord_comms_enabled: next }))
    setCardData(prev => prev ? { ...prev, commsEnabled: next } : prev)
    setTogglingComms(false)
  }

  /* ── Save AML risk ── */
  async function saveRisk() {
    setSavingRisk(true)
    await supabase.from('people').update({ aml_risk_level: riskLevel || null, aml_risk_notes: riskNotes || null }).eq('id', personId)
    setCardData(prev => prev ? { ...prev, amlRiskLevel: (riskLevel as any) || null, amlRiskNotes: riskNotes || null } : prev)
    setSavingRisk(false)
  }

  /* ── Toggle notification pref ── */
  async function togglePref(category: string) {
    const current = notifPrefs[category] ?? true
    const next    = !current
    setNotifPrefs(prev => ({ ...prev, [category]: next }))
    await supabase.from('landlord_notification_prefs')
      .upsert({ person_id: personId, category, enabled: next, updated_at: new Date().toISOString() }, { onConflict: 'person_id,category' })
  }

  if (loading || !cardData || !person) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar left={<BackButton />} />
        <div className="flex items-center justify-center py-3xl"><p className="text-sm text-neutral-400">Loading…</p></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton />} />

      <main className="mx-auto max-w-5xl px-lg py-2xl">

        {/* ── Canonical landlord card ─────────────────────────────────── */}
        <div className="mb-xl">
          {inviteMsg && (
            <div className={`mb-md rounded-xl px-md py-sm text-sm font-semibold ${inviteMsg.startsWith('✓') ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
              {inviteMsg}
            </div>
          )}
          <LandlordCard
            data={cardData}
            actions={
              <button
                onClick={handleInvite}
                disabled={inviting}
                className="rounded-lg border border-neutral-200 px-md py-xs text-xs font-semibold text-neutral-600 hover:bg-neutral-50 disabled:opacity-40 transition"
              >
                {inviting ? 'Sending…' : '✉ Send invite'}
              </button>
            }
          />
        </div>

        {/* ── Tabs ──────────────────────────────────────────────────── */}
        <div className="flex gap-xs mb-xl border-b border-neutral-200 overflow-x-auto">
          {[
            { id: 'overview'       as const, label: 'Overview' },
            { id: 'properties'     as const, label: `Properties (${properties.length})` },
            { id: 'aml'            as const, label: 'AML & Compliance' },
            { id: 'statements'     as const, label: `Statements (${statements.length})` },
            { id: 'notifications'  as const, label: 'Notifications' },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 px-lg py-md text-sm font-semibold transition whitespace-nowrap ${
                activeTab === tab.id ? 'text-neutral-900 border-b-2 border-neutral-900' : 'text-neutral-400 hover:text-neutral-700'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* OVERVIEW                                                      */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-xl">

            {/* Contact */}
            <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
              <div className="px-xl py-lg border-b border-neutral-100">
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Contact info</p>
              </div>
              <div className="px-xl py-lg space-y-md text-sm">
                <div><p className="text-xs text-neutral-400 mb-xs">Email</p><p className="font-semibold text-neutral-900 break-all">{person.email}</p></div>
                <div><p className="text-xs text-neutral-400 mb-xs">Phone</p><p className="font-semibold text-neutral-900">{person.phone || '—'}</p></div>
                {person.home_address && <div><p className="text-xs text-neutral-400 mb-xs">Home address</p><p className="font-semibold text-neutral-900">{person.home_address}</p></div>}
                {person.company && <div><p className="text-xs text-neutral-400 mb-xs">Company</p><p className="font-semibold text-neutral-900">{person.company}</p></div>}
                {person.company_number && <div><p className="text-xs text-neutral-400 mb-xs">Co. number</p><p className="font-semibold text-neutral-900">{person.company_number}</p></div>}
                <div><p className="text-xs text-neutral-400 mb-xs">Member since</p><p className="font-semibold text-neutral-900">{fmt(person.created_at)}</p></div>
              </div>
            </div>

            {/* Onboarding status */}
            <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
              <div className="px-xl py-lg border-b border-neutral-100">
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Onboarding status</p>
              </div>
              <div className="px-xl py-lg space-y-md text-sm">
                {onboarding ? (
                  <>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-neutral-400">Stage</p>
                      <span className={`text-xs font-semibold px-sm py-xs rounded-full border ${
                        onboarding.stage >= 6
                          ? 'bg-green-100 text-green-800 border-green-200'
                          : 'bg-blue-50 text-blue-700 border-blue-200'
                      }`}>
                        {onboarding.stage >= 6 ? '✓ Fully onboarded' : `Stage ${onboarding.stage} · ${STAGES[onboarding.stage]}`}
                      </span>
                    </div>
                    <div className="flex items-center justify-between"><p className="text-xs text-neutral-400">Entity type</p><p className="font-semibold text-neutral-900 capitalize">{onboarding.entity_type || '—'}</p></div>
                    {onboarding.identity_verified != null && (
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-neutral-400">Identity verified</p>
                        <span className={`text-xs font-semibold px-sm py-xs rounded-full border ${onboarding.identity_verified ? 'bg-green-100 text-green-800 border-green-200' : 'bg-neutral-100 text-neutral-500 border-neutral-200'}`}>
                          {onboarding.identity_verified ? '✓ Yes' : 'Not yet'}
                        </span>
                      </div>
                    )}
                    {onboarding.onboarded_at && <div><p className="text-xs text-neutral-400 mb-xs">Onboarded</p><p className="font-semibold text-neutral-900">{fmt(onboarding.onboarded_at)}</p></div>}
                    {onboarding.docs_received_at && <div><p className="text-xs text-neutral-400 mb-xs">Docs received</p><p className="font-semibold text-neutral-900">{fmt(onboarding.docs_received_at)}</p></div>}
                  </>
                ) : (
                  <p className="text-neutral-400 text-sm py-md text-center">No onboarding record linked.</p>
                )}
              </div>
            </div>

            {/* Comms master switch */}
            <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden md:col-span-2">
              <div className="px-xl py-lg border-b border-neutral-100 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Communications</p>
                <button
                  onClick={toggleComms}
                  disabled={togglingComms}
                  className={`text-xs font-semibold px-md py-xs rounded-lg border transition ${
                    person.landlord_comms_enabled
                      ? 'border-red-200 text-red-700 hover:bg-red-50'
                      : 'border-green-200 text-green-700 hover:bg-green-50'
                  }`}
                >
                  {togglingComms ? 'Saving…' : person.landlord_comms_enabled ? 'Pause all comms' : 'Enable comms'}
                </button>
              </div>
              <div className="px-xl py-lg text-sm">
                <p className="text-neutral-500">
                  {person.landlord_comms_enabled
                    ? 'Email notifications are currently active. Toggle individual categories in the Notifications tab.'
                    : 'All communications are paused. No emails will be sent until comms are enabled.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* PROPERTIES                                                    */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'properties' && (
          <div className="space-y-md">
            {properties.length === 0 ? (
              <div className="rounded-xl border border-neutral-200 bg-white p-xl text-center">
                <p className="text-neutral-400 text-sm">No properties linked to this landlord.</p>
              </div>
            ) : (
              <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wider text-neutral-400 border-b border-neutral-100">
                      <th className="px-xl py-sm">Property</th>
                      <th className="px-xl py-sm hidden sm:table-cell">Type</th>
                      <th className="px-xl py-sm hidden md:table-cell text-right">Mgmt fee</th>
                      <th className="px-xl py-sm text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {properties.map(p => (
                      <tr key={p.id} className="border-t border-neutral-100 hover:bg-neutral-50 transition">
                        <td className="px-xl py-md">
                          <p className="font-semibold text-neutral-900">{p.name || p.address}</p>
                          {p.name && <p className="text-xs text-neutral-400">{p.address}</p>}
                          {p.cc_emails && <p className="text-xs text-neutral-400 mt-xs">CC: {p.cc_emails}</p>}
                        </td>
                        <td className="px-xl py-md hidden sm:table-cell text-neutral-500 capitalize text-xs">{p.property_type || '—'}</td>
                        <td className="px-xl py-md hidden md:table-cell text-right text-neutral-600">{p.management_fee_pct ? `${p.management_fee_pct}%` : '—'}</td>
                        <td className="px-xl py-md text-right">
                          <a href={`/admin/properties/${p.id}`} className="text-xs font-semibold text-blue-600 hover:underline">Open →</a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* AML & COMPLIANCE                                              */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'aml' && (
          <div className="space-y-xl">

            {/* Risk assessment */}
            <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
              <div className="px-xl py-lg border-b border-neutral-100">
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">AML risk assessment</p>
              </div>
              <div className="p-xl space-y-lg">
                <div>
                  <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide block mb-sm">Risk level</label>
                  <div className="flex gap-sm">
                    {(['low', 'medium', 'high'] as const).map(level => (
                      <button
                        key={level}
                        onClick={() => setRiskLevel(level)}
                        className={`px-lg py-sm text-sm font-semibold rounded-lg border capitalize transition ${
                          riskLevel === level
                            ? level === 'low'    ? 'bg-green-100 border-green-300 text-green-800'
                            : level === 'medium' ? 'bg-amber-100 border-amber-300 text-amber-800'
                            : 'bg-red-100 border-red-300 text-red-800'
                            : 'border-neutral-200 text-neutral-500 hover:bg-neutral-50'
                        }`}
                      >
                        {level}
                      </button>
                    ))}
                    {riskLevel && (
                      <button onClick={() => setRiskLevel('')} className="text-xs text-neutral-400 hover:text-neutral-600 px-sm">Clear</button>
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide block mb-sm">Notes / reason</label>
                  <textarea
                    value={riskNotes}
                    onChange={e => setRiskNotes(e.target.value)}
                    rows={3}
                    className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                    placeholder="Reason for risk rating, mitigation steps…"
                  />
                </div>
                <button
                  onClick={saveRisk}
                  disabled={savingRisk}
                  className="px-xl py-sm rounded-lg bg-neutral-900 text-white text-sm font-semibold hover:bg-neutral-700 disabled:opacity-40 transition"
                >
                  {savingRisk ? 'Saving…' : 'Save risk assessment'}
                </button>
              </div>
            </div>

            {/* Onboarding AML detail */}
            {onboarding && (
              <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
                <div className="px-xl py-lg border-b border-neutral-100">
                  <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Last AML check · {fmt(onboarding.docs_received_at || onboarding.created_at)}</p>
                </div>
                <div className="p-xl grid grid-cols-2 md:grid-cols-3 gap-lg text-sm">
                  <div><p className="text-xs text-neutral-400 mb-xs">Entity type</p><p className="font-semibold text-neutral-900 capitalize">{onboarding.entity_type || '—'}</p></div>
                  <div><p className="text-xs text-neutral-400 mb-xs">Risk level</p><p className="font-semibold text-neutral-900 capitalize">{onboarding.risk_level || '—'}</p></div>
                  <div>
                    <p className="text-xs text-neutral-400 mb-xs">Identity verified</p>
                    <p className="font-semibold text-neutral-900">{onboarding.identity_verified ? '✓ Yes' : 'No'}</p>
                  </div>
                  {onboarding.identity_docs?.length > 0 && (
                    <div className="md:col-span-3">
                      <p className="text-xs text-neutral-400 mb-xs">Identity documents</p>
                      <p className="font-semibold text-neutral-900">{onboarding.identity_docs.join(', ')}</p>
                    </div>
                  )}
                  {onboarding.verification_notes && (
                    <div className="md:col-span-3">
                      <p className="text-xs text-neutral-400 mb-xs">Verification notes</p>
                      <p className="text-neutral-700">{onboarding.verification_notes}</p>
                    </div>
                  )}
                </div>
                {onboarding.is_refresh && (
                  <div className="px-xl pb-lg">
                    <span className="text-xs font-semibold px-sm py-xs rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                      Refresh check · {onboarding.refresh_reason || 'periodic review'}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* STATEMENTS                                                    */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'statements' && (
          <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
            {statements.length === 0 ? (
              <div className="p-xl text-center text-neutral-400 text-sm">No statements yet.</div>
            ) : (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wider text-neutral-400 border-b border-neutral-100">
                    <th className="px-xl py-sm">Period</th>
                    <th className="px-xl py-sm hidden sm:table-cell">Property</th>
                    <th className="px-xl py-sm text-right">Gross rent</th>
                    <th className="px-xl py-sm text-right">Net to landlord</th>
                  </tr>
                </thead>
                <tbody>
                  {statements.map(s => (
                    <tr key={s.id} className="border-t border-neutral-100 hover:bg-neutral-50 transition cursor-pointer" onClick={() => window.open(`/landlord/statement/${s.id}`, '_blank')}>
                      <td className="px-xl py-md font-semibold text-neutral-900">{s.period_label || fmt(s.created_at)}</td>
                      <td className="px-xl py-md hidden sm:table-cell text-neutral-500">{(s as any).properties?.name || '—'}</td>
                      <td className="px-xl py-md text-right text-neutral-600">£{Number(s.gross_rent || 0).toLocaleString()}</td>
                      <td className="px-xl py-md text-right font-semibold text-neutral-900">£{Number(s.net_to_landlord || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* NOTIFICATIONS                                                 */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'notifications' && (
          <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
            <div className="px-xl py-lg border-b border-neutral-100">
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Notification categories</p>
              <p className="text-xs text-neutral-400 mt-xs">Master comms switch must be on for any of these to send.</p>
            </div>
            <div className="divide-y divide-neutral-100">
              {NOTIF_CATEGORIES.map(cat => {
                const enabled = notifPrefs[cat.key] ?? true
                return (
                  <div key={cat.key} className="px-xl py-md flex items-center justify-between">
                    <p className="text-sm font-medium text-neutral-900">{cat.label}</p>
                    <button
                      onClick={() => togglePref(cat.key)}
                      className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors ${enabled ? 'bg-neutral-900' : 'bg-neutral-200'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

      </main>
    </div>
  )
}
