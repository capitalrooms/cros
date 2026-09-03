'use client'

import { useState, useEffect, use } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'

interface TenantProfile {
  id: string
  name: string
  email: string
  phone: string
  role: string
  created_at: string
  date_of_birth?: string
  nationality?: string
  right_to_rent_until?: string
  right_to_rent_ref?: string
  verified_income_annual?: number
  credit_check_result?: string
  reference_status?: string
}

interface TenancyInfo {
  id: string
  room_id: string
  property_id: string
  start_date: string
  end_date: string | null
  rent_monthly: number
  room?: { name: string }
  property?: { address: string }
}

interface Communication {
  id: string
  title: string
  message: string
  notification_type: string
  status: string
  created_at: string
}

interface SafetyCheck {
  id: string
  check_type: string
  response: string
  created_at: string
}

interface TenantReference {
  id: string
  reference_source: string | null
  report_date: string | null
  overall_decision: string | null
  legal_name: string | null
  date_of_birth: string | null
  nationality: string | null
  right_to_rent_status: string | null
  right_to_rent_until: string | null
  right_to_rent_ref: string | null
  right_to_rent_check_date: string | null
  id_type_1: string | null
  id_type_2: string | null
  id_verified_1: boolean
  id_verified_2: boolean
  verified_income_annual: number | null
  max_affordable_rent_monthly: number | null
  credit_result: string | null
  prev_landlord_ref_result: string | null
  prev_landlord_ref_name: string | null
  aml_result: string | null
  previous_addresses: any[]
  imported_at: string
}

// Fields that can be synced from reference to people table
const MERGE_FIELDS: { key: string; label: string; format?: (v: any) => string }[] = [
  { key: 'legal_name',             label: 'Legal name' },
  { key: 'date_of_birth',         label: 'Date of birth' },
  { key: 'nationality',            label: 'Nationality' },
  { key: 'right_to_rent_until',   label: 'Right to rent until' },
  { key: 'right_to_rent_ref',     label: 'Right to rent ref' },
  { key: 'verified_income_annual', label: 'Verified annual income', format: (v) => `£${Number(v).toLocaleString()}` },
  { key: 'credit_result',          label: 'Credit check result' },
  { key: 'overall_decision',       label: 'Reference status' },
]

// Map from reference field to people column (for display comparison)
const PEOPLE_FIELD_MAP: Record<string, keyof TenantProfile> = {
  legal_name:             'name',
  date_of_birth:          'date_of_birth',
  nationality:            'nationality',
  right_to_rent_until:    'right_to_rent_until',
  right_to_rent_ref:      'right_to_rent_ref',
  verified_income_annual: 'verified_income_annual',
  credit_result:          'credit_check_result',
  overall_decision:       'reference_status',
}

