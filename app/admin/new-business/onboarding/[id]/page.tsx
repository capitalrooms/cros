'use client'

import { useEffect, useState, use } from 'react'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import { adminFetch, downloadPdf } from '@/lib/adminFetch'
import { FACT_LABELS, propertyDocLabel, type PropertyDoc } from '@/lib/landlordOnboarding/propertyDocs'

type Status = 'pass' | 'review' | 'fail'
interface Check { area: string; label: string; status: Status; detail: string }
interface Review {
  generated_at: string
  suggested_level: 'low' | 'medium' | 'high'
  reasons: string[]
  checks: Check[]
  people: { role: string; name: string; screening?: { listDate: string; matches: { strength: string; entry: { name: string; id: string; regime: string; dob: string } }[] }; screeningError?: string }[]
}
interface Decision { risk_level: string; risk_reason: string; risk_mitigation?: string; identity_verified: boolean; reviewer_name: string; reviewed_at: string }
interface Diff { field: string; inAgreement: string; fromLandlord: string }

const RISK_STYLE: Record<string, string> = {
  low: 'bg-green-50 text-green-800 border-green-200',
  medium: 'bg-amber-50 text-amber-800 border-amber-200',
  high: 'bg-red-50 text-red-800 border-red-200',
}
const STATUS_STYLE: Record<Status, [string, string]> = {
  pass: ['Pass', 'bg-green-100 text-green-800'],
  review: ['Check', 'bg-amber-100 text-amber-800'],
  fail: ['Fail', 'bg-red-100 text-red-800'],
}
const DOC_LABELS: Record<string, string> = {
  id_document: 'Photo ID — first landlord', proof_of_address: 'Proof of address — first landlord',
  joint_id_document: 'Photo ID — second landlord', joint_proof_of_address: 'Proof of address — second landlord',
  proof_of_ownership: 'Proof of ownership', certificate_of_incorporation: 'Certificate of Incorporation',
  articles_of_association: 'Articles of Association', director_id: 'Director ID', director_address: 'Director proof of address',
  gas_safety_certificate: 'Gas Safety Certificate', eicr: 'EICR', epc: 'EPC', fire_risk_assessment: 'Fire Risk Assessment',
  fire_detection_certificate: 'Fire alarm certificate', emergency_lighting_certificate: 'Emergency lighting certificate',
  pat_test_record: 'PAT test record', legionella_risk_assessment: 'Legionella risk assessment', hmo_licence: 'HMO licence',
  other_document: 'Other document',
}
const fmt = (iso?: string) => iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

