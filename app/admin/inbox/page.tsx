'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import DocReview, { AIResult, TYPE_LABELS } from '@/app/components/DocReview'
import PurchaseReview from '@/app/components/PurchaseReview'
import InvoiceReview from '@/app/components/InvoiceReview'
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
  const [openId, setOpenId] = useState<string | null>(null)
  const [flash, setFlash] = useState('')
  const [converting, setConverting] = useState<string | null>(null)

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
        .select('id, start_date, end_date, people!person_id(full_name, first_name, last_name), rooms(name), properties(name)')
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
      .eq('status', 'new')
      .order('created_at', { ascending: false })
    setDocs(data || [])
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
    if (!confirm('Dismiss this document from the inbox?')) return
    const supabase = createClient()
    await supabase.from('inbox_documents').update({ status: 'dismissed' }).eq('id', id)
    setOpenId(null)
    await loadDocs()
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
        <AppBar left={<BackButton />} />
        <p className="p-xl text-sm text-neutral-400">Loading…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin" />} />

      <main className="mx-auto max-w-2xl px-lg py-lg">
        <div className="flex items-start justify-between gap-md">
          <div>
            <h1 className="text-3xl font-bold text-neutral-900">Document inbox</h1>
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

        {docs.length === 0 ? (
          <div className="mt-lg rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center text-sm text-neutral-500">
            Inbox is empty. Forward a document to your inbox address and it&apos;ll appear here.
          </div>
        ) : (
          <div className="mt-lg space-y-md">
            {docs.map((d) => {
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
                        <a href={fileUrl(d.storage_path)} target="_blank" rel="noreferrer" className="font-semibold text-neutral-900 underline">
                          View original ({d.filename})
                        </a>
                        <button onClick={() => dismiss(d.id)} className="text-xs text-neutral-400 hover:text-red-600">
                          Dismiss
                        </button>
                      </div>
                      {d.ai_error && !ai && (
                        <p className="mb-md rounded-lg bg-amber-50 p-sm text-xs text-amber-800">
                          The AI couldn&apos;t read this ({d.ai_error}). Pick the type and fill the details in yourself below.
                        </p>
                      )}

                      {/* ── Tenancy agreement match banner ───────────────────────── */}
                      {ai?.doc_type === 'tenancy_agreement' && (() => {
                        const matchedApplicant = d.matched_applicant_id
                          ? applicants.find((a: any) => a.id === d.matched_applicant_id)
                          : null
                        const matchedTenant = d.matched_person_id
                          ? people.find((p: any) => p.id === d.matched_person_id)
                          : null
                        const confidence = d.match_confidence ? Math.round(d.match_confidence * 100) : null
                        const rentDueDay = d.extracted_rent_due_day

                        if (matchedTenant) {
                          return (
                            <div className="mb-md rounded-xl bg-green-50 border border-green-200 p-md">
                              <p className="text-sm font-semibold text-green-900 mb-xs">✅ Matched to existing tenant</p>
                              <p className="text-sm text-green-800">
                                <strong>{matchedTenant.full_name}</strong> — matched by email
                                {confidence ? ` (${confidence}% confidence)` : ''}
                              </p>
                              {rentDueDay ? (
                                <p className="text-sm text-green-700 mt-xs">
                                  Rent due day automatically updated to <strong>{rentDueDay}</strong> on their active tenancy.
                                </p>
                              ) : (
                                <p className="text-sm text-green-700 mt-xs">No rent due day extracted from document.</p>
                              )}
                            </div>
                          )
                        }

                        if (matchedApplicant) {
                          return (
                            <div className="mb-md rounded-xl bg-blue-50 border border-blue-200 p-md">
                              <p className="text-sm font-semibold text-blue-900 mb-xs">📋 Matched to applicant</p>
                              <p className="text-sm text-blue-800 mb-sm">
                                <strong>{matchedApplicant.full_name}</strong>
                                {matchedApplicant.rooms?.name ? ` · ${matchedApplicant.rooms.name}` : ''}
                                {matchedApplicant.properties?.name ? `, ${matchedApplicant.properties.name}` : ''}
                                {confidence ? ` (${confidence}% confidence)` : ''}
                              </p>
                              {rentDueDay && (
                                <p className="text-sm text-blue-700 mb-sm">
                                  Rent due day extracted: <strong>{rentDueDay}</strong> — will be set on conversion.
                                </p>
                              )}
                              <button
                                onClick={() => convertApplicant(matchedApplicant.id, d.id)}
                                disabled={converting === matchedApplicant.id}
                                className="rounded-lg bg-blue-700 px-md py-sm text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                              >
                                {converting === matchedApplicant.id ? 'Converting…' : `Convert ${matchedApplicant.full_name} to tenant →`}
                              </button>
                            </div>
                          )
                        }

                        // No match
                        return (
                          <div className="mb-md rounded-xl bg-amber-50 border border-amber-200 p-md">
                            <p className="text-sm font-semibold text-amber-900 mb-xs">⚠️ Tenancy agreement — no match found</p>
                            <p className="text-sm text-amber-800">
                              Couldn&apos;t auto-match this to an applicant or existing tenant.
                              {ai?.person_email ? ` (Document email: ${ai.person_email})` : ' (No email found in document.)'}
                              {' '}Review and file manually below.
                            </p>
                            {rentDueDay && (
                              <p className="text-sm text-amber-700 mt-xs">
                                Rent due day extracted: <strong>{rentDueDay}</strong>
                              </p>
                            )}
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
                          properties={properties}
                          people={people}
                          tenancies={tenancies}
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
