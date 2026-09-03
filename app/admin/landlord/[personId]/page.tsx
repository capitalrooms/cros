'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import LandlordCard, { fromPeople, LandlordCardData, LandlordProperty } from '@/app/components/LandlordCard'

// ── Constants ────────────────────────────────────────────────────────────────

const STAGES: Record<number, string> = {
  1: 'New enquiry', 2: 'Welcome pack sent', 3: 'Docs received',
  4: 'Verified', 5: 'Agreement sent', 6: 'Fully onboarded',
}

const VERIFICATION_CHECKS = [
  { key: 'id_genuine',      label: 'ID document is genuine and legible' },
  { key: 'id_matches_name', label: 'ID matches the name provided' },
  { key: 'poa_dated',       label: 'Proof of address dated within 3 months' },
  { key: 'ownership_match', label: 'Proof of ownership matches the property' },
  { key: 'sanctions_check', label: 'Sanctions list check completed — no match' },
  { key: 'pep_check',       label: 'PEP check completed — no flag' },
]

const DOCUMENT_TYPES = [
  { key: 'passport',       label: 'Passport' },
  { key: 'photo_id',       label: 'Photo ID / Driving Licence' },
  { key: 'utility_bill',   label: 'Utility bill (proof of address)' },
  { key: 'bank_statement', label: 'Bank statement' },
  { key: 'proof_ownership',label: 'Proof of ownership (Land Registry / title deeds)' },
  { key: 'mortgage_letter',label: 'Mortgage letter' },
  { key: 'company_docs',   label: 'Company registration documents' },
  { key: 'other',          label: 'Other document' },
]

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

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function riskBadge(level: string | null | undefined) {
  if (!level) return <span className="text-xs text-neutral-400">Not assessed</span>
  const map: Record<string, string> = {
    low:    'bg-green-100 text-green-800 border-green-200',
    medium: 'bg-amber-100 text-amber-800 border-amber-200',
    high:   'bg-red-100 text-red-800 border-red-200',
  }
  return (
    <span className={`text-xs font-semibold px-sm py-xs rounded-full border capitalize ${map[level] || 'bg-neutral-100 text-neutral-600 border-neutral-200'}`}>
      {level} risk
    </span>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function LandlordProfilePage({ params }: { params: Promise<{ personId: string }> }) {
  const router       = useRouter()
  const { personId } = use(params)

  const [cardData, setCardData]         = useState<LandlordCardData | null>(null)
  const [person, setPerson]             = useState<any | null>(null)
  const [properties, setProperties]     = useState<any[]>([])
  const [amlRecords, setAmlRecords]     = useState<any[]>([])   // ALL onboarding/AML records
  const [statements, setStatements]     = useState<any[]>([])
  const [notifPrefs, setNotifPrefs]     = useState<Record<string, boolean>>({})
  const [loading, setLoading]           = useState(true)
  const [activeTab, setActiveTab]       = useState<'overview' | 'properties' | 'aml' | 'statements' | 'notifications'>('overview')

  // AML tab state
  const [expandedAml, setExpandedAml]   = useState<string | null>(null)
  const [showNewAml, setShowNewAml]     = useState(false)
  const [savingNewAml, setSavingNewAml] = useState(false)
  const [newAml, setNewAml] = useState({
    entity_type:         'individual',
    risk_level:          '',
    risk_reason:         '',
    verification_notes:  '',
    docs_received_at:    new Date().toISOString().split('T')[0],
    identity_verified:   false,
    verification_checks: [] as string[],
    identity_docs:       [] as string[],
  })

  // Other action state
  const [inviting, setInviting]           = useState(false)
  const [inviteMsg, setInviteMsg]         = useState<string | null>(null)
  const [togglingComms, setTogglingComms] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    async function init() {
      const user = await getCurrentUser()
      if (!user || (user.assignment?.role !== 'administrator' && user.assignment?.role !== 'admin')) {
        router.push('/login'); return
      }

      const { data: p } = await supabase.from('people').select('*').eq('id', personId).single()
      if (!p) { router.push('/admin/landlords'); return }
      setPerson(p)

      const { data: props } = await supabase
        .from('properties')
        .select('id, name, address, management_fee_pct, property_type, cc_emails')
        .eq('landlord_id', personId).order('name')
      setProperties(props || [])

      // Load ALL AML / onboarding records — newest first
      const { data: records } = await supabase
        .from('landlord_onboarding')
        .select('*')
        .eq('landlord_people_id', personId)
        .order('created_at', { ascending: false })
      setAmlRecords(records || [])

      const { data: stmts } = await supabase
        .from('landlord_statements')
        .select('id, period_label, gross_rent, net_to_landlord, created_at, property_id, properties(name)')
        .in('property_id', (props || []).map((pp: any) => pp.id))
        .order('created_at', { ascending: false }).limit(12)
      setStatements(stmts || [])

      const { data: prefs } = await supabase
        .from('landlord_notification_prefs').select('category, enabled').eq('person_id', personId)
      const prefsMap: Record<string, boolean> = {}
      for (const pr of prefs || []) prefsMap[pr.category] = pr.enabled
      setNotifPrefs(prefsMap)

      const propsMapped: LandlordProperty[] = (props || []).map((pp: any) => ({
        id: pp.id, name: pp.name || pp.address, address: pp.address,
        managementFeePct: pp.management_fee_pct ?? null,
      }))
      const latestOb = (records || [])[0] ?? null
      setCardData(fromPeople(p, propsMapped, latestOb))
      setLoading(false)
    }
    init()
  }, [personId, router])

  /* ── Invite ── */
  async function handleInvite() {
    setInviting(true); setInviteMsg(null)
    const res  = await fetch('/api/invite-tenant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ personId }) })
    const json = await res.json()
    setInviting(false)
    setInviteMsg(res.ok ? `✓ Invite sent to ${json.sentTo}` : `⚠ ${json.error}`)
    setTimeout(() => setInviteMsg(null), 6000)
  }

  /* ── Toggle comms ── */
  async function toggleComms() {
    if (!person) return
    setTogglingComms(true)
    const next = !person.landlord_comms_enabled
    await supabase.from('people').update({ landlord_comms_enabled: next }).eq('id', personId)
    setPerson((p: any) => ({ ...p, landlord_comms_enabled: next }))
    setCardData(prev => prev ? { ...prev, commsEnabled: next } : prev)
    setTogglingComms(false)
  }

  /* ── Toggle notif pref ── */
  async function togglePref(category: string) {
    const next = !(notifPrefs[category] ?? true)
    setNotifPrefs(prev => ({ ...prev, [category]: next }))
    await supabase.from('landlord_notification_prefs')
      .upsert({ person_id: personId, category, enabled: next, updated_at: new Date().toISOString() }, { onConflict: 'person_id,category' })
  }

  /* ── Save new AML check ── */
  async function saveNewAml() {
    if (!newAml.risk_level) { alert('Please select a risk level before saving.'); return }
    setSavingNewAml(true)
    const { data, error } = await supabase.from('landlord_onboarding').insert({
      landlord_people_id:  personId,
      email:               person.email,
      full_name:           person.company || [person.first_name, person.last_name].filter(Boolean).join(' ') || person.email,
      stage:               6,
      is_refresh:          amlRecords.length > 0,
      refresh_reason:      amlRecords.length > 0 ? 'Periodic review' : null,
      entity_type:         newAml.entity_type,
      risk_level:          newAml.risk_level,
      risk_reason:         newAml.risk_reason || null,
      verification_notes:  newAml.verification_notes || null,
      docs_received_at:    newAml.docs_received_at || null,
      identity_verified:   newAml.identity_verified,
      verification_checks: newAml.verification_checks,
      identity_docs:       newAml.identity_docs,
      onboarded_at:        new Date().toISOString(),
    }).select().single()

    if (!error && data) {
      // Also update person-level risk
      await supabase.from('people').update({
        aml_risk_level: newAml.risk_level,
        aml_risk_notes: newAml.risk_reason || null,
      }).eq('id', personId)
      setPerson((p: any) => ({ ...p, aml_risk_level: newAml.risk_level, aml_risk_notes: newAml.risk_reason }))
      setAmlRecords(prev => [data, ...prev])
      setExpandedAml(data.id)
      setShowNewAml(false)
      setNewAml({ entity_type: 'individual', risk_level: '', risk_reason: '', verification_notes: '', docs_received_at: new Date().toISOString().split('T')[0], identity_verified: false, verification_checks: [], identity_docs: [] })
    } else {
      alert(error?.message || 'Error saving AML record')
    }
    setSavingNewAml(false)
  }

  function toggleCheck(key: string) {
    setNewAml(prev => ({
      ...prev,
      verification_checks: prev.verification_checks.includes(key)
        ? prev.verification_checks.filter(k => k !== key)
        : [...prev.verification_checks, key]
    }))
  }

  function toggleDoc(key: string) {
    setNewAml(prev => ({
      ...prev,
      identity_docs: prev.identity_docs.includes(key)
        ? prev.identity_docs.filter(k => k !== key)
        : [...prev.identity_docs, key]
    }))
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

        {/* Landlord card */}
        <div className="mb-xl">
          {inviteMsg && (
            <div className={`mb-md rounded-xl px-md py-sm text-sm font-semibold ${inviteMsg.startsWith('✓') ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
              {inviteMsg}
            </div>
          )}
          <LandlordCard
            data={cardData}
            actions={
              <button onClick={handleInvite} disabled={inviting}
                className="rounded-lg border border-neutral-200 px-md py-xs text-xs font-semibold text-neutral-600 hover:bg-neutral-50 disabled:opacity-40 transition">
                {inviting ? 'Sending…' : '✉ Send invite'}
              </button>
            }
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-xs mb-xl border-b border-neutral-200 overflow-x-auto">
          {[
            { id: 'overview'      as const, label: 'Overview' },
            { id: 'properties'   as const, label: `Properties (${properties.length})` },
            { id: 'aml'          as const, label: `AML & Compliance (${amlRecords.length})` },
            { id: 'statements'   as const, label: `Statements (${statements.length})` },
            { id: 'notifications'as const, label: 'Notifications' },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 px-lg py-md text-sm font-semibold transition whitespace-nowrap ${
                activeTab === tab.id ? 'text-neutral-900 border-b-2 border-neutral-900' : 'text-neutral-400 hover:text-neutral-700'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ══ OVERVIEW ══ */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-xl">
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

            <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
              <div className="px-xl py-lg border-b border-neutral-100">
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">AML status</p>
              </div>
              <div className="px-xl py-lg space-y-md text-sm">
                {amlRecords.length > 0 ? (
                  <>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-neutral-400">Current risk</p>
                      {riskBadge(person.aml_risk_level)}
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-neutral-400">Last checked</p>
                      <p className="font-semibold text-neutral-900">{fmt(amlRecords[0].docs_received_at || amlRecords[0].created_at)}</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-neutral-400">Identity verified</p>
                      <span className={`text-xs font-semibold px-sm py-xs rounded-full border ${amlRecords[0].identity_verified ? 'bg-green-100 text-green-800 border-green-200' : 'bg-neutral-100 text-neutral-500 border-neutral-200'}`}>
                        {amlRecords[0].identity_verified ? '✓ Verified' : 'Not verified'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-neutral-400">Check history</p>
                      <button onClick={() => setActiveTab('aml')} className="text-xs font-semibold text-blue-600 hover:underline">
                        {amlRecords.length} record{amlRecords.length !== 1 ? 's' : ''} →
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="py-md text-center">
                    <p className="text-neutral-400 text-sm mb-md">No AML checks on record.</p>
                    <button onClick={() => { setActiveTab('aml'); setShowNewAml(true) }}
                      className="text-xs font-semibold text-white bg-neutral-900 px-md py-sm rounded-lg hover:bg-neutral-700 transition">
                      Record first AML check →
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden md:col-span-2">
              <div className="px-xl py-lg border-b border-neutral-100 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Communications</p>
                <button onClick={toggleComms} disabled={togglingComms}
                  className={`text-xs font-semibold px-md py-xs rounded-lg border transition ${
                    person.landlord_comms_enabled ? 'border-red-200 text-red-700 hover:bg-red-50' : 'border-green-200 text-green-700 hover:bg-green-50'
                  }`}>
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

        {/* ══ PROPERTIES ══ */}
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

        {/* ══ AML & COMPLIANCE ══ */}
        {activeTab === 'aml' && (
          <div className="space-y-lg">

            {/* Header row */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-neutral-900">AML check history</h2>
                <p className="text-xs text-neutral-500 mt-xs">Each entry is a complete due-diligence event. Expand to see the full report.</p>
              </div>
              {!showNewAml && (
                <button onClick={() => setShowNewAml(true)}
                  className="text-sm font-semibold bg-neutral-900 text-white px-lg py-sm rounded-xl hover:bg-neutral-700 transition">
                  + New AML check
                </button>
              )}
            </div>

            {/* ── New AML check form ── */}
            {showNewAml && (
              <div className="rounded-xl border-2 border-neutral-900 bg-white overflow-hidden">
                <div className="px-xl py-lg border-b border-neutral-100 flex items-center justify-between">
                  <p className="text-sm font-bold text-neutral-900">{amlRecords.length > 0 ? 'Periodic AML review' : 'Initial AML check'}</p>
                  <button onClick={() => setShowNewAml(false)} className="text-neutral-400 hover:text-neutral-700 text-xl">×</button>
                </div>
                <div className="p-xl space-y-xl">

                  {/* Entity type + date */}
                  <div className="grid grid-cols-2 gap-lg">
                    <div>
                      <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide block mb-sm">Entity type</label>
                      <div className="flex gap-sm">
                        {['individual', 'company'].map(t => (
                          <button key={t} onClick={() => setNewAml(prev => ({ ...prev, entity_type: t }))}
                            className={`px-lg py-sm text-sm font-semibold rounded-lg border capitalize transition ${newAml.entity_type === t ? 'bg-neutral-900 text-white border-neutral-900' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}>
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide block mb-sm">Date docs received</label>
                      <input type="date" value={newAml.docs_received_at}
                        onChange={e => setNewAml(prev => ({ ...prev, docs_received_at: e.target.value }))}
                        className="px-md py-sm border border-neutral-200 rounded-lg text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900 w-full" />
                    </div>
                  </div>

                  {/* Documents collected */}
                  <div>
                    <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide block mb-sm">Documents collected</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-sm">
                      {DOCUMENT_TYPES.map(doc => (
                        <label key={doc.key} className={`flex items-center gap-sm p-md rounded-lg border cursor-pointer transition ${newAml.identity_docs.includes(doc.key) ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200 hover:border-neutral-300'}`}>
                          <input type="checkbox" checked={newAml.identity_docs.includes(doc.key)} onChange={() => toggleDoc(doc.key)} className="rounded" />
                          <span className="text-sm text-neutral-800">{doc.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Verification checklist */}
                  <div>
                    <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide block mb-sm">Verification checklist</label>
                    <div className="space-y-sm">
                      {VERIFICATION_CHECKS.map(check => (
                        <label key={check.key} className={`flex items-center gap-md p-md rounded-lg border cursor-pointer transition ${newAml.verification_checks.includes(check.key) ? 'border-green-300 bg-green-50' : 'border-neutral-200 hover:border-neutral-300'}`}>
                          <input type="checkbox" checked={newAml.verification_checks.includes(check.key)} onChange={() => toggleCheck(check.key)} className="rounded flex-shrink-0" />
                          <span className="text-sm text-neutral-800">{check.label}</span>
                          {newAml.verification_checks.includes(check.key) && <span className="ml-auto text-green-600 text-sm">✓</span>}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Identity verified + risk level */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-lg">
                    <div>
                      <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide block mb-sm">Identity verified?</label>
                      <div className="flex gap-sm">
                        <button onClick={() => setNewAml(prev => ({ ...prev, identity_verified: true }))}
                          className={`px-lg py-sm text-sm font-semibold rounded-lg border transition ${newAml.identity_verified ? 'bg-green-600 text-white border-green-600' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}>
                          ✓ Yes
                        </button>
                        <button onClick={() => setNewAml(prev => ({ ...prev, identity_verified: false }))}
                          className={`px-lg py-sm text-sm font-semibold rounded-lg border transition ${!newAml.identity_verified ? 'bg-neutral-200 text-neutral-700 border-neutral-300' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}>
                          Not yet
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide block mb-sm">Risk level <span className="text-red-500">*</span></label>
                      <div className="flex gap-sm">
                        {(['low', 'medium', 'high'] as const).map(level => (
                          <button key={level} onClick={() => setNewAml(prev => ({ ...prev, risk_level: level }))}
                            className={`px-lg py-sm text-sm font-semibold rounded-lg border capitalize transition ${
                              newAml.risk_level === level
                                ? level === 'low' ? 'bg-green-100 border-green-300 text-green-800'
                                : level === 'medium' ? 'bg-amber-100 border-amber-300 text-amber-800'
                                : 'bg-red-100 border-red-300 text-red-800'
                                : 'border-neutral-200 text-neutral-500 hover:bg-neutral-50'
                            }`}>
                            {level}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Notes */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-lg">
                    <div>
                      <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide block mb-sm">Risk reason / notes</label>
                      <textarea value={newAml.risk_reason} onChange={e => setNewAml(prev => ({ ...prev, risk_reason: e.target.value }))} rows={3}
                        className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                        placeholder="Reason for risk rating, source of wealth notes…" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide block mb-sm">Verification notes</label>
                      <textarea value={newAml.verification_notes} onChange={e => setNewAml(prev => ({ ...prev, verification_notes: e.target.value }))} rows={3}
                        className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                        placeholder="Notes on ID checks, discrepancies found, actions taken…" />
                    </div>
                  </div>

                  <div className="flex gap-sm pt-sm border-t border-neutral-100">
                    <button onClick={saveNewAml} disabled={savingNewAml || !newAml.risk_level}
                      className="px-xl py-sm rounded-xl bg-neutral-900 text-white text-sm font-semibold hover:bg-neutral-700 disabled:opacity-40 transition">
                      {savingNewAml ? 'Saving…' : 'Save AML record'}
                    </button>
                    <button onClick={() => setShowNewAml(false)}
                      className="px-xl py-sm rounded-xl border border-neutral-200 text-sm font-semibold text-neutral-600 hover:bg-neutral-50 transition">
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── AML record rows ── */}
            {amlRecords.length === 0 && !showNewAml ? (
              <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-2xl text-center">
                <p className="text-neutral-400 text-sm mb-md">No AML records on file for this landlord.</p>
                <button onClick={() => setShowNewAml(true)}
                  className="text-sm font-semibold bg-neutral-900 text-white px-xl py-sm rounded-xl hover:bg-neutral-700 transition">
                  Record first AML check
                </button>
              </div>
            ) : (
              <div className="space-y-md">
                {amlRecords.map((rec, idx) => {
                  const isOpen    = expandedAml === rec.id
                  const docs      = rec.identity_docs as string[] || []
                  const checks    = rec.verification_checks as string[] || []
                  const isRefresh = rec.is_refresh

                  return (
                    <div key={rec.id} className={`rounded-xl border bg-white overflow-hidden transition ${isOpen ? 'border-neutral-300 shadow-sm' : 'border-neutral-200'}`}>
                      {/* Row header — always visible */}
                      <button
                        className="w-full text-left px-xl py-lg"
                        onClick={() => setExpandedAml(isOpen ? null : rec.id)}
                      >
                        <div className="flex items-center gap-lg flex-wrap">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-sm flex-wrap">
                              <span className="text-sm font-bold text-neutral-900">
                                {isRefresh ? 'Periodic review' : 'Initial AML check'}
                              </span>
                              {idx === 0 && (
                                <span className="text-xs font-semibold px-sm py-xs rounded-full bg-neutral-100 text-neutral-600 border border-neutral-200">
                                  Latest
                                </span>
                              )}
                              {riskBadge(rec.risk_level)}
                              {rec.identity_verified && (
                                <span className="text-xs font-semibold px-sm py-xs rounded-full bg-green-50 text-green-700 border border-green-200">
                                  ✓ ID verified
                                </span>
                              )}
                              {rec.entity_type && (
                                <span className="text-xs text-neutral-400 capitalize">{rec.entity_type}</span>
                              )}
                            </div>
                            <p className="text-xs text-neutral-400 mt-xs">
                              Docs received {fmt(rec.docs_received_at)} · Added {fmt(rec.created_at)}
                              {rec.onboarded_at ? ` · Completed ${fmt(rec.onboarded_at)}` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-md text-xs text-neutral-400 shrink-0">
                            <span>{docs.length} doc{docs.length !== 1 ? 's' : ''}</span>
                            <span>{checks.length}/{VERIFICATION_CHECKS.length} checks</span>
                            <span className="text-neutral-300">{isOpen ? '▲' : '▼'}</span>
                          </div>
                        </div>
                      </button>

                      {/* Expanded full report */}
                      {isOpen && (
                        <div className="border-t border-neutral-100 px-xl py-xl space-y-xl">

                          {/* Documents collected */}
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-md">Documents collected</p>
                            {docs.length > 0 ? (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-sm">
                                {DOCUMENT_TYPES.map(doc => {
                                  const collected = docs.includes(doc.key)
                                  return (
                                    <div key={doc.key} className={`flex items-center gap-sm px-md py-sm rounded-lg border text-sm ${collected ? 'border-green-200 bg-green-50' : 'border-neutral-100 bg-neutral-50 opacity-40'}`}>
                                      <span className={collected ? 'text-green-600' : 'text-neutral-300'}>
                                        {collected ? '✓' : '○'}
                                      </span>
                                      <span className={collected ? 'text-neutral-800 font-medium' : 'text-neutral-400'}>{doc.label}</span>
                                    </div>
                                  )
                                })}
                              </div>
                            ) : (
                              <p className="text-sm text-neutral-400 italic">No documents recorded for this check.</p>
                            )}
                          </div>

                          {/* Verification checklist */}
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-md">Verification checklist</p>
                            <div className="space-y-sm">
                              {VERIFICATION_CHECKS.map(check => {
                                const passed = checks.includes(check.key)
                                return (
                                  <div key={check.key} className={`flex items-center gap-sm px-md py-sm rounded-lg border text-sm ${passed ? 'border-green-200 bg-green-50' : 'border-neutral-100 bg-neutral-50'}`}>
                                    <span className={passed ? 'text-green-600 font-bold' : 'text-neutral-300'}>
                                      {passed ? '✓' : '○'}
                                    </span>
                                    <span className={passed ? 'text-neutral-800' : 'text-neutral-400'}>{check.label}</span>
                                  </div>
                                )
                              })}
                            </div>
                          </div>

                          {/* Notes + dates grid */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-xl">
                            {(rec.risk_reason || rec.verification_notes) && (
                              <div className="space-y-lg">
                                {rec.risk_reason && (
                                  <div>
                                    <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-xs">Risk reason</p>
                                    <p className="text-sm text-neutral-700">{rec.risk_reason}</p>
                                  </div>
                                )}
                                {rec.verification_notes && (
                                  <div>
                                    <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-xs">Verification notes</p>
                                    <p className="text-sm text-neutral-700">{rec.verification_notes}</p>
                                  </div>
                                )}
                              </div>
                            )}

                            <div className="space-y-sm text-sm">
                              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-xs">Timeline</p>
                              {rec.created_at && <p className="text-neutral-500">📌 Record created · {fmt(rec.created_at)}</p>}
                              {rec.welcome_sent_at && <p className="text-neutral-500">✉️ Welcome pack sent · {fmt(rec.welcome_sent_at)}</p>}
                              {rec.docs_received_at && <p className="text-neutral-500">📂 Docs received · {fmt(rec.docs_received_at)}</p>}
                              {rec.verified_at && <p className="text-neutral-500">✅ Verified · {fmt(rec.verified_at)}</p>}
                              {rec.onboarded_at && <p className="text-neutral-500">🎉 Completed · {fmt(rec.onboarded_at)}</p>}
                            </div>
                          </div>

                          {isRefresh && rec.refresh_reason && (
                            <p className="text-xs text-neutral-400 italic border-t border-neutral-100 pt-md">
                              Refresh reason: {rec.refresh_reason}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ══ STATEMENTS ══ */}
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
                    <tr key={s.id} className="border-t border-neutral-100 hover:bg-neutral-50 transition cursor-pointer"
                      onClick={() => window.open(`/landlord/statement/${s.id}`, '_blank')}>
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

        {/* ══ NOTIFICATIONS ══ */}
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
                    <button onClick={() => togglePref(cat.key)}
                      className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors ${enabled ? 'bg-neutral-900' : 'bg-neutral-200'}`}>
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
