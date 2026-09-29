'use client'

import { useEffect, useState } from 'react'
import { openStoredFile } from '@/lib/files/openFile'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import DocReview, { AIResult, TYPE_LABELS } from '@/app/components/DocReview'
import PurchaseReview from '@/app/components/PurchaseReview'
import InvoiceReview from '@/app/components/InvoiceReview'
import TenantPicker from '@/app/components/TenantPicker'
import { sortPropertiesNumerically } from '@/lib/sortProperties'
const BLANK: AIResult = {
  doc_type: 'other', confidence: 0, summary: '', issue_date: '', expiry_date: '', provider: '',
  policy_number: '', property_address: '', person_name: '', person_phone: '', person_email: '',
  occupation: '', annual_income: '', previous_address: '', tenancy_start: '', tenancy_end: '', monthly_rent: '',
}

export default function InboxPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [docs, setDocs] = useState<any[]>([])
  const [properties, setProperties] = useState<any[]>([])
  const [people, setPeople] = useState<any[]>([])
  const [tenancies, setTenancies] = useState<any[]>([])
  const [applicants, setApplicants] = useState<any[]>([])
  const [tab, setTab] = useState<'new' | 'filed' | 'dismissed'>('new')
  const [openId, setOpenId] = useState<string | null>(null)
  const [flash, setFlash] = useState('')
  const [converting, setConverting] = useState<string | null>(null)
  const [rescanning, setRescanning] = useState<string | null>(null)
  const [overrideModes, setOverrideModes] = useState<Record<string, boolean>>({})
  const [overridePersonMap, setOverridePersonMap] = useState<Record<string, string>>({})
  const [overrideApplicantMap, setOverrideApplicantMap] = useState<Record<string, string>>({})
  const [duplicateFilenames, setDuplicateFilenames] = useState<Record<string, { id: string; status: string; created_at: string; storage_path: string }[]>>({})

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      if (!data || data.assignment?.role !== 'administrator' && data.assignment?.role !== 'admin') {
        router.push('/login')
        return
      }
      const supabase = createClient()
      const { data: props } = await supabase.from('properties').select('id, name, address').order('name')
      const { data: ppl } = await supabase.from('people').select('id, full_name, first_name, last_name, email').eq('role', 'tenant').order('full_name')
      const { data: tens } = await supabase
        .from('tenancies')
        .select('id, start_date, end_date, person_id, people!person_id(id, full_name, first_name, last_name), rooms(name), properties(name)')
        .order('start_date', { ascending: false })
      const { data: apps } = await supabase
        .from('applicants')
        .select('id, full_name, email, room_id, property_id, pipeline_stage, rooms(name), properties(name)')
        .neq('pipeline_stage', 'converted')
        .order('full_name')
      setProperties(sortPropertiesNumerically(props || []))
      setPeople(ppl || [])
      setTenancies((tens as any) || [])
      setApplicants(apps || [])
      await loadDocs()
      setLoading(false)
    }
    init()
  }, [router])

  async function loadDocs() {
    const supabase = createClient()
    const { data } = await supabase
      .from('inbox_documents')
      .select('*')
      .order('created_at', { ascending: false })
    setDocs(data || [])
    // Build duplicate filename map from all docs
    const map: Record<string, { id: string; status: string; created_at: string; storage_path: string }[]> = {}
    for (const d of (data || [])) {
      if (!d.filename) continue
      if (!map[d.filename]) map[d.filename] = []
      map[d.filename].push({ id: d.id, status: d.status, created_at: d.created_at, storage_path: d.storage_path })
    }
    setDuplicateFilenames(map)
  }

  function fileUrl(path: string) {
    const supabase = createClient()
    return supabase.storage.from('inbox-docs').getPublicUrl(path).data.publicUrl
  }

  async function markFiled(id: string, msg: string) {
    const supabase = createClient()
    await supabase.from('inbox_documents').update({ status: 'filed' }).eq('id', id)
    setOpenId(null)
    setFlash('✅ ' + msg)
    await loadDocs()
  }

  async function dismiss(id: string) {
    const supabase = createClient()
    const { error } = await supabase.from('inbox_documents').update({ status: 'dismissed' }).eq('id', id)
    if (error) { setFlash('❌ Could not dismiss: ' + error.message); return }
    setOpenId(null)
    setDocs(prev => prev.filter(d => d.id !== id))
  }

  async function deleteDoc(id: string) {
    const supabase = createClient()
    const doc = docs.find(d => d.id === id)
    if (doc?.storage_path) {
      await supabase.storage.from('inbox-docs').remove([doc.storage_path])
    }
    const { error } = await supabase.from('inbox_documents').delete().eq('id', id)
    if (error) { setFlash('❌ Could not delete: ' + error.message); return }
    setOpenId(null)
    setDocs(prev => prev.filter(d => d.id !== id))
    setFlash('🗑️ Document deleted')
    setTimeout(() => setFlash(''), 3000)
  }

  async function rescanDoc(id: string) {
    setRescanning(id)
    try {
      const { data: { session } } = await createClient().auth.getSession()
      const res = await fetch(`/api/inbox/rescan/${id}`, {
        method: 'POST',
        headers: session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {},
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Rescan failed')
      setDocs(prev => prev.map(d => d.id === id ? { ...d, ...(json.doc || {}), ai_result: json.ai_result, ai_error: json.ai_error } : d))
      setFlash(json.ai_result ? '✅ AI scan complete — fields updated below' : '⚠️ Rescan done but AI couldn\'t classify — fill in manually')
    } catch (e: any) {
      setFlash('❌ Rescan failed: ' + e.message)
    } finally {
      setRescanning(null)
      setTimeout(() => setFlash(''), 4000)
    }
  }

  async function convertApplicant(applicantId: string, docId: string) {
    setConverting(applicantId)
    try {
      const res = await fetch(`/api/applicants/${applicantId}/convert`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      const j = await res.json()
      if (!res.ok) {
        setFlash(`❌ Convert failed: ${j.error}`)
      } else {
        // Mark the inbox doc as filed now that the applicant is converted
        const supabase = createClient()
        await supabase.from('inbox_documents').update({ status: 'filed' }).eq('id', docId)
        setFlash(`✅ ${j.message}`)
        await loadDocs()
        setOpenId(null)
      }
    } catch {
      setFlash('❌ Network error')
    }
    setConverting(null)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar left={<BackButton href="/admin/inbox" />} />
        <p className="p-xl text-sm text-neutral-400">Loading…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin" />} />

      <main className="mx-auto max-w-6xl px-lg py-xl">
        <div className="flex items-start justify-between gap-md">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">Document inbox</h1>
            <p className="mt-sm text-sm text-neutral-600">
              Documents forwarded by email land here. Review the AI&apos;s suggestion and file each one, or
              assign it yourself. Nothing is filed until you confirm.
            </p>
          </div>
          <Link href="/admin/ai-upload" className="shrink-0 rounded-xl border border-neutral-300 bg-white px-md py-sm text-sm font-semibold hover:bg-neutral-50">
            ⬆ Upload
          </Link>
        </div>

        {flash && <div className="mt-lg rounded-xl bg-green-600 p-md text-sm font-semibold text-white">{flash}</div>}

        {/* ── Tabs ─────────────────────────────────────────────────────────── */}
        <div className="mt-lg flex gap-xs rounded-2xl bg-neutral-200/60 p-xs w-fit">
          {(['new', 'filed', 'dismissed'] as const).map(t => {
            const count = docs.filter(d => d.status === t).length
            const active = tab === t
            return (
              <button
                key={t}
                onClick={() => { setTab(t); setOpenId(null) }}
                className={`rounded-xl px-lg py-sm text-sm font-semibold transition-all ${active ? 'bg-white shadow text-neutral-900' : 'text-neutral-500 hover:text-neutral-700'}`}
              >
                {t === 'new' ? 'New' : t === 'filed' ? 'Filed' : 'Dismissed'}
                {count > 0 && (
                  <span className={`ml-xs rounded-full px-xs py-xs text-xs font-bold ${active ? 'bg-neutral-900 text-white' : 'bg-neutral-300 text-neutral-600'}`}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {docs.filter(d => d.status === tab).length === 0 ? (
          <div className="mt-lg rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center text-sm text-neutral-500">
            {tab === 'new' ? 'Inbox is empty. Forward a document to your inbox address and it\'ll appear here.' : tab === 'filed' ? 'No filed documents yet.' : 'No dismissed documents.'}
          </div>
        ) : (
          <div className="mt-lg space-y-md">
            {docs.filter(d => d.status === tab).map((d) => {
              const ai = (d.ai_result || null) as AIResult | null
              const label = ai ? TYPE_LABELS[ai.doc_type] || 'Document' : 'Unread document'
              const isOpen = openId === d.id
              return (
                <div key={d.id} className="rounded-2xl border border-neutral-200 bg-white">
                  <button
                    onClick={() => setOpenId(isOpen ? null : d.id)}
                    className="flex w-full items-center justify-between gap-md p-md text-left"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-bold text-neutral-900">
                        {label}
                        {ai && ai.confidence ? (
                          <span className="ml-sm text-xs font-normal text-neutral-400">{Math.round(ai.confidence * 100)}%</span>
                        ) : null}
                      </p>
                      <p className="truncate text-xs text-neutral-500">
                        {ai?.summary || d.subject || d.filename}
                        {d.from_email ? ` · from ${d.from_email}` : ''}
                      </p>
                    </div>
                    <span className="shrink-0 text-neutral-400">{isOpen ? '▲' : '▼'}</span>
                  </button>

                  {isOpen && (
                    <div className="border-t border-neutral-200 p-md">
                      <div className="mb-md flex items-center gap-md text-sm">
                        <a href="#" onClick={e => { e.preventDefault(); openStoredFile({ bucket: 'inbox-docs', path: d.storage_path }) }} className="font-semibold text-neutral-900 underline">
                          View original ({d.filename})
                        </a>
                        <button
                          onClick={() => rescanDoc(d.id)}
                          disabled={rescanning === d.id}
                          className="text-xs font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-50"
                        >
                          {rescanning === d.id ? '⏳ Rescanning…' : '🔄 Rescan'}
                        </button>
                        <button onClick={() => dismiss(d.id)} className="text-xs text-neutral-400 hover:text-neutral-700">
                          Dismiss
                        </button>
                        <button onClick={() => { if (confirm('Permanently delete this document and its file?')) deleteDoc(d.id) }} className="text-xs text-neutral-400 hover:text-red-600">
                          Delete
                        </button>
                      </div>
                      {/* Duplicate filename warning */}
                      {d.filename && duplicateFilenames[d.filename] && duplicateFilenames[d.filename].filter(x => x.id !== d.id).length > 0 && (() => {
                        const others = duplicateFilenames[d.filename].filter(x => x.id !== d.id)
                        return (
                          <div className="mb-md rounded-lg border border-amber-300 bg-amber-50 px-md py-sm flex items-start gap-sm">
                            <span className="shrink-0 mt-xs">⚠️</span>
                            <div>
                              <p className="text-sm font-semibold text-amber-900">Possible duplicate — same filename already in inbox</p>
                              <p className="text-xs text-amber-800 mt-xs">
                                A document named <strong>{d.filename}</strong> has been uploaded {others.length} other time{others.length > 1 ? 's' : ''}.
                              </p>
                              <div className="mt-sm flex flex-wrap gap-sm">
                                {others.map(o => (
                                  <a key={o.id} href="#" onClick={e => { e.preventDefault(); openStoredFile({ bucket: 'inbox-docs', path: o.storage_path }) }}
                                    className="text-xs font-semibold text-amber-700 underline hover:text-amber-900">
                                    View {o.status === 'filed' ? 'filed' : o.status === 'dismissed' ? 'dismissed' : 'other'} copy
                                    ({new Date(o.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })})
                                  </a>
                                ))}
                              </div>
                            </div>
                          </div>
                        )
                      })()}
                      {d.ai_error && !ai && (() => {
                        let friendlyError = d.ai_error as string
                        try {
                          // ai_error sometimes contains a raw API JSON blob — extract just the message
                          const match = friendlyError.match(/"message":"([^"]+)"/)
                          if (match) friendlyError = match[1]
                        } catch {}
                        const isCreditError = friendlyError.toLowerCase().includes('credit') || friendlyError.toLowerCase().includes('billing')
                        return (
                          <p className="mb-md rounded-lg bg-amber-50 p-sm text-xs text-amber-800">
                            {isCreditError
                              ? <>AI scan unavailable — Anthropic credit balance is too low. Top up at <strong>console.anthropic.com → Billing</strong>, then hit <strong>Rescan</strong> above.</>
                              : <>The AI couldn&apos;t read this ({friendlyError}). Hit <strong>Rescan</strong> to try again, or pick the type manually below.</>
                            }
                          </p>
                        )
                      })()}

                      {/* ── Person match banner (tenancy agreements + references) ── */}
                      {(ai?.doc_type === 'tenancy_agreement' || ai?.doc_type === 'tenant_reference') && (() => {
                        const isTenancy = ai.doc_type === 'tenancy_agreement'
                        const matchedApplicant = d.matched_applicant_id
                          ? applicants.find((a: any) => a.id === d.matched_applicant_id)
                          : null
                        const matchedTenant = d.matched_person_id
                          ? people.find((p: any) => p.id === d.matched_person_id)
                          : null
                        const confidence = d.match_confidence ? Math.round(d.match_confidence * 100) : null
                        const rentDueDay = d.extracted_rent_due_day
                        const docLabel = isTenancy ? 'Tenancy agreement' : 'Reference'
                        const overrideMode = overrideModes[d.id] || false
                        const setOverrideMode = (v: boolean) => setOverrideModes(prev => ({ ...prev, [d.id]: v }))
                        const overridePerson = overridePersonMap[d.id] || ''
                        const setOverridePerson = (v: string) => setOverridePersonMap(prev => ({ ...prev, [d.id]: v }))
                        const overrideApplicant = overrideApplicantMap[d.id] || ''
                        const setOverrideApplicant = (v: string) => setOverrideApplicantMap(prev => ({ ...prev, [d.id]: v }))

                        if (matchedTenant && !overrideMode) {
                          return (
                            <div className="mb-md rounded-xl bg-green-50 border border-green-200 p-md">
                              <p className="text-sm font-semibold text-green-900 mb-xs">✅ Matched to existing tenant</p>
                              <p className="text-sm text-green-800">
                                <strong>{matchedTenant.full_name || [matchedTenant.first_name, matchedTenant.last_name].filter(Boolean).join(' ')}</strong>
                                {' '}— matched by email
                                {confidence ? ` (${confidence}% confidence)` : ''}
                              </p>
                              {isTenancy && rentDueDay ? (
                                <p className="text-sm text-green-700 mt-xs">
                                  Rent due day automatically updated to <strong>{rentDueDay}</strong> on their active tenancy.
                                </p>
                              ) : isTenancy ? (
                                <p className="text-sm text-green-700 mt-xs">No rent due day extracted from document.</p>
                              ) : null}
                              <button onClick={() => setOverrideMode(true)} className="mt-sm text-xs text-green-700 underline hover:text-green-900">
                                Not the right person? Override
                              </button>
                            </div>
                          )
                        }

                        if (matchedApplicant && !overrideMode) {
                          return (
                            <div className="mb-md rounded-xl bg-blue-50 border border-blue-200 p-md">
                              <p className="text-sm font-semibold text-blue-900 mb-xs">📋 Matched to applicant</p>
                              <p className="text-sm text-blue-800 mb-sm">
                                <strong>{matchedApplicant.full_name}</strong>
                                {matchedApplicant.rooms?.name ? ` · ${matchedApplicant.rooms.name}` : ''}
                                {matchedApplicant.properties?.name ? `, ${matchedApplicant.properties.name}` : ''}
                                {confidence ? ` (${confidence}% confidence)` : ''}
                              </p>
                              {isTenancy && rentDueDay && (
                                <p className="text-sm text-blue-700 mb-sm">
                                  Rent due day extracted: <strong>{rentDueDay}</strong> — will be set on conversion.
                                </p>
                              )}
                              {isTenancy && (
                                <button
                                  onClick={() => convertApplicant(matchedApplicant.id, d.id)}
                                  disabled={converting === matchedApplicant.id}
                                  className="rounded-lg bg-blue-700 px-md py-sm text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                                >
                                  {converting === matchedApplicant.id ? 'Converting…' : `Convert ${matchedApplicant.full_name} to tenant →`}
                                </button>
                              )}
                              <button onClick={() => setOverrideMode(true)} className="mt-sm block text-xs text-blue-700 underline hover:text-blue-900">
                                Not the right person? Override
                              </button>
                            </div>
                          )
                        }

                        // No match or override mode — show person picker
                        return (
                          <div className="mb-md rounded-xl bg-amber-50 border border-amber-200 p-md">
                            <p className="text-sm font-semibold text-amber-900 mb-xs">
                              {overrideMode ? `🔄 Override ${docLabel} match` : `⚠️ ${docLabel} — no match found`}
                            </p>
                            {!overrideMode && (
                              <p className="text-sm text-amber-800 mb-sm">
                                Couldn&apos;t auto-match this to an applicant or existing tenant.
                                {ai?.person_email ? ` (Document email: ${ai.person_email})` : ' (No email found in document.)'}
                              </p>
                            )}
                            {isTenancy && rentDueDay && (
                              <p className="text-sm text-amber-700 mb-sm">
                                Rent due day extracted: <strong>{rentDueDay}</strong>
                              </p>
                            )}
                            <div className="space-y-sm">
                              <div>
                                <label className="block text-xs font-semibold text-amber-900 mb-xs">Link to existing tenant:</label>
                                <TenantPicker
                                  people={people}
                                  tenancies={tenancies}
                                  value={overridePerson}
                                  onChange={v => { setOverridePerson(v); setOverrideApplicant('') }}
                                  placeholder="Search by name or email…"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-amber-900 mb-xs">Or link to applicant:</label>
                                <select
                                  value={overrideApplicant}
                                  onChange={e => { setOverrideApplicant(e.target.value); setOverridePerson('') }}
                                  className="w-full rounded-lg border border-amber-300 bg-white px-sm py-xs text-sm"
                                >
                                  <option value="">— Select applicant —</option>
                                  {applicants.map((a: any) => (
                                    <option key={a.id} value={a.id}>
                                      {a.full_name}
                                      {a.rooms?.name ? ` · ${a.rooms.name}` : ''}
                                      {a.properties?.name ? `, ${a.properties.name}` : ''}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="flex gap-sm pt-xs">
                                {(overridePerson || overrideApplicant) && isTenancy && overrideApplicant && (
                                  <button
                                    onClick={() => convertApplicant(overrideApplicant, d.id)}
                                    disabled={converting === overrideApplicant}
                                    className="rounded-lg bg-blue-700 px-md py-sm text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                                  >
                                    {converting === overrideApplicant ? 'Converting…' : 'Convert applicant to tenant →'}
                                  </button>
                                )}
                                {overrideMode && (
                                  <button onClick={() => setOverrideMode(false)} className="text-xs text-amber-700 underline hover:text-amber-900">
                                    Cancel
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })()}
                      {ai?.doc_type === 'purchase_receipt' ? (
                        <PurchaseReview
                          initial={ai}
                          properties={properties}
                          onApplied={(msg) => markFiled(d.id, msg)}
                          onCancel={() => setOpenId(null)}
                        />
                      ) : ai?.doc_type === 'supplier_invoice' ? (
                        <InvoiceReview
                          initial={ai}
                          properties={properties}
                          onApplied={(msg) => markFiled(d.id, msg)}
                          onCancel={() => setOpenId(null)}
                        />
                      ) : (
                        <DocReview
                          initial={ai || BLANK}
                          inboxStorageUrl={d.storage_path ? fileUrl(d.storage_path) : undefined}
                          inboxFilename={d.filename || undefined}
                          properties={properties}
                          people={people}
                          tenancies={tenancies}
                          applicants={applicants}
                          matchedPersonId={d.matched_person_id || undefined}
                          matchedApplicantId={d.matched_applicant_id || undefined}
                          onApplied={(msg) => markFiled(d.id, msg)}
                          onCancel={() => setOpenId(null)}
                        />
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