export default function TenantProfilePage({
  params
}: {
  params: Promise<{ personId: string }>
}) {
  const router = useRouter()
  const { personId } = use(params)

  const [tenant, setTenant]                 = useState<TenantProfile | null>(null)
  const [tenancies, setTenancies]           = useState<TenancyInfo[]>([])
  const [communications, setCommunications] = useState<Communication[]>([])
  const [safetyChecks, setSafetyChecks]     = useState<SafetyCheck[]>([])
  const [referenceHistory, setReferenceHistory] = useState<TenantReference[]>([])
  const [loading, setLoading]               = useState(true)
  const searchParams = useSearchParams()
  const initialTab = (searchParams.get('tab') as any) || 'overview'
  const [activeTab, setActiveTab]           = useState<'overview' | 'tenancy' | 'communications' | 'safety' | 'reference' | 'history'>(initialTab)
  const [inviting, setInviting]             = useState(false)
  const [inviteMsg, setInviteMsg]           = useState<string | null>(null)

  // Reference import state
  const [uploadedFiles, setUploadedFiles]   = useState<File[]>([])
  const [extracting, setExtracting]         = useState(false)
  const [extractedData, setExtractedData]   = useState<Record<string, any> | null>(null)
  const [mergeSelections, setMergeSelections] = useState<Record<string, boolean>>({})
  const [applying, setApplying]             = useState(false)
  const [importSuccess, setImportSuccess]   = useState(false)
  const [importError, setImportError]       = useState<string | null>(null)

  const supabase = createClient()

  useEffect(() => {
    async function init() {
      const user = await getCurrentUser()
      if (!user || (user.assignment?.role !== 'administrator' && user.assignment?.role !== 'admin')) {
        router.push('/login')
        return
      }

      const { data: tenantData } = await supabase.from('people').select('*').eq('id', personId).single()
      setTenant(tenantData)

      const { data: tenanciesData } = await supabase
        .from('tenancies')
        .select('*, room:rooms(name), property:properties(address)')
        .eq('person_id', personId)
        .order('start_date', { ascending: false })
      setTenancies(tenanciesData || [])

      const { data: commsData } = await supabase
        .from('notifications').select('*').eq('user_id', personId)
        .order('created_at', { ascending: false }).limit(50)
      setCommunications(commsData || [])

      const { data: checksData } = await supabase
        .from('tenant_self_checks').select('*')
        .eq('tenancy_id', tenanciesData?.[0]?.id || '')
        .order('created_at', { ascending: false })
      setSafetyChecks(checksData || [])

      const { data: refData } = await supabase
        .from('tenant_references').select('*').eq('person_id', personId)
        .order('imported_at', { ascending: false })
      setReferenceHistory(refData || [])

      setLoading(false)
    }
    init()
  }, [personId, router])

  const fmt = (d: string) => new Date(d).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })

  // ── Reference import ──────────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    setUploadedFiles(prev => [...prev, ...files])
    setExtractedData(null)
    setImportError(null)
  }

  function removeFile(idx: number) {
    setUploadedFiles(prev => prev.filter((_, i) => i !== idx))
    setExtractedData(null)
  }

  async function handleExtract() {
    if (!uploadedFiles.length) return
    setExtracting(true)
    setImportError(null)

    const formData = new FormData()
    uploadedFiles.forEach(f => formData.append('files', f))

    const res = await fetch('/api/reference-import/extract', { method: 'POST', body: formData })
    const json = await res.json()
    setExtracting(false)

    if (!res.ok) {
      setImportError(json.error ?? 'Extraction failed')
      return
    }

    const data = json.extracted as Record<string, any>
    setExtractedData(data)

    // Default selections: tick if the field has a value AND the current people field is empty
    const defaults: Record<string, boolean> = {}
    for (const mf of MERGE_FIELDS) {
      const extracted = data[mf.key]
      const current   = tenant?.[PEOPLE_FIELD_MAP[mf.key] as keyof TenantProfile]
      // Auto-select if extracted has value and profile is empty
      defaults[mf.key] = extracted != null && (current == null || current === '')
    }
    setMergeSelections(defaults)
  }

  async function handleApply() {
    if (!extractedData) return
    setApplying(true)
    setImportError(null)

    const currentTenancy = tenancies.find(t => !t.end_date)
    const appliedFields = Object.entries(mergeSelections).filter(([, v]) => v).map(([k]) => k)

    const res = await fetch('/api/reference-import/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personId,
        tenancyId: currentTenancy?.id ?? null,
        referenceData: extractedData,
        appliedFields,
      }),
    })

    const json = await res.json()
    setApplying(false)

    if (!res.ok) {
      setImportError(json.error ?? 'Apply failed')
      return
    }

    // Refresh data
    const { data: freshTenant } = await supabase.from('people').select('*').eq('id', personId).single()
    setTenant(freshTenant)

    const { data: refData } = await supabase
      .from('tenant_references').select('*').eq('person_id', personId)
      .order('imported_at', { ascending: false })
    setReferenceHistory(refData || [])

    setExtractedData(null)
    setUploadedFiles([])
    setImportSuccess(true)
    setTimeout(() => setImportSuccess(false), 5000)
  }

  // ── UI helpers ─────────────────────────────────────────────────────────────

  function decisionBadge(d: string | null | undefined) {
    if (!d) return null
    const c = d === 'Approved' ? 'bg-green-900 text-green-300 border-green-700'
            : d === 'Declined' ? 'bg-red-900 text-red-300 border-red-700'
            : 'bg-amber-900 text-amber-300 border-amber-700'
    return <span className={`text-xs font-bold px-sm py-xs rounded-full border ${c}`}>{d}</span>
  }

  function rtrBadge(d: string | null | undefined) {
    if (!d) return null
    const isClear = d.toLowerCase().includes('yes')
    return (
      <span className={`text-xs font-bold px-sm py-xs rounded-full border ${isClear ? 'bg-green-900 text-green-300 border-green-700' : 'bg-red-900 text-red-300 border-red-700'}`}>
        {d}
      </span>
    )
  }

  const currentTenancy    = tenancies.find(t => !t.end_date)
  const previousTenancies = tenancies.filter(t => t.end_date)

  if (loading) {
    return (
      <div className="min-h-screen bg-black">
        <AppBar left={<BackButton href="/admin" />} />
        <div className="p-xl text-neutral-400">Loading…</div>
      </div>
    )
  }

  if (!tenant) {
    return (
      <div className="min-h-screen bg-black">
        <AppBar left={<BackButton href="/admin" />} />
        <div className="p-xl text-neutral-400">Tenant not found</div>
      </div>
    )
  }

  async function handleInvite() {
    setInviting(true)
    setInviteMsg(null)
    const res  = await fetch('/api/invite-tenant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personId }),
    })
    const json = await res.json()
    setInviting(false)
    setInviteMsg(res.ok ? `✓ Invite sent to ${json.sentTo}` : `⚠ ${json.error}`)
    setTimeout(() => setInviteMsg(null), 6000)
  }

  const latestRef = referenceHistory[0]

  return (
    <div className="min-h-screen bg-black">
      <AppBar left={<BackButton href="/admin" />} />

      <main className="mx-auto max-w-6xl px-lg py-2xl">

        {/* ── Profile Header ──────────────────────────────────────────────── */}
        <div className="mb-3xl">
          {inviteMsg && (
            <div className={`mb-md rounded-xl px-md py-sm text-sm font-semibold ${inviteMsg.startsWith('✓') ? 'bg-green-900 text-green-200 border border-green-700' : 'bg-red-900 text-red-200 border border-red-700'}`}>
              {inviteMsg}
            </div>
          )}

          <div className="flex items-start justify-between mb-md">
            <h1 className="text-3xl font-bold text-white">👤 {tenant.name}</h1>
            <div className="flex items-center gap-sm flex-wrap justify-end">
              <button
                onClick={handleInvite}
                disabled={inviting}
                className="rounded-xl border border-neutral-600 px-md py-xs text-xs font-semibold text-neutral-300 hover:bg-neutral-800 disabled:opacity-40 transition"
              >
                {inviting ? 'Sending…' : '✉ Send invite'}
              </button>
              {decisionBadge(tenant.reference_status)}
              {tenant.right_to_rent_until && (
                <span className={`text-xs font-bold px-sm py-xs rounded-full border ${new Date(tenant.right_to_rent_until) > new Date() ? 'bg-green-900 text-green-300 border-green-700' : 'bg-red-900 text-red-300 border-red-700'}`}>
                  RTR {new Date(tenant.right_to_rent_until) > new Date() ? '✓' : 'EXPIRED'} {new Date(tenant.right_to_rent_until).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                </span>
              )}
            </div>  {/* end badges */}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-lg">
            <div className="rounded-lg bg-neutral-900 border border-neutral-700 p-lg">
              <p className="text-xs text-neutral-400 mb-sm uppercase">Email</p>
              <p className="text-sm font-semibold text-white break-all">{tenant.email}</p>
            </div>
            <div className="rounded-lg bg-neutral-900 border border-neutral-700 p-lg">
              <p className="text-xs text-neutral-400 mb-sm uppercase">Phone</p>
              <p className="text-sm font-semibold text-white">{tenant.phone || '—'}</p>
            </div>
            {tenant.date_of_birth && (
              <div className="rounded-lg bg-neutral-900 border border-neutral-700 p-lg">
                <p className="text-xs text-neutral-400 mb-sm uppercase">Date of Birth</p>
                <p className="text-sm font-semibold text-white">{fmt(tenant.date_of_birth)}</p>
              </div>
            )}
            {tenant.nationality && (
              <div className="rounded-lg bg-neutral-900 border border-neutral-700 p-lg">
                <p className="text-xs text-neutral-400 mb-sm uppercase">Nationality</p>
                <p className="text-sm font-semibold text-white">{tenant.nationality}</p>
              </div>
            )}
            {tenant.verified_income_annual && (
              <div className="rounded-lg bg-neutral-900 border border-neutral-700 p-lg">
                <p className="text-xs text-neutral-400 mb-sm uppercase">Verified Income</p>
                <p className="text-sm font-semibold text-white">£{Number(tenant.verified_income_annual).toLocaleString()}/yr</p>
              </div>
            )}
            <div className="rounded-lg bg-neutral-900 border border-neutral-700 p-lg">
              <p className="text-xs text-neutral-400 mb-sm uppercase">Member Since</p>
              <p className="text-sm font-semibold text-white">{fmt(tenant.created_at)}</p>
            </div>
          </div>
        </div>

        {/* ── Current Tenancy ─────────────────────────────────────────────── */}
        {currentTenancy && (
          <div className="mb-3xl rounded-lg border border-neutral-700 bg-neutral-900 overflow-hidden">
            <div className="bg-green-950 border-b border-neutral-700 p-lg">
              <h2 className="text-lg font-semibold text-white">🏠 Current Tenancy</h2>
            </div>
            <div className="p-lg">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-lg">
                <div>
                  <p className="text-xs text-neutral-400 mb-sm">Property</p>
                  <p className="text-sm font-semibold text-white">{currentTenancy.property?.address}</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-400 mb-sm">Room</p>
                  <p className="text-sm font-semibold text-white">{currentTenancy.room?.name}</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-400 mb-sm">Monthly Rent</p>
                  <p className="text-sm font-semibold text-white">£{currentTenancy.rent_monthly}</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-400 mb-sm">Since</p>
                  <p className="text-sm font-semibold text-white">{fmt(currentTenancy.start_date)}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Previous Tenancies ──────────────────────────────────────────── */}
        {previousTenancies.length > 0 && (
          <div className="mb-3xl rounded-lg border border-neutral-700 bg-neutral-900 overflow-hidden">
            <div className="bg-neutral-800 border-b border-neutral-700 p-lg">
              <h2 className="text-lg font-semibold text-white">📋 Previous Tenancies ({previousTenancies.length})</h2>
            </div>
            <div className="divide-y divide-neutral-800">
              {previousTenancies.map(t => (
                <div key={t.id} className="p-lg grid grid-cols-2 md:grid-cols-4 gap-lg text-sm">
                  <div><p className="text-xs text-neutral-400 mb-xs">Property</p><p className="font-semibold text-white">{t.property?.address}</p></div>
                  <div><p className="text-xs text-neutral-400 mb-xs">Room</p><p className="font-semibold text-white">{t.room?.name}</p></div>
                  <div><p className="text-xs text-neutral-400 mb-xs">Period</p><p className="font-semibold text-white">{fmt(t.start_date)} – {fmt(t.end_date!)}</p></div>
                  <div><p className="text-xs text-neutral-400 mb-xs">Rent</p><p className="font-semibold text-white">£{t.rent_monthly}</p></div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Tabs ────────────────────────────────────────────────────────── */}
        <div className="flex gap-md mb-lg border-b border-neutral-700 overflow-x-auto">
          {[
            { id: 'overview'       as const, label: 'Overview' },
            { id: 'tenancy'        as const, label: 'Tenancy' },
            { id: 'reference'      as const, label: `Reference${referenceHistory.length ? ` (${referenceHistory.length})` : ''}` },
            { id: 'communications' as const, label: `Communications (${communications.length})` },
            { id: 'safety'        as const, label: `Safety Checks (${safetyChecks.length})` },
            { id: 'history'       as const, label: 'Timeline' },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 px-lg py-md font-semibold text-sm transition ${activeTab === tab.id ? 'text-white border-b-2 border-blue-600' : 'text-neutral-400 hover:text-white'}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* OVERVIEW TAB                                                      */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
            <div className="rounded-lg border border-neutral-700 bg-neutral-900 p-lg">
              <h3 className="font-semibold text-white mb-md">Contact Info</h3>
              <div className="space-y-md text-sm">
                <div><p className="text-neutral-400">Email</p><p className="text-white font-semibold break-all">{tenant.email}</p></div>
                <div><p className="text-neutral-400">Phone</p><p className="text-white font-semibold">{tenant.phone || '—'}</p></div>
                {tenant.nationality && <div><p className="text-neutral-400">Nationality</p><p className="text-white font-semibold">{tenant.nationality}</p></div>}
                {tenant.date_of_birth && <div><p className="text-neutral-400">Date of Birth</p><p className="text-white font-semibold">{fmt(tenant.date_of_birth)}</p></div>}
              </div>
            </div>
            <div className="rounded-lg border border-neutral-700 bg-neutral-900 p-lg">
              <h3 className="font-semibold text-white mb-md">Reference Summary</h3>
              <div className="space-y-md text-sm">
                {latestRef ? (
                  <>
                    <div className="flex items-center justify-between"><p className="text-neutral-400">Decision</p>{decisionBadge(latestRef.overall_decision)}</div>
                    {latestRef.right_to_rent_status && <div className="flex items-center justify-between"><p className="text-neutral-400">Right to Rent</p>{rtrBadge(latestRef.right_to_rent_status)}</div>}
                    {latestRef.right_to_rent_until && <div><p className="text-neutral-400">RTR Expires</p><p className="text-white font-semibold">{fmt(latestRef.right_to_rent_until)}</p></div>}
                    {latestRef.verified_income_annual && <div><p className="text-neutral-400">Verified Income</p><p className="text-white font-semibold">£{Number(latestRef.verified_income_annual).toLocaleString()}/yr</p></div>}
                    {latestRef.max_affordable_rent_monthly && <div><p className="text-neutral-400">Max Affordable Rent</p><p className="text-white font-semibold">£{Number(latestRef.max_affordable_rent_monthly).toLocaleString()}/month</p></div>}
                    <div className="flex items-center justify-between">
                      <p className="text-neutral-400">Credit</p>
                      <span className={`text-xs font-bold px-sm py-xs rounded-full border ${latestRef.credit_result === 'Clean' ? 'bg-green-900 text-green-300 border-green-700' : 'bg-amber-900 text-amber-300 border-amber-700'}`}>{latestRef.credit_result ?? '—'}</span>
                    </div>
                    {latestRef.aml_result && <div className="flex items-center justify-between">
                      <p className="text-neutral-400">AML</p>
                      <span className={`text-xs font-bold px-sm py-xs rounded-full border ${latestRef.aml_result === 'Clear' ? 'bg-green-900 text-green-300 border-green-700' : 'bg-red-900 text-red-300 border-red-700'}`}>{latestRef.aml_result}</span>
                    </div>}
                    <p className="text-xs text-neutral-500 pt-sm border-t border-neutral-700">Source: {latestRef.reference_source ?? 'Unknown'} · {latestRef.report_date ? fmt(latestRef.report_date) : 'Date unknown'}</p>
                  </>
                ) : (
                  <div className="py-md">
                    <p className="text-neutral-500 text-sm">No reference imported yet.</p>
                    <button onClick={() => setActiveTab('reference')} className="mt-sm text-sm text-blue-400 hover:text-blue-300">
                      Import reference →
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* TENANCY TAB                                                       */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'tenancy' && (
          <div className="space-y-lg">
            {!currentTenancy ? (
              <div className="rounded-lg border border-neutral-700 bg-neutral-900 p-xl text-center">
                <p className="text-neutral-400 text-sm">No active tenancy.</p>
              </div>
            ) : (
              <>
                {/* Tenancy contract details */}
                <div className="rounded-lg border border-neutral-700 bg-neutral-900 overflow-hidden">
                  <div className="bg-green-950 border-b border-neutral-700 px-lg py-md flex items-center justify-between">
                    <h3 className="font-semibold text-white">Current Tenancy</h3>
                    <span className="text-xs font-bold text-green-400 bg-green-900 border border-green-700 px-sm py-xs rounded-full">Active</span>
                  </div>
                  <div className="p-lg grid grid-cols-2 md:grid-cols-3 gap-lg text-sm">
                    <div>
                      <p className="text-xs text-neutral-400 mb-xs uppercase tracking-wide">Property</p>
                      <p className="font-semibold text-white">{currentTenancy.property?.address || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-neutral-400 mb-xs uppercase tracking-wide">Room</p>
                      <p className="font-semibold text-white">{currentTenancy.room?.name || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-neutral-400 mb-xs uppercase tracking-wide">Start Date</p>
                      <p className="font-semibold text-white">{fmt(currentTenancy.start_date)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-neutral-400 mb-xs uppercase tracking-wide">End Date</p>
                      <p className="font-semibold text-white">{currentTenancy.end_date ? fmt(currentTenancy.end_date) : 'Rolling / Open-ended'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-neutral-400 mb-xs uppercase tracking-wide">Monthly Rent</p>
                      <p className="font-semibold text-white text-lg">£{Number(currentTenancy.rent_monthly || (currentTenancy as any).rent_amount || 0).toLocaleString()}</p>
                    </div>
                    {(currentTenancy as any).lease_reference && (
                      <div>
                        <p className="text-xs text-neutral-400 mb-xs uppercase tracking-wide">Lease Reference</p>
                        <p className="font-semibold text-white">{(currentTenancy as any).lease_reference}</p>
                      </div>
                    )}
                    {(currentTenancy as any).rent_due_day && (
                      <div>
                        <p className="text-xs text-neutral-400 mb-xs uppercase tracking-wide">Rent Due</p>
                        <p className="font-semibold text-white">Day {(currentTenancy as any).rent_due_day} of each month</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Deposit */}
                <div className="rounded-lg border border-neutral-700 bg-neutral-900 overflow-hidden">
                  <div className="border-b border-neutral-700 px-lg py-md">
                    <h3 className="font-semibold text-white">Deposit</h3>
                  </div>
                  <div className="p-lg grid grid-cols-2 md:grid-cols-3 gap-lg text-sm">
                    <div>
                      <p className="text-xs text-neutral-400 mb-xs uppercase tracking-wide">Amount</p>
                      <p className="font-semibold text-white text-lg">
                        {(currentTenancy as any).deposit_amount
                          ? `£${Number((currentTenancy as any).deposit_amount).toLocaleString()}`
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-neutral-400 mb-xs uppercase tracking-wide">Held By</p>
                      <p className="font-semibold text-white">{(currentTenancy as any).deposit_held_by || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-neutral-400 mb-xs uppercase tracking-wide">Scheme Reference</p>
                      <p className="font-semibold text-white">{(currentTenancy as any).deposit_scheme_ref || '—'}</p>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-md flex-wrap">
                  <button
                    onClick={async () => {
                      const confirmed = window.confirm(`Mark ${tenant.name} as on notice? This will set their tenancy end date.`)
                      if (!confirmed) return
                      const endDate = window.prompt('Enter notice end date (YYYY-MM-DD):', new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
                      if (!endDate) return
                      const supabase = createClient()
                      await supabase.from('tenancies').update({ status: 'on_notice', end_date: endDate }).eq('id', currentTenancy.id)
                      window.location.reload()
                    }}
                    className="px-lg py-sm rounded-lg border border-amber-600 text-amber-300 text-sm font-semibold hover:bg-amber-950 transition"
                  >
                    ⚠ Mark on Notice
                  </button>
                  <a
                    href={`/admin/properties/${currentTenancy.property_id}`}
                    className="px-lg py-sm rounded-lg border border-neutral-600 text-neutral-300 text-sm font-semibold hover:bg-neutral-800 transition"
                  >
                    View Property →
                  </a>
                </div>
              </>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* REFERENCE TAB                                                     */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'reference' && (
          <div className="space-y-xl">

            {importSuccess && (
              <div className="rounded-xl bg-green-900 border border-green-700 p-md text-sm font-semibold text-green-200">
                ✓ Reference imported and profile updated.
              </div>
            )}
            {importError && (
              <div className="rounded-xl bg-red-900 border border-red-700 p-md text-sm font-semibold text-red-200">
                ⚠ {importError}
              </div>
            )}

            {/* ── Upload panel ── */}
            {!extractedData && (
              <div className="rounded-xl border border-neutral-700 bg-neutral-900 p-lg">
                <h3 className="text-lg font-bold text-white mb-xs">Import Reference Bundle</h3>
                <p className="text-sm text-neutral-400 mb-lg">
                  Upload any combination of documents — reference report, credit report, right to rent certificate,
                  passport, driving licence, tenancy agreement. AI will extract all available fields.
                </p>

                <label className="block w-full rounded-xl border-2 border-dashed border-neutral-600 hover:border-neutral-400 transition cursor-pointer p-xl text-center mb-md">
                  <input type="file" multiple accept=".pdf,image/*" className="hidden" onChange={handleFileChange} />
                  <p className="text-2xl mb-sm">📄</p>
                  <p className="text-sm font-semibold text-neutral-300">Click to select files</p>
                  <p className="text-xs text-neutral-500 mt-xs">PDF, JPG, PNG — multiple files accepted</p>
                </label>

                {uploadedFiles.length > 0 && (
                  <div className="space-y-sm mb-lg">
                    {uploadedFiles.map((f, i) => (
                      <div key={i} className="flex items-center justify-between rounded-lg border border-neutral-700 bg-neutral-800 px-md py-sm">
                        <div className="flex items-center gap-sm">
                          <span className="text-lg">{f.type === 'application/pdf' ? '📄' : '🖼'}</span>
                          <div>
                            <p className="text-sm font-semibold text-white">{f.name}</p>
                            <p className="text-xs text-neutral-400">{(f.size / 1024).toFixed(0)} KB</p>
                          </div>
                        </div>
                        <button onClick={() => removeFile(i)} className="text-neutral-500 hover:text-red-400 text-lg">×</button>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={handleExtract}
                  disabled={!uploadedFiles.length || extracting}
                  className="rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 px-lg py-md text-sm font-bold text-white transition w-full"
                >
                  {extracting ? '⏳ Extracting data…' : `🔍 Extract from ${uploadedFiles.length} file${uploadedFiles.length !== 1 ? 's' : ''}`}
                </button>
              </div>
            )}

            {/* ── Merge UI ── */}
            {extractedData && (
              <div className="rounded-xl border border-blue-700 bg-neutral-900 overflow-hidden">
                <div className="bg-blue-950 border-b border-blue-800 p-lg flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-white">Extracted Data — Review & Import</h3>
                    <p className="text-sm text-blue-300 mt-xs">
                      ✓ = auto-selected (profile field was empty) · uncheck to skip a field · untick doesn't delete from the reference record
                    </p>
                  </div>
                  <button onClick={() => { setExtractedData(null); setUploadedFiles([]) }}
                    className="text-neutral-400 hover:text-white text-sm">← Back</button>
                </div>

                {/* Overall decision summary */}
                {extractedData.overall_decision && (
                  <div className="px-lg py-md border-b border-neutral-700 flex items-center gap-md">
                    <span className="text-sm text-neutral-400">Overall decision:</span>
                    {decisionBadge(extractedData.overall_decision)}
                    {extractedData.reference_source && <span className="text-xs text-neutral-500">Source: {extractedData.reference_source}</span>}
                  </div>
                )}

                {/* Field-by-field merge */}
                <div className="p-lg">
                  <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-md">
                    Fields to sync to profile
                  </p>
                  <div className="space-y-sm mb-xl">
                    {MERGE_FIELDS.map(mf => {
                      const extracted = extractedData[mf.key]
                      if (extracted == null) return null
                      const currentKey = PEOPLE_FIELD_MAP[mf.key]
                      const current    = tenant?.[currentKey] as any
                      const formatted  = mf.format ? mf.format(extracted) : String(extracted)
                      const currentFmt = current && mf.format ? mf.format(current) : current ? String(current) : null
                      const hasConflict = currentFmt && currentFmt !== formatted

                      return (
                        <label key={mf.key} className={`flex items-start gap-md rounded-xl border px-md py-sm cursor-pointer transition ${mergeSelections[mf.key] ? 'border-blue-700 bg-blue-950/40' : 'border-neutral-700 bg-neutral-800'}`}>
                          <input
                            type="checkbox"
                            checked={!!mergeSelections[mf.key]}
                            onChange={e => setMergeSelections(prev => ({ ...prev, [mf.key]: e.target.checked }))}
                            className="mt-xs w-4 h-4 accent-blue-500 shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wide">{mf.label}</p>
                            <p className="text-sm font-semibold text-white mt-xs truncate">{formatted}</p>
                            {currentFmt && (
                              <p className={`text-xs mt-xs ${hasConflict ? 'text-amber-400' : 'text-neutral-500'}`}>
                                {hasConflict ? '⚠ Replaces: ' : '✓ Matches: '}
                                {currentFmt}
                              </p>
                            )}
                            {!currentFmt && <p className="text-xs text-green-400 mt-xs">→ Will fill empty field</p>}
                          </div>
                        </label>
                      )
                    })}
                  </div>

                  {/* Non-merge fields — info only, always saved to tenant_references */}
                  <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-md">
                    Additional data — stored in reference record
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-sm mb-xl text-sm">
                    {[
                      { label: 'Right to rent status',    val: extractedData.right_to_rent_status },
                      { label: 'RTR until',               val: extractedData.right_to_rent_until },
                      { label: 'RTR check date',          val: extractedData.right_to_rent_check_date },
                      { label: 'RTR reference',           val: extractedData.right_to_rent_ref },
                      { label: 'Max affordable rent',     val: extractedData.max_affordable_rent_monthly ? `£${Number(extractedData.max_affordable_rent_monthly).toLocaleString()}/mo` : null },
                      { label: 'Affordability ratio',     val: extractedData.affordability_ratio ? `${extractedData.affordability_ratio}%` : null },
                      { label: 'Credit result',           val: extractedData.credit_result },
                      { label: 'Judgments (active)',      val: extractedData.active_judgments != null ? String(extractedData.active_judgments) : null },
                      { label: 'Landlord reference',      val: extractedData.prev_landlord_ref_result },
                      { label: 'Landlord ref name',       val: extractedData.prev_landlord_ref_name },
                      { label: 'AML result',              val: extractedData.aml_result },
                      { label: 'Identity doc 1',          val: extractedData.id_type_1 ? `${extractedData.id_type_1}${extractedData.id_verified_1 ? ' ✓' : ''}` : null },
                      { label: 'Identity doc 2',          val: extractedData.id_type_2 ? `${extractedData.id_type_2}${extractedData.id_verified_2 ? ' ✓' : ''}` : null },
                      { label: 'Driving licence',         val: extractedData.driving_licence_number },
                    ].filter(r => r.val != null).map(r => (
                      <div key={r.label} className="rounded-lg border border-neutral-700 bg-neutral-800 px-md py-sm">
                        <p className="text-xs text-neutral-500">{r.label}</p>
                        <p className="font-semibold text-white">{r.val}</p>
                      </div>
                    ))}
                  </div>

                  {/* Previous addresses */}
                  {Array.isArray(extractedData.previous_addresses) && extractedData.previous_addresses.length > 0 && (
                    <div className="mb-xl">
                      <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-md">Address history</p>
                      <div className="space-y-sm">
                        {extractedData.previous_addresses.map((a: any, i: number) => (
                          <div key={i} className="rounded-lg border border-neutral-700 bg-neutral-800 px-md py-sm text-sm">
                            <p className="font-semibold text-white">{a.address}</p>
                            <p className="text-xs text-neutral-400">{a.from ?? '?'} – {a.to ?? 'present'}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-md">
                    <button onClick={() => { setExtractedData(null); setUploadedFiles([]) }}
                      className="rounded-xl border border-neutral-600 px-lg py-md text-sm font-semibold text-neutral-300 hover:bg-neutral-800">
                      Cancel
                    </button>
                    <button onClick={handleApply} disabled={applying}
                      className="flex-1 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 px-lg py-md text-sm font-bold text-white transition">
                      {applying ? 'Saving…' : `Save reference${Object.values(mergeSelections).some(Boolean) ? ' & update profile' : ''}`}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Reference history ── */}
            {referenceHistory.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wide mb-md">Reference History</h3>
                <div className="space-y-md">
                  {referenceHistory.map((ref, idx) => (
                    <details key={ref.id} className="rounded-xl border border-neutral-700 bg-neutral-900 overflow-hidden">
                      <summary className="p-lg cursor-pointer flex items-center justify-between">
                        <div className="flex items-center gap-md">
                          {idx === 0 && <span className="text-xs font-bold text-blue-400 bg-blue-950 px-sm py-xs rounded-full border border-blue-800">Latest</span>}
                          {decisionBadge(ref.overall_decision)}
                          <span className="text-sm font-semibold text-white">{ref.reference_source ?? 'Reference'}</span>
                          <span className="text-xs text-neutral-500">{ref.report_date ? fmt(ref.report_date) : fmt(ref.imported_at)}</span>
                        </div>
                        <span className="text-neutral-500 text-xs">▼</span>
                      </summary>
                      <div className="border-t border-neutral-700 p-lg grid grid-cols-2 sm:grid-cols-3 gap-md text-sm">
                        {ref.legal_name && <div><p className="text-xs text-neutral-500">Legal name</p><p className="font-semibold text-white">{ref.legal_name}</p></div>}
                        {ref.nationality && <div><p className="text-xs text-neutral-500">Nationality</p><p className="font-semibold text-white">{ref.nationality}</p></div>}
                        {ref.date_of_birth && <div><p className="text-xs text-neutral-500">DOB</p><p className="font-semibold text-white">{fmt(ref.date_of_birth)}</p></div>}
                        {ref.right_to_rent_status && <div><p className="text-xs text-neutral-500">Right to rent</p><p className="font-semibold text-white">{ref.right_to_rent_status}</p></div>}
                        {ref.right_to_rent_until && <div><p className="text-xs text-neutral-500">RTR until</p><p className="font-semibold text-white">{fmt(ref.right_to_rent_until)}</p></div>}
                        {ref.right_to_rent_ref && <div><p className="text-xs text-neutral-500">RTR ref</p><p className="font-semibold text-white">{ref.right_to_rent_ref}</p></div>}
                        {ref.verified_income_annual && <div><p className="text-xs text-neutral-500">Verified income</p><p className="font-semibold text-white">£{Number(ref.verified_income_annual).toLocaleString()}/yr</p></div>}
                        {ref.max_affordable_rent_monthly && <div><p className="text-xs text-neutral-500">Max rent</p><p className="font-semibold text-white">£{Number(ref.max_affordable_rent_monthly).toLocaleString()}/mo</p></div>}
                        {ref.credit_result && <div><p className="text-xs text-neutral-500">Credit</p><p className="font-semibold text-white">{ref.credit_result}</p></div>}
                        {ref.aml_result && <div><p className="text-xs text-neutral-500">AML</p><p className="font-semibold text-white">{ref.aml_result}</p></div>}
                        {ref.id_type_1 && <div><p className="text-xs text-neutral-500">ID doc 1</p><p className="font-semibold text-white">{ref.id_type_1} {ref.id_verified_1 ? '✓' : ''}</p></div>}
                        {ref.id_type_2 && <div><p className="text-xs text-neutral-500">ID doc 2</p><p className="font-semibold text-white">{ref.id_type_2} {ref.id_verified_2 ? '✓' : ''}</p></div>}
                        {ref.prev_landlord_ref_result && <div><p className="text-xs text-neutral-500">Landlord ref</p><p className="font-semibold text-white">{ref.prev_landlord_ref_result} · {ref.prev_landlord_ref_name}</p></div>}
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* COMMUNICATIONS TAB                                                */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'communications' && (
          <div className="rounded-lg border border-neutral-700 bg-neutral-900 overflow-hidden">
            {communications.length === 0 ? (
              <div className="p-lg text-center text-neutral-400">No communications yet</div>
            ) : (
              <div className="divide-y divide-neutral-800 max-h-[600px] overflow-y-auto">
                {communications.map(c => (
                  <div key={c.id} className="p-lg">
                    <p className="font-semibold text-white text-sm">{c.title}</p>
                    <p className="text-xs text-neutral-400 mt-xs line-clamp-2">{c.message}</p>
                    <div className="flex items-center justify-between mt-md text-xs text-neutral-500">
                      <span>{c.notification_type}</span>
                      <span>{fmt(c.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* SAFETY TAB                                                        */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'safety' && (
          <div className="rounded-lg border border-neutral-700 bg-neutral-900 overflow-hidden">
            {safetyChecks.length === 0 ? (
              <div className="p-lg text-center text-neutral-400">No safety checks yet</div>
            ) : (
              <div className="divide-y divide-neutral-800">
                {safetyChecks.map(c => (
                  <div key={c.id} className="p-lg">
                    <p className="font-semibold text-white text-sm capitalize">{c.check_type}</p>
                    <p className="text-xs text-neutral-400 mt-xs">{c.response}</p>
                    <p className="text-xs text-neutral-500 mt-md">{fmt(c.created_at)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* HISTORY TAB                                                       */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'history' && (
          <div className="rounded-lg border border-neutral-700 bg-neutral-900 p-lg">
            <h3 className="font-semibold text-white mb-lg">Complete Timeline</h3>
            <div className="space-y-lg">
              {currentTenancy && (
                <div className="flex gap-lg">
                  <div className="flex flex-col items-center">
                    <div className="w-4 h-4 rounded-full bg-green-500"></div>
                    <div className="w-0.5 h-12 bg-neutral-700 mt-2"></div>
                  </div>
                  <div>
                    <p className="font-semibold text-white">[CURRENT] {currentTenancy.property?.address} — {currentTenancy.room?.name}</p>
                    <p className="text-sm text-neutral-400">Since {fmt(currentTenancy.start_date)}</p>
                  </div>
                </div>
              )}
              {previousTenancies.map((t, i) => (
                <div key={t.id} className="flex gap-lg">
                  <div className="flex flex-col items-center">
                    <div className="w-4 h-4 rounded-full bg-neutral-600"></div>
                    {i < previousTenancies.length - 1 && <div className="w-0.5 h-12 bg-neutral-700 mt-2"></div>}
                  </div>
                  <div>
                    <p className="font-semibold text-white">{t.property?.address} — {t.room?.name}</p>
                    <p className="text-sm text-neutral-400">{fmt(t.start_date)} to {fmt(t.end_date!)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </main>
    </div>
  )
}
