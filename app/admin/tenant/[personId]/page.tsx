'use client'

import { useState, useEffect, use, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import TenantCard, { TenantCardTenant, TenantCardTenancy, tenantDisplayName } from '@/app/components/TenantCard'

/* ── Types ── */

interface TenancyRow extends TenantCardTenancy {
  id: string
  room_id: string
  property_id: string
  start_date: string
  end_date: string | null
  deposit_amount?: number | null
  deposit_held_by?: string | null
  deposit_scheme_ref?: string | null
  lease_reference?: string | null
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

const MERGE_FIELDS: { key: string; label: string; format?: (v: any) => string }[] = [
  { key: 'legal_name',             label: 'Legal name' },
  { key: 'date_of_birth',          label: 'Date of birth' },
  { key: 'nationality',            label: 'Nationality' },
  { key: 'right_to_rent_until',    label: 'Right to rent until' },
  { key: 'right_to_rent_ref',      label: 'Right to rent ref' },
  { key: 'verified_income_annual', label: 'Verified annual income', format: (v) => `£${Number(v).toLocaleString()}` },
  { key: 'credit_result',          label: 'Credit check result' },
  { key: 'overall_decision',       label: 'Reference status' },
]

const PEOPLE_FIELD_MAP: Record<string, keyof TenantCardTenant> = {
  legal_name:             'name',
  date_of_birth:          'date_of_birth' as any,
  nationality:            'nationality' as any,
  right_to_rent_until:    'right_to_rent_until',
  right_to_rent_ref:      'right_to_rent_ref' as any,
  verified_income_annual: 'verified_income_annual' as any,
  credit_result:          'credit_check_result' as any,
  overall_decision:       'reference_status',
}

/* ── Badge helpers ── */

function decisionBadge(d: string | null | undefined) {
  if (!d) return null
  const c = d === 'Approved' ? 'bg-green-100 text-green-800 border-green-200'
          : d === 'Declined' ? 'bg-red-100 text-red-800 border-red-200'
          : 'bg-amber-100 text-amber-800 border-amber-200'
  return <span className={`text-xs font-semibold px-sm py-xs rounded-full border ${c}`}>{d}</span>
}

function creditBadge(r: string | null | undefined) {
  if (!r) return <span className="text-sm text-neutral-400">—</span>
  const ok = r === 'Clean' || r === 'Pass'
  return <span className={`text-xs font-semibold px-sm py-xs rounded-full border ${ok ? 'bg-green-100 text-green-800 border-green-200' : 'bg-amber-100 text-amber-800 border-amber-200'}`}>{r}</span>
}

function amlBadge(r: string | null | undefined) {
  if (!r) return <span className="text-sm text-neutral-400">—</span>
  const ok = r === 'Clear' || r === 'Pass'
  return <span className={`text-xs font-semibold px-sm py-xs rounded-full border ${ok ? 'bg-green-100 text-green-800 border-green-200' : 'bg-red-100 text-red-800 border-red-200'}`}>{r}</span>
}

/* ── Helpers ── */

function fmt(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })
}

/** Returns an object URL for the first image file in the array, or null. */
function firstImageObjectUrl(files: File[]): string | null {
  const img = files.find(f => f.type.startsWith('image/'))
  return img ? URL.createObjectURL(img) : null
}

/** True if the id_type string looks like a passport or photo ID. */
function isPhotoId(t: string | null | undefined): boolean {
  if (!t) return false
  const lc = t.toLowerCase()
  return lc.includes('passport') || lc.includes('photo') || lc.includes('licence') || lc.includes('license')
}

/* ══════════════════════════════════════════════════════════════════════ */