export default function OnboardingReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [row, setRow] = useState<any>(null)
  const [error, setError] = useState('')
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [diffs, setDiffs] = useState<Diff[] | null>(null)
  const [hasSnapshot, setHasSnapshot] = useState(true)
  const [dec, setDec] = useState({ risk_level: '', risk_reason: '', risk_mitigation: '', identity_verified: false, documents_viewed: false })

  async function load() {
    const r = await adminFetch(`/api/landlord-onboarding/${id}`)
    const d = await r.json()
    if (!r.ok) { setError(d.error ?? 'Could not load'); return }
    setRow(d.row)
    const fd = d.row.form_data ?? {}
    const decision: Decision | undefined = fd.__decision
    setDec({
      risk_level: decision?.risk_level ?? fd.__review?.suggested_level ?? '',
      risk_reason: decision?.risk_reason ?? '',
      risk_mitigation: decision?.risk_mitigation ?? '',
      identity_verified: decision?.identity_verified ?? false,
      documents_viewed: !!decision,
    })
    const paths = Object.values((fd.documents ?? {}) as Record<string, string[]>).flat()
    paths.forEach(async p => {
      const u = await adminFetch(`/api/landlord-onboarding/upload/${d.row.token}?path=${encodeURIComponent(p)}`)
      const j = await u.json()
      if (j.url) setUrls(prev => ({ ...prev, [p]: j.url }))
    })
    const a = await adminFetch(`/api/landlord-onboarding/${id}/agreement`)
    const aj = await a.json()
    if (a.ok) { setDiffs(aj.diffs); setHasSnapshot(aj.hasSnapshot) }
  }
  useEffect(() => { load() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function act(label: string, fn: () => Promise<Response>, success: string) {
    setBusy(label); setMsg(null)
    try {
      const r = await fn()
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error ?? 'Something went wrong')
      setMsg({ ok: true, text: success })
      await load()
      return d
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Something went wrong' })
    } finally { setBusy(null) }
  }

  const rerun = () => act('rerun', () => adminFetch(`/api/landlord-onboarding/${id}/review`, { method: 'POST' }), 'Checks re-run')
  const saveDecision = () => act('decision', () => adminFetch(`/api/landlord-onboarding/${id}/decision`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dec),
  }), 'Decision recorded')
  async function approve() {
    const high = row?.form_data?.__decision?.risk_level === 'high'
    if (high && !confirm('This client is HIGH risk. Confirm enhanced due diligence is complete and senior approval has been given.')) return
    if (!confirm(`Send the confirmation email and final ${row?.form_data?.__agreement?.agreementType === 'rent_collection' ? 'rent collection' : 'management'} agreement to ${row.email}${row.form_data?.j_contact_email ? ` and ${row.form_data.j_contact_email}` : ''}?`)) return
    await act('approve', () => adminFetch(`/api/landlord-onboarding/${id}/approve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm_high: high }),
    }), 'Confirmation and final agreement sent')
  }

  const card = 'bg-white rounded-2xl border border-neutral-200 p-lg'
  const h2 = 'text-sm font-bold text-neutral-900 mb-md'
  const lbl = 'block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-xs'

  if (error) return <Page><p className="text-red-600 text-sm">{error}</p></Page>
  if (!row) return <Page><p className="text-neutral-400 text-sm">Loading…</p></Page>

  const f = row.form_data ?? {}
  const review: Review | undefined = f.__review
  const decision: Decision | undefined = f.__decision
  const submitted = row.stage >= 3
  const docs = Object.entries((f.documents ?? {}) as Record<string, string[]>).filter(([type]) => type !== 'property_document')
  const otherNames = (f.other_doc_names ?? []) as string[]
  const propertyDocs = ((f.property_docs ?? []) as PropertyDoc[]).filter(d => !d.removed)
  const propertyNames: string[] = f.property_count === 'multiple'
    ? ((f.properties ?? []) as { line1?: string; town?: string; postcode?: string }[]).map((p, i) => [p.line1, p.postcode].filter(Boolean).join(', ') || `Property ${i + 1}`)
    : [[f.prop_line1, f.prop_postcode].filter(Boolean).join(', ') || 'Property']
  const docLabel = (type: string, i: number, n: number) =>
    type === 'other_document' && otherNames[i] ? otherNames[i] : `${DOC_LABELS[type] ?? type.replace(/_/g, ' ')}${n > 1 ? ` (${i + 1})` : ''}`
  const documentCards = (
    <>
      <div className={card}>
        <h2 className={h2}>Identity &amp; ownership documents ({docs.reduce((n, [, p]) => n + p.length, 0)})</h2>
        {!docs.length && <p className="text-sm text-neutral-500">Nothing uploaded yet.</p>}
        <div className="grid gap-md sm:grid-cols-2">
          {docs.flatMap(([type, paths]) => paths.map((p, i) => {
            const url = urls[p]
            const isPdf = p.endsWith('.pdf')
            return (
              <div key={p} className="rounded-xl border border-neutral-200 overflow-hidden">
                <div className="h-40 bg-neutral-50 flex items-center justify-center">
                  {url && !isPdf ? <img src={url} alt={docLabel(type, i, paths.length)} className="max-h-40 w-full object-contain" /> : <span className="text-3xl">{isPdf ? '📄' : '⏳'}</span>}
                </div>
                <div className="flex items-center justify-between gap-sm px-sm py-xs">
                  <p className="text-xs font-semibold text-neutral-800">{docLabel(type, i, paths.length)}</p>
                  {url && <a href={url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-blue-600 hover:underline shrink-0">Open →</a>}
                </div>
              </div>
            )
          }))}
        </div>
      </div>

      <div className={card}>
        <h2 className={h2}>Property documents ({propertyDocs.length})</h2>
        {!propertyDocs.length && <p className="text-sm text-neutral-500">None added yet. Landlords can add certificates, plans, tenancy agreements and bills in the optional “Property documents” step.</p>}
        <div className="space-y-lg">
          {propertyNames.map((name, pi) => {
            const list = propertyDocs.filter(d => d.property === pi)
            if (!list.length) return null
            return (
              <div key={pi}>
                <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">{name}</p>
                <div className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
                  {list.map(d => {
                    const facts = Object.entries(d.info ?? {}).filter(([k]) => FACT_LABELS[k])
                    return (
                      <div key={d.path} className="flex items-start justify-between gap-md px-md py-sm">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-neutral-900">{d.label || propertyDocLabel(d.type)}{d.type && d.label ? <span className="font-normal text-neutral-400"> · {propertyDocLabel(d.type)}</span> : null}</p>
                          {facts.length > 0 && <p className="text-xs text-neutral-600 break-words">{facts.map(([k, v]) => `${FACT_LABELS[k]}: ${/^\d{4}-\d{2}-\d{2}$/.test(v) ? fmt(v) : v}`).join(' · ')}</p>}
                          {!d.scanned && <p className="text-xs text-violet-700">Still being read</p>}
                        </div>
                        {urls[d.path] && <a href={urls[d.path]} target="_blank" rel="noreferrer" className="text-xs font-semibold text-blue-600 hover:underline shrink-0">Open →</a>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
  const areas = Array.from(new Set((review?.checks ?? []).map(c => c.area)))

  return (
    <Page>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-md mb-lg">
        <div>
          <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">AML review</p>
          <h1 className="text-2xl font-bold text-neutral-900">{row.full_name}</h1>
          <p className="text-sm text-neutral-500">{row.email}{f.j_contact_email ? ` · ${f.j_contact_email}` : ''} · {submitted ? `Submitted ${fmt(f.__submitted_at ?? row.docs_received_at)}` : 'Form not yet submitted'}</p>
        </div>
        <div className="flex flex-wrap gap-sm">
          {submitted && <button onClick={rerun} disabled={!!busy} className="rounded-xl border border-neutral-300 bg-white px-md py-sm text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40">{busy === 'rerun' ? 'Running checks…' : '↻ Re-run checks'}</button>}
          {submitted && <button onClick={() => downloadPdf(`/api/landlord-onboarding/${id}/aml-report`, 'CDD-Record.pdf')} className="rounded-xl bg-neutral-900 px-md py-sm text-sm font-semibold text-white hover:bg-neutral-700">⬇ AML report (PDF)</button>}
        </div>
      </div>

      {msg && <div className={`rounded-xl border px-md py-sm text-sm mb-lg ${msg.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>{msg.text}</div>}

      {!submitted && (
        <div className="space-y-lg">
          <div className={card}><p className="text-sm text-neutral-600">The landlord hasn’t submitted their form yet. Their progress saves automatically — the checks run once they submit. Documents they’ve uploaded so far are below.</p></div>
          {documentCards}
        </div>
      )}

      {submitted && (
        <div className="grid gap-lg lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-lg">
            {/* Summary */}
            <div className={card}>
              <div className="flex flex-wrap items-center gap-sm mb-md">
                <h2 className="text-sm font-bold text-neutral-900">Automated assessment</h2>
                {review && <span className={`rounded-full border px-sm py-xs text-xs font-bold uppercase ${RISK_STYLE[review.suggested_level]}`}>Suggested {review.suggested_level} risk</span>}
                {decision && <span className={`rounded-full border px-sm py-xs text-xs font-bold uppercase ${RISK_STYLE[decision.risk_level]}`}>Confirmed {decision.risk_level}</span>}
              </div>
              {!review && <p className="text-sm text-neutral-500">Checks haven’t run yet — press “Re-run checks”.</p>}
              {review && (review.reasons.length ? (
                <ul className="list-disc pl-5 space-y-1 text-sm text-neutral-700">{review.reasons.map(r => <li key={r}>{r}</li>)}</ul>
              ) : <p className="text-sm text-green-700">No higher-risk factors found.</p>)}
              {review && <p className="text-xs text-neutral-400 mt-md">Run {fmt(review.generated_at)}. Automated results are a first pass — open each document below before confirming.</p>}
            </div>

            {/* Checks */}
            {review && (
              <div className={card}>
                <h2 className={h2}>Checks</h2>
                <div className="space-y-lg">
                  {areas.map(area => (
                    <div key={area}>
                      <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-sm">{area}</p>
                      <div className="divide-y divide-neutral-100">
                        {review.checks.filter(c => c.area === area).map((c, i) => (
                          <div key={i} className="flex items-start gap-md py-sm">
                            <span className={`shrink-0 w-14 text-center rounded-md px-xs py-[2px] text-[11px] font-bold ${STATUS_STYLE[c.status][1]}`}>{STATUS_STYLE[c.status][0]}</span>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-neutral-900">{c.label}</p>
                              <p className="text-xs text-neutral-600 break-words">{c.detail}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {documentCards}

            {/* Answers */}
            <div className={card}>
              <h2 className={h2}>Submitted answers</h2>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-lg gap-y-sm text-sm">
                {([
                  ['Type', f.entity_type === 'company' ? 'Company' : f.joint === 'yes' ? 'Joint individuals' : 'Individual'],
                  ['Landlord', [f.salutation, f.first_name, f.last_name].filter(Boolean).join(' ')],
                  ['Date of birth', f.dob], ['Nationality', f.nationality],
                  ['Home address', [f.addr_line1, f.addr_line2, f.addr_town, f.addr_postcode].filter(Boolean).join(', ')],
                  ['Phone', f.contact_phone], ['Email', f.contact_email],
                  ...(f.joint === 'yes' ? [
                    ['Second landlord', [f.j_salutation, f.j_first_name, f.j_last_name].filter(Boolean).join(' ')],
                    ['Second DOB', f.j_dob], ['Second nationality', f.j_nationality],
                    ['Second address', f.j_same_address ? 'Same as first landlord' : [f.j_addr_line1, f.j_addr_town, f.j_addr_postcode].filter(Boolean).join(', ')],
                    ['Second email', f.j_contact_email],
                  ] : []),
                  ...(f.entity_type === 'company' ? [['Company', `${f.company_name} (${f.company_reg})`], ['Directors / owners', f.directors]] : []),
                  ['Property', f.property_count === 'multiple' ? (f.properties ?? []).map((p: any) => [p.line1, p.town, p.postcode].filter(Boolean).join(', ')).join(' | ') : [f.prop_line1, f.prop_line2, f.prop_town, f.prop_postcode].filter(Boolean).join(', ')],
                  ['Mortgage', [f.mortgage_provider, f.mortgage_account].filter(Boolean).join(' · ')],
                  ['PEP', f.pep === 'yes' ? `Yes — ${f.pep_details}` : f.pep], ...(f.joint === 'yes' ? [['Second PEP', f.j_pep === 'yes' ? `Yes — ${f.j_pep_details}` : f.j_pep]] : []),
                  ['Acting for another', f.acting_for_other === 'yes' ? `Yes — ${f.acting_for_details}` : f.acting_for_other],
                  ['Source of funds', `${(f.source_of_funds ?? '').replace(/_/g, ' ')} — ${f.source_of_funds_details ?? ''}`],
                  ['Country of residence', f.country_of_residence], ['UK tax resident', f.uk_resident === 'no' ? `No — NRL ${f.nrl_ref || 'not given'}` : 'Yes'],
                  ['Bank', [f.account_holder, f.bank_name, f.sort_code, f.account_number].filter(Boolean).join(' · ')],
                  ['Emergency contact', [f.emergency_name, f.emergency_relation, f.emergency_phone].filter(Boolean).join(' · ')],
                ] as [string, string][]).map(([k, v]) => (
                  <div key={k}><dt className="text-xs text-neutral-400">{k}</dt><dd className="text-neutral-900 break-words">{v || '—'}</dd></div>
                ))}
              </dl>
            </div>
          </div>

          {/* Right column: decision + agreement */}
          <div className="space-y-lg">
            <div className={card}>
              <h2 className={h2}>Your decision</h2>
              {decision && <p className="text-xs text-neutral-500 mb-md">Last recorded by {decision.reviewer_name} on {fmt(decision.reviewed_at)}.</p>}
              <label className={lbl}>Risk level</label>
              <div className="grid grid-cols-3 gap-xs mb-md">
                {(['low', 'medium', 'high'] as const).map(l => (
                  <button key={l} type="button" onClick={() => setDec(d => ({ ...d, risk_level: l }))}
                    className={`rounded-lg border px-sm py-xs text-sm font-semibold capitalize ${dec.risk_level === l ? RISK_STYLE[l] + ' ring-2 ring-offset-1 ring-neutral-900' : 'border-neutral-200 text-neutral-600'}`}>{l}</button>
                ))}
              </div>
              <label className={lbl}>Reasoning *</label>
              <textarea rows={3} value={dec.risk_reason} onChange={e => setDec(d => ({ ...d, risk_reason: e.target.value }))} className="w-full rounded-xl border border-neutral-200 px-sm py-xs text-sm mb-md" placeholder="e.g. UK-resident individuals, documents genuine and consistent, no sanctions or PEP flags" />
              {dec.risk_level && dec.risk_level !== 'low' && (<>
                <label className={lbl}>Mitigation / enhanced checks *</label>
                <textarea rows={3} value={dec.risk_mitigation} onChange={e => setDec(d => ({ ...d, risk_mitigation: e.target.value }))} className="w-full rounded-xl border border-neutral-200 px-sm py-xs text-sm mb-md" placeholder="e.g. Obtained mortgage completion statement; video call to confirm identity" />
              </>)}
              <label className="flex items-start gap-sm text-sm text-neutral-700 mb-sm">
                <input type="checkbox" checked={dec.identity_verified} onChange={e => setDec(d => ({ ...d, identity_verified: e.target.checked }))} className="mt-1" />
                Identity of every landlord / beneficial owner verified
              </label>
              <label className="flex items-start gap-sm text-sm text-neutral-700 mb-md">
                <input type="checkbox" checked={dec.documents_viewed} onChange={e => setDec(d => ({ ...d, documents_viewed: e.target.checked }))} className="mt-1" />
                I have opened and examined each uploaded document
              </label>
              <button onClick={saveDecision} disabled={!!busy} className="w-full rounded-xl bg-neutral-900 text-white py-sm text-sm font-semibold hover:bg-neutral-700 disabled:opacity-40">{busy === 'decision' ? 'Saving…' : 'Save decision'}</button>
            </div>

            <div className={card}>
              <h2 className={h2}>Management agreement</h2>
              {!hasSnapshot && <p className="text-sm text-neutral-600">This record was created without an agreement on file, so there is nothing to compare. Generate one from the Management Agreement page.</p>}
              {hasSnapshot && diffs && (diffs.length ? (
                <div className="space-y-sm mb-md">
                  <p className="text-sm text-neutral-700">These details differ from the agreement you sent. The final agreement will use the landlord’s confirmed details:</p>
                  {diffs.map(d => (
                    <div key={d.field} className="rounded-lg border border-amber-200 bg-amber-50 px-sm py-xs text-xs">
                      <p className="font-semibold text-amber-900">{d.field}</p>
                      <p className="text-neutral-600">Agreement: {d.inAgreement}</p>
                      <p className="text-neutral-900">Landlord: {d.fromLandlord}</p>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-green-700 mb-md">The landlord’s details match the agreement you sent.</p>)}
              {hasSnapshot && (
                <div className="space-y-sm">
                  <button onClick={() => downloadPdf(`/api/landlord-onboarding/${id}/agreement?pdf=1`, 'Management-Agreement-preview.pdf')} className="w-full rounded-xl border border-neutral-300 py-sm text-sm font-semibold text-neutral-700 hover:bg-neutral-50">Preview final agreement</button>
                  <button onClick={approve} disabled={!!busy || !decision} className="w-full rounded-xl bg-green-700 text-white py-sm text-sm font-semibold hover:bg-green-800 disabled:opacity-40 disabled:cursor-not-allowed">
                    {busy === 'approve' ? 'Sending…' : row.approval_sent_at ? 'Re-send confirmation & agreement' : 'Approve & send to landlord'}
                  </button>
                  {!decision && <p className="text-xs text-neutral-400">Save your decision first.</p>}
                  {row.approval_sent_at && <p className="text-xs text-green-700">Sent {fmt(row.approval_sent_at)}. Next: send for digital signature, then mark the agreement sent on the pipeline.</p>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Page>
  )
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-100">
      <AppBar left={<BackButton href="/admin/new-business/onboarding" />} title="AML review" />
      <div className="mx-auto max-w-6xl px-lg py-xl">{children}</div>
    </div>
  )
}