export default function TenantProfilePage({ params }: { params: Promise<{ personId: string }> }) {
  const router    = useRouter()
  const { personId } = use(params)

  const [tenant, setTenant]                     = useState<TenantCardTenant | null>(null)
  const [tenancies, setTenancies]               = useState<TenancyRow[]>([])
  const [communications, setCommunications]     = useState<Communication[]>([])
  const [safetyChecks, setSafetyChecks]         = useState<SafetyCheck[]>([])
  const [referenceHistory, setReferenceHistory] = useState<TenantReference[]>([])
  const [loading, setLoading]                   = useState(true)

  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<'overview' | 'tenancy' | 'communications' | 'safety' | 'reference' | 'history'>(
    (searchParams.get('tab') as any) || 'overview'
  )

  const [inviting, setInviting]   = useState(false)
  const [inviteMsg, setInviteMsg] = useState<string | null>(null)

  /* Reference import */
  const [uploadedFiles, setUploadedFiles]     = useState<File[]>([])
  const [extracting, setExtracting]           = useState(false)
  const [extractedData, setExtractedData]     = useState<Record<string, any> | null>(null)
  const [mergeSelections, setMergeSelections] = useState<Record<string, boolean>>({})
  const [applying, setApplying]               = useState(false)
  const [importSuccess, setImportSuccess]     = useState(false)
  const [importError, setImportError]         = useState<string | null>(null)

  /* ID photo acceptance */
  const [acceptingPhoto, setAcceptingPhoto] = useState(false)

  const supabase = createClient()

  /* ── Candidate ID photo: first image file uploaded when a photo ID type detected ── */
  const candidateIdPhotoUrl = useMemo(() => {
    if (!extractedData) return null
    if (!isPhotoId(extractedData.id_type_1) && !isPhotoId(extractedData.id_type_2)) return null
    return firstImageObjectUrl(uploadedFiles)
  }, [extractedData, uploadedFiles])

  /* ── Data loading ── */
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
        .select('*, room:rooms(name), property:properties(address, name)')
        .eq('person_id', personId)
        .order('start_date', { ascending: false })
      setTenancies((tenanciesData || []) as TenancyRow[])

      const { data: commsData } = await supabase
        .from('notifications').select('*').eq('user_id', personId)
        .order('created_at', { ascending: false }).limit(50)
      setCommunications(commsData || [])

      const { data: checksData } = await supabase
        .from('tenant_self_checks').select('*')
        .eq('tenancy_id', (tenanciesData || [])[0]?.id || '')
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

  /* ── Invite ── */
  async function handleInvite() {
    setInviting(true); setInviteMsg(null)
    const res  = await fetch('/api/invite-tenant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ personId }) })
    const json = await res.json()
    setInviting(false)
    setInviteMsg(res.ok ? `✓ Invite sent to ${json.sentTo}` : `⚠ ${json.error}`)
    setTimeout(() => setInviteMsg(null), 6000)
  }

  /* ── ID photo acceptance ── */
  async function handleAcceptIdPhoto(candidateUrl: string) {
    if (!tenant) return
    setAcceptingPhoto(true)
    try {
      // Fetch the object URL back as a blob, upload to Supabase storage
      const blob     = await fetch(candidateUrl).then(r => r.blob())
      const ext      = blob.type.includes('png') ? 'png' : 'jpg'
      const path     = `id-photos/${personId}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('property-photos')
        .upload(path, blob, { upsert: true, contentType: blob.type })
      if (uploadErr) throw uploadErr

      const { data: { publicUrl } } = supabase.storage.from('property-photos').getPublicUrl(path)
      await supabase.from('people').update({ id_photo_url: publicUrl }).eq('id', personId)
      setTenant(prev => prev ? { ...prev, id_photo_url: publicUrl } : prev)
    } catch (e) {
      console.error('Failed to accept ID photo', e)
    } finally {
      setAcceptingPhoto(false)
    }
  }

  /* ── Reference import ── */
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setUploadedFiles(prev => [...prev, ...Array.from(e.target.files ?? [])])
    setExtractedData(null); setImportError(null)
  }
  function removeFile(idx: number) {
    setUploadedFiles(prev => prev.filter((_, i) => i !== idx))
    setExtractedData(null)
  }
  async function handleExtract() {
    if (!uploadedFiles.length) return
    setExtracting(true); setImportError(null)
    const formData = new FormData()
    uploadedFiles.forEach(f => formData.append('files', f))
    const res  = await fetch('/api/reference-import/extract', { method: 'POST', body: formData })
    const json = await res.json()
    setExtracting(false)
    if (!res.ok) { setImportError(json.error ?? 'Extraction failed'); return }
    const data = json.extracted as Record<string, any>
    setExtractedData(data)
    const defaults: Record<string, boolean> = {}
    for (const mf of MERGE_FIELDS) {
      const extracted = data[mf.key]
      const current   = (tenant as any)?.[PEOPLE_FIELD_MAP[mf.key]]
      defaults[mf.key] = extracted != null && (current == null || current === '')
    }
    setMergeSelections(defaults)
  }
  async function handleApply() {
    if (!extractedData) return
    setApplying(true); setImportError(null)
    const currentTenancy = tenancies.find(t => !t.end_date)
    const appliedFields  = Object.entries(mergeSelections).filter(([, v]) => v).map(([k]) => k)
    const res  = await fetch('/api/reference-import/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personId, tenancyId: currentTenancy?.id ?? null, referenceData: extractedData, appliedFields }),
    })
    const json = await res.json()
    setApplying(false)
    if (!res.ok) { setImportError(json.error ?? 'Apply failed'); return }
    const { data: freshTenant } = await supabase.from('people').select('*').eq('id', personId).single()
    setTenant(freshTenant)
    const { data: refData } = await supabase.from('tenant_references').select('*').eq('person_id', personId).order('imported_at', { ascending: false })
    setReferenceHistory(refData || [])
    setExtractedData(null); setUploadedFiles([])
    setImportSuccess(true)
    setTimeout(() => setImportSuccess(false), 5000)
  }

  /* ── Derived ── */
  const currentTenancy    = tenancies.find(t => !t.end_date) ?? null
  const previousTenancies = tenancies.filter(t => t.end_date)
  const latestRef         = referenceHistory[0]

  /* ── Loading / not found ── */
  if (loading) return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton />} />
      <div className="flex items-center justify-center py-3xl"><p className="text-sm text-neutral-400">Loading…</p></div>
    </div>
  )
  if (!tenant) return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton />} />
      <div className="flex items-center justify-center py-3xl"><p className="text-sm text-neutral-500">Tenant not found</p></div>
    </div>
  )

  /* ══════════════════════════════════════════════════════════════════════ */

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton />} />

      <main className="mx-auto max-w-5xl px-lg py-2xl">

        {/* ── Canonical tenant card ──────────────────────────────────── */}
        <div className="mb-xl">
          <TenantCard
            tenant={tenant}
            currentTenancy={currentTenancy}
            onInvite={handleInvite}
            inviting={inviting}
            inviteMsg={inviteMsg}
            candidateIdPhotoUrl={candidateIdPhotoUrl}
            onAcceptIdPhoto={handleAcceptIdPhoto}
            acceptingPhoto={acceptingPhoto}
          />
        </div>

        {/* ── Previous tenancies ─────────────────────────────────────── */}
        {previousTenancies.length > 0 && (
          <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden mb-xl">
            <div className="px-xl py-lg border-b border-neutral-100">
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Previous tenancies ({previousTenancies.length})</p>
            </div>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wider text-neutral-400 border-b border-neutral-100">
                  <th className="px-xl py-sm">Property</th>
                  <th className="px-xl py-sm hidden sm:table-cell">Room</th>
                  <th className="px-xl py-sm hidden md:table-cell">Period</th>
                  <th className="px-xl py-sm text-right">Rent</th>
                </tr>
              </thead>
              <tbody>
                {previousTenancies.map(t => (
                  <tr key={t.id} className="border-t border-neutral-100">
                    <td className="px-xl py-md text-neutral-700">{t.property?.address || '—'}</td>
                    <td className="px-xl py-md hidden sm:table-cell text-neutral-500">{t.room?.name || '—'}</td>
                    <td className="px-xl py-md hidden md:table-cell text-neutral-500 text-xs">{fmt(t.start_date)} – {fmt(t.end_date)}</td>
                    <td className="px-xl py-md text-right text-neutral-600 font-medium">
                      {Number((t as any).rent_amount || t.rent_monthly || 0) ? `£${Number((t as any).rent_amount || t.rent_monthly).toLocaleString()}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Tabs ──────────────────────────────────────────────────── */}
        <div className="flex gap-xs mb-xl border-b border-neutral-200 overflow-x-auto">
          {[
            { id: 'overview'        as const, label: 'Overview' },
            { id: 'tenancy'         as const, label: 'Tenancy' },
            { id: 'reference'       as const, label: `Reference${referenceHistory.length ? ` (${referenceHistory.length})` : ''}` },
            { id: 'communications'  as const, label: `Communications (${communications.length})` },
            { id: 'safety'          as const, label: `Safety Checks (${safetyChecks.length})` },
            { id: 'history'         as const, label: 'Timeline' },
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
            <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
              <div className="px-xl py-lg border-b border-neutral-100">
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Contact info</p>
              </div>
              <div className="px-xl py-lg space-y-md text-sm">
                <div><p className="text-xs text-neutral-400 mb-xs">Email</p><p className="font-semibold text-neutral-900 break-all">{tenant.email}</p></div>
                <div><p className="text-xs text-neutral-400 mb-xs">Phone</p><p className="font-semibold text-neutral-900">{tenant.phone || '—'}</p></div>
                {(tenant as any).nationality    && <div><p className="text-xs text-neutral-400 mb-xs">Nationality</p><p className="font-semibold text-neutral-900">{(tenant as any).nationality}</p></div>}
                {(tenant as any).date_of_birth  && <div><p className="text-xs text-neutral-400 mb-xs">Date of birth</p><p className="font-semibold text-neutral-900">{fmt((tenant as any).date_of_birth)}</p></div>}
                {(tenant as any).verified_income_annual && <div><p className="text-xs text-neutral-400 mb-xs">Verified income</p><p className="font-semibold text-neutral-900">£{Number((tenant as any).verified_income_annual).toLocaleString()}/yr</p></div>}
              </div>
            </div>

            <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
              <div className="px-xl py-lg border-b border-neutral-100">
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Reference summary</p>
              </div>
              <div className="px-xl py-lg space-y-md text-sm">
                {latestRef ? (
                  <>
                    <div className="flex items-center justify-between"><p className="text-xs text-neutral-400">Decision</p>{decisionBadge(latestRef.overall_decision)}</div>
                    {latestRef.right_to_rent_status && <div className="flex items-center justify-between"><p className="text-xs text-neutral-400">Right to rent</p><span className="font-semibold text-neutral-900">{latestRef.right_to_rent_status}</span></div>}
                    {latestRef.right_to_rent_until  && <div className="flex items-center justify-between"><p className="text-xs text-neutral-400">RTR expires</p><span className="font-semibold text-neutral-900">{fmt(latestRef.right_to_rent_until)}</span></div>}
                    {latestRef.verified_income_annual && <div className="flex items-center justify-between"><p className="text-xs text-neutral-400">Verified income</p><span className="font-semibold text-neutral-900">£{Number(latestRef.verified_income_annual).toLocaleString()}/yr</span></div>}
                    {latestRef.max_affordable_rent_monthly && <div className="flex items-center justify-between"><p className="text-xs text-neutral-400">Max affordable rent</p><span className="font-semibold text-neutral-900">£{Number(latestRef.max_affordable_rent_monthly).toLocaleString()}/mo</span></div>}
                    <div className="flex items-center justify-between"><p className="text-xs text-neutral-400">Credit</p>{creditBadge(latestRef.credit_result)}</div>
                    {latestRef.aml_result && <div className="flex items-center justify-between"><p className="text-xs text-neutral-400">AML</p>{amlBadge(latestRef.aml_result)}</div>}
                    <p className="text-xs text-neutral-400 pt-sm border-t border-neutral-100">
                      {latestRef.reference_source ?? 'Unknown source'} · {latestRef.report_date ? fmt(latestRef.report_date) : fmt(latestRef.imported_at)}
                    </p>
                  </>
                ) : (
                  <div className="py-md text-center">
                    <p className="text-neutral-400 text-sm mb-sm">No reference imported yet.</p>
                    <button onClick={() => setActiveTab('reference')} className="text-sm text-blue-600 hover:underline font-medium">Import reference →</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TENANCY                                                       */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'tenancy' && (
          <div className="space-y-xl">
            {!currentTenancy ? (
              <div className="rounded-xl border border-neutral-200 bg-white p-xl text-center">
                <p className="text-neutral-400 text-sm">No active tenancy.</p>
              </div>
            ) : (
              <>
                <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
                  <div className="border-b border-neutral-100 px-xl py-lg flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Current tenancy</p>
                    <span className="text-xs font-semibold px-sm py-xs rounded-full bg-green-100 text-green-800 border border-green-200">Active</span>
                  </div>
                  <div className="p-xl grid grid-cols-2 md:grid-cols-3 gap-lg text-sm">
                    <div><p className="text-xs text-neutral-400 mb-xs uppercase tracking-wide">Property</p><p className="font-semibold text-neutral-900">{currentTenancy.property?.address || '—'}</p></div>
                    <div><p className="text-xs text-neutral-400 mb-xs uppercase tracking-wide">Room</p><p className="font-semibold text-neutral-900">{currentTenancy.room?.name || '—'}</p></div>
                    <div><p className="text-xs text-neutral-400 mb-xs uppercase tracking-wide">Monthly rent</p><p className="font-bold text-neutral-900 text-base">£{Number((currentTenancy as any).rent_amount || currentTenancy.rent_monthly || 0).toLocaleString()}</p></div>
                    <div><p className="text-xs text-neutral-400 mb-xs uppercase tracking-wide">Start date</p><p className="font-semibold text-neutral-900">{fmt(currentTenancy.start_date)}</p></div>
                    <div><p className="text-xs text-neutral-400 mb-xs uppercase tracking-wide">End date</p><p className="font-semibold text-neutral-900">{currentTenancy.end_date ? fmt(currentTenancy.end_date) : 'Rolling'}</p></div>
                    {currentTenancy.lease_reference && <div><p className="text-xs text-neutral-400 mb-xs uppercase tracking-wide">Lease ref</p><p className="font-semibold text-neutral-900">{currentTenancy.lease_reference}</p></div>}
                  </div>
                </div>

                {currentTenancy.deposit_amount && (
                  <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
                    <div className="border-b border-neutral-100 px-xl py-lg"><p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Deposit</p></div>
                    <div className="p-xl grid grid-cols-2 md:grid-cols-3 gap-lg text-sm">
                      <div><p className="text-xs text-neutral-400 mb-xs uppercase tracking-wide">Amount</p><p className="font-bold text-neutral-900 text-base">£{Number(currentTenancy.deposit_amount).toLocaleString()}</p></div>
                      <div><p className="text-xs text-neutral-400 mb-xs uppercase tracking-wide">Held by</p><p className="font-semibold text-neutral-900">{currentTenancy.deposit_held_by || '—'}</p></div>
                      <div><p className="text-xs text-neutral-400 mb-xs uppercase tracking-wide">Scheme ref</p><p className="font-semibold text-neutral-900">{currentTenancy.deposit_scheme_ref || '—'}</p></div>
                    </div>
                  </div>
                )}

                <div className="flex gap-md flex-wrap">
                  <button
                    onClick={async () => {
                      if (!window.confirm(`Mark ${tenantDisplayName(tenant)} as on notice?`)) return
                      const endDate = window.prompt('Enter notice end date (YYYY-MM-DD):', new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
                      if (!endDate) return
                      await supabase.from('tenancies').update({ status: 'on_notice', end_date: endDate }).eq('id', currentTenancy.id)
                      window.location.reload()
                    }}
                    className="px-lg py-sm rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-sm font-semibold hover:bg-amber-100 transition"
                  >
                    ⚠ Mark on Notice
                  </button>
                  <a href={`/admin/properties/${currentTenancy.property_id}`} className="px-lg py-sm rounded-lg border border-neutral-200 text-neutral-700 text-sm font-semibold hover:bg-neutral-50 transition">
                    View property →
                  </a>
                </div>
              </>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* REFERENCE                                                     */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'reference' && (
          <div className="space-y-xl">
            {importSuccess && <div className="rounded-xl bg-green-50 border border-green-200 p-md text-sm font-semibold text-green-800">✓ Reference imported and profile updated.</div>}
            {importError  && <div className="rounded-xl bg-red-50 border border-red-200 p-md text-sm font-semibold text-red-800">⚠ {importError}</div>}

            {!extractedData && (
              <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
                <div className="px-xl py-lg border-b border-neutral-100">
                  <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Import reference bundle</p>
                </div>
                <div className="p-xl">
                  <p className="text-sm text-neutral-500 mb-lg">Upload any documents — reference report, credit report, right to rent certificate, passport, driving licence. AI extracts all available fields.</p>
                  <label className="block w-full rounded-xl border-2 border-dashed border-neutral-200 hover:border-neutral-400 transition cursor-pointer p-xl text-center mb-md">
                    <input type="file" multiple accept=".pdf,image/*" className="hidden" onChange={handleFileChange} />
                    <p className="text-2xl mb-sm">📄</p>
                    <p className="text-sm font-semibold text-neutral-700">Click to select files</p>
                    <p className="text-xs text-neutral-400 mt-xs">PDF, JPG, PNG — multiple files accepted</p>
                  </label>
                  {uploadedFiles.length > 0 && (
                    <div className="space-y-sm mb-lg">
                      {uploadedFiles.map((f, i) => (
                        <div key={i} className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-md py-sm">
                          <div className="flex items-center gap-sm">
                            <span>{f.type === 'application/pdf' ? '📄' : '🖼'}</span>
                            <div><p className="text-sm font-semibold text-neutral-900">{f.name}</p><p className="text-xs text-neutral-400">{(f.size / 1024).toFixed(0)} KB</p></div>
                          </div>
                          <button onClick={() => removeFile(i)} className="text-neutral-400 hover:text-red-500 text-lg">×</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button onClick={handleExtract} disabled={!uploadedFiles.length || extracting}
                    className="w-full rounded-xl bg-neutral-900 hover:bg-neutral-700 disabled:opacity-40 px-lg py-md text-sm font-bold text-white transition">
                    {extracting ? '⏳ Extracting…' : `🔍 Extract from ${uploadedFiles.length} file${uploadedFiles.length !== 1 ? 's' : ''}`}
                  </button>
                </div>
              </div>
            )}

            {extractedData && (
              <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
                <div className="px-xl py-lg border-b border-neutral-100 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-xs">Extracted data — review & import</p>
                    <p className="text-xs text-neutral-400">✓ = auto-selected where profile field was empty</p>
                  </div>
                  <button onClick={() => { setExtractedData(null); setUploadedFiles([]) }} className="text-sm text-neutral-400 hover:text-neutral-700">← Back</button>
                </div>
                <div className="p-xl">
                  {extractedData.overall_decision && (
                    <div className="mb-lg flex items-center gap-md">
                      <span className="text-xs text-neutral-500">Overall decision:</span>
                      {decisionBadge(extractedData.overall_decision)}
                      {extractedData.reference_source && <span className="text-xs text-neutral-400">Source: {extractedData.reference_source}</span>}
                    </div>
                  )}

                  <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-md">Fields to sync to profile</p>
                  <div className="space-y-sm mb-xl">
                    {MERGE_FIELDS.map(mf => {
                      const extracted = extractedData[mf.key]
                      if (extracted == null) return null
                      const current     = (tenant as any)?.[PEOPLE_FIELD_MAP[mf.key]]
                      const formatted   = mf.format ? mf.format(extracted) : String(extracted)
                      const currentFmt  = current && mf.format ? mf.format(current) : current ? String(current) : null
                      const hasConflict = currentFmt && currentFmt !== formatted
                      return (
                        <label key={mf.key} className={`flex items-start gap-md rounded-xl border px-md py-sm cursor-pointer transition ${mergeSelections[mf.key] ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200 bg-white'}`}>
                          <input type="checkbox" checked={!!mergeSelections[mf.key]} onChange={e => setMergeSelections(prev => ({ ...prev, [mf.key]: e.target.checked }))} className="mt-xs w-4 h-4 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wide">{mf.label}</p>
                            <p className="text-sm font-semibold text-neutral-900 mt-xs">{formatted}</p>
                            {currentFmt && <p className={`text-xs mt-xs ${hasConflict ? 'text-amber-600' : 'text-neutral-400'}`}>{hasConflict ? '⚠ Replaces: ' : '✓ Matches: '}{currentFmt}</p>}
                            {!currentFmt && <p className="text-xs text-green-600 mt-xs">→ Will fill empty field</p>}
                          </div>
                        </label>
                      )
                    })}
                  </div>

                  <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-md">Additional data — stored in reference record</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-sm mb-xl text-sm">
                    {[
                      { label: 'Right to rent status', val: extractedData.right_to_rent_status },
                      { label: 'RTR until',            val: extractedData.right_to_rent_until },
                      { label: 'RTR reference',        val: extractedData.right_to_rent_ref },
                      { label: 'Max affordable rent',  val: extractedData.max_affordable_rent_monthly ? `£${Number(extractedData.max_affordable_rent_monthly).toLocaleString()}/mo` : null },
                      { label: 'Credit result',        val: extractedData.credit_result },
                      { label: 'Active judgments',     val: extractedData.active_judgments != null ? String(extractedData.active_judgments) : null },
                      { label: 'Landlord reference',   val: extractedData.prev_landlord_ref_result },
                      { label: 'AML result',           val: extractedData.aml_result },
                      { label: 'ID doc 1',             val: extractedData.id_type_1 ? `${extractedData.id_type_1}${extractedData.id_verified_1 ? ' ✓' : ''}` : null },
                      { label: 'ID doc 2',             val: extractedData.id_type_2 ? `${extractedData.id_type_2}${extractedData.id_verified_2 ? ' ✓' : ''}` : null },
                    ].filter(r => r.val != null).map(r => (
                      <div key={r.label} className="rounded-lg border border-neutral-200 bg-neutral-50 px-md py-sm">
                        <p className="text-xs text-neutral-400">{r.label}</p>
                        <p className="font-semibold text-neutral-900">{r.val}</p>
                      </div>
                    ))}
                  </div>

                  {Array.isArray(extractedData.previous_addresses) && extractedData.previous_addresses.length > 0 && (
                    <div className="mb-xl">
                      <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-md">Address history</p>
                      <div className="space-y-sm">
                        {extractedData.previous_addresses.map((a: any, i: number) => (
                          <div key={i} className="rounded-lg border border-neutral-200 bg-neutral-50 px-md py-sm text-sm">
                            <p className="font-semibold text-neutral-900">{a.address}</p>
                            <p className="text-xs text-neutral-400">{a.from ?? '?'} – {a.to ?? 'present'}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-md">
                    <button onClick={() => { setExtractedData(null); setUploadedFiles([]) }} className="rounded-xl border border-neutral-200 px-lg py-md text-sm font-semibold text-neutral-700 hover:bg-neutral-50">Cancel</button>
                    <button onClick={handleApply} disabled={applying} className="flex-1 rounded-xl bg-neutral-900 hover:bg-neutral-700 disabled:opacity-40 px-lg py-md text-sm font-bold text-white transition">
                      {applying ? 'Saving…' : `Save reference${Object.values(mergeSelections).some(Boolean) ? ' & update profile' : ''}`}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {referenceHistory.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-md">Reference history</p>
                <div className="space-y-sm">
                  {referenceHistory.map((ref, idx) => (
                    <details key={ref.id} className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
                      <summary className="px-xl py-lg cursor-pointer flex items-center justify-between">
                        <div className="flex items-center gap-md">
                          {idx === 0 && <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-sm py-xs rounded-full border border-blue-200">Latest</span>}
                          {decisionBadge(ref.overall_decision)}
                          <span className="text-sm font-semibold text-neutral-900">{ref.reference_source ?? 'Reference'}</span>
                          <span className="text-xs text-neutral-400">{ref.report_date ? fmt(ref.report_date) : fmt(ref.imported_at)}</span>
                        </div>
                        <span className="text-neutral-400 text-xs">▼</span>
                      </summary>
                      <div className="border-t border-neutral-100 p-xl grid grid-cols-2 sm:grid-cols-3 gap-md text-sm">
                        {ref.legal_name              && <div><p className="text-xs text-neutral-400">Legal name</p><p className="font-semibold text-neutral-900">{ref.legal_name}</p></div>}
                        {ref.nationality             && <div><p className="text-xs text-neutral-400">Nationality</p><p className="font-semibold text-neutral-900">{ref.nationality}</p></div>}
                        {ref.date_of_birth           && <div><p className="text-xs text-neutral-400">DOB</p><p className="font-semibold text-neutral-900">{fmt(ref.date_of_birth)}</p></div>}
                        {ref.right_to_rent_status    && <div><p className="text-xs text-neutral-400">Right to rent</p><p className="font-semibold text-neutral-900">{ref.right_to_rent_status}</p></div>}
                        {ref.right_to_rent_until     && <div><p className="text-xs text-neutral-400">RTR until</p><p className="font-semibold text-neutral-900">{fmt(ref.right_to_rent_until)}</p></div>}
                        {ref.verified_income_annual  && <div><p className="text-xs text-neutral-400">Verified income</p><p className="font-semibold text-neutral-900">£{Number(ref.verified_income_annual).toLocaleString()}/yr</p></div>}
                        {ref.max_affordable_rent_monthly && <div><p className="text-xs text-neutral-400">Max rent</p><p className="font-semibold text-neutral-900">£{Number(ref.max_affordable_rent_monthly).toLocaleString()}/mo</p></div>}
                        {ref.credit_result           && <div><p className="text-xs text-neutral-400">Credit</p><p className="font-semibold text-neutral-900">{ref.credit_result}</p></div>}
                        {ref.aml_result              && <div><p className="text-xs text-neutral-400">AML</p><p className="font-semibold text-neutral-900">{ref.aml_result}</p></div>}
                        {ref.id_type_1               && <div><p className="text-xs text-neutral-400">ID doc 1</p><p className="font-semibold text-neutral-900">{ref.id_type_1} {ref.id_verified_1 ? '✓' : ''}</p></div>}
                        {ref.id_type_2               && <div><p className="text-xs text-neutral-400">ID doc 2</p><p className="font-semibold text-neutral-900">{ref.id_type_2} {ref.id_verified_2 ? '✓' : ''}</p></div>}
                        {ref.prev_landlord_ref_result && <div><p className="text-xs text-neutral-400">Landlord ref</p><p className="font-semibold text-neutral-900">{ref.prev_landlord_ref_result}{ref.prev_landlord_ref_name ? ` · ${ref.prev_landlord_ref_name}` : ''}</p></div>}
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* COMMUNICATIONS                                                */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'communications' && (
          <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
            {communications.length === 0 ? (
              <div className="p-xl text-center text-neutral-400 text-sm">No communications yet</div>
            ) : (
              <div className="divide-y divide-neutral-100 max-h-[600px] overflow-y-auto">
                {communications.map(c => (
                  <div key={c.id} className="px-xl py-lg">
                    <p className="font-semibold text-neutral-900 text-sm">{c.title}</p>
                    <p className="text-xs text-neutral-500 mt-xs line-clamp-2">{c.message}</p>
                    <div className="flex items-center justify-between mt-sm text-xs text-neutral-400">
                      <span>{c.notification_type}</span><span>{fmt(c.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* SAFETY                                                        */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'safety' && (
          <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
            {safetyChecks.length === 0 ? (
              <div className="p-xl text-center text-neutral-400 text-sm">No safety checks yet</div>
            ) : (
              <div className="divide-y divide-neutral-100">
                {safetyChecks.map(c => (
                  <div key={c.id} className="px-xl py-lg">
                    <p className="font-semibold text-neutral-900 text-sm capitalize">{c.check_type}</p>
                    <p className="text-xs text-neutral-500 mt-xs">{c.response}</p>
                    <p className="text-xs text-neutral-400 mt-sm">{fmt(c.created_at)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TIMELINE                                                      */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'history' && (
          <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
            <div className="px-xl py-lg border-b border-neutral-100">
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Tenancy timeline</p>
            </div>
            <div className="p-xl space-y-lg">
              {tenancies.length === 0 && <p className="text-sm text-neutral-400 text-center py-lg">No tenancy history</p>}
              {tenancies.map((t, i) => (
                <div key={t.id} className="flex gap-lg">
                  <div className="flex flex-col items-center">
                    <div className={`w-3 h-3 rounded-full mt-xs flex-shrink-0 ${!t.end_date ? 'bg-green-500' : 'bg-neutral-300'}`} />
                    {i < tenancies.length - 1 && <div className="w-px flex-1 bg-neutral-200 mt-sm" />}
                  </div>
                  <div className="pb-lg">
                    <p className="text-sm font-semibold text-neutral-900">{t.property?.address || '—'} — {t.room?.name || '—'}</p>
                    <p className="text-xs text-neutral-400 mt-xs">{fmt(t.start_date)} {t.end_date ? `→ ${fmt(t.end_date)}` : '→ present'}</p>
                    {!t.end_date && <span className="mt-sm inline-block text-xs font-semibold px-sm py-xs rounded-full bg-green-100 text-green-800 border border-green-200">Active</span>}
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
