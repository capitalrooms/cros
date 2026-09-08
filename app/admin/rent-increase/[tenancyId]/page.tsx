'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'

// ── Types ──────────────────────────────────────────────────────────────────────

interface TenancyInfo {
  id: string
  start_date: string
  rent_amount: number
  rent_due_day: number | null
  person: { full_name: string; first_name: string; last_name: string; email: string } | null
  room:   { name: string } | null
  property: { name: string; address: string } | null
}

type Step = 'form' | 'preview' | 'sent'

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

function fmtMoney(n: number) {
  return `£${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function RentIncreasePage() {
  const router   = useRouter()
  const params   = useParams()
  const tenancyId = params.tenancyId as string

  const [loading, setLoading]   = useState(true)
  const [tenancy, setTenancy]   = useState<TenancyInfo | null>(null)
  const [step, setStep]         = useState<Step>('form')

  // Form fields
  const [proposedRent, setProposedRent]   = useState('')
  const [effectiveDate, setEffectiveDate] = useState('')
  const [tenantTitle, setTenantTitle]     = useState('Ms')

  // Validation / preview
  const [earliestDate, setEarliestDate]   = useState<string | null>(null)
  const [fixedTermError, setFixedTermError] = useState<string | null>(null)
  const [fixedTermEndDate, setFixedTermEndDate] = useState<string | null>(null)
  const [validationErrors, setValidErrors] = useState<string[]>([])
  const [previewing, setPreviewing]       = useState(false)
  const [coverB64, setCoverB64]           = useState<string | null>(null)
  const [form4aB64, setForm4aB64]         = useState<string | null>(null)
  const [previewError, setPreviewError]   = useState<string | null>(null)

  // Sending
  const [sending, setSending]             = useState(false)
  const [sentNoticeId, setSentNoticeId]   = useState<string | null>(null)
  const [sendError, setSendError]         = useState<string | null>(null)
  const [sendWarning, setSendWarning]     = useState<string | null>(null)

  // ── Load tenancy data ────────────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      const user = await getCurrentUser()
      if (!user || !['administrator', 'admin', 'lettings'].includes(user.assignment?.role)) {
        router.push('/login'); return
      }

      const sb = createClient()
      const { data } = await sb
        .from('tenancies')
        .select(`
          id, start_date, rent_amount, rent_due_day,
          person:people!tenancies_person_id_fkey(full_name, first_name, last_name, email),
          room:rooms!tenancies_room_id_fkey(name),
          property:properties!tenancies_property_id_fkey(name, address)
        `)
        .eq('id', tenancyId)
        .maybeSingle()

      if (!data) { router.push('/admin/tenancy-management'); return }
      setTenancy(data as unknown as TenancyInfo)

      // Pre-fetch earliest valid date for display
      const today = new Date().toISOString().slice(0, 10)
      const previewRes = await fetch('/api/rent-increase/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenancyId,
          proposedRent: (data as any).rent_amount || 0,
          // Pass an obviously invalid date just to get earliestValidDate back
          effectiveDate: today,
        }),
      })
      const j = await previewRes.json()
      if (j.error === 'fixed_term_block') {
        setFixedTermError(j.fixedTermError)
        setFixedTermEndDate(j.fixedTermEndDate)
      } else {
        if (j.earliestValidDate) setEarliestDate(j.earliestValidDate)
        if (j.validation?.earliestValidDate) setEarliestDate(j.validation.earliestValidDate)
        setEffectiveDate(j.earliestValidDate || j.validation?.earliestValidDate || '')
      }

      setLoading(false)
    }
    init()
  }, [tenancyId, router])

  // ── Preview ──────────────────────────────────────────────────────────────

  const handlePreview = useCallback(async () => {
    if (!proposedRent || !effectiveDate) return
    setPreviewing(true)
    setPreviewError(null)
    setValidErrors([])
    setCoverB64(null)
    setForm4aB64(null)

    const res = await fetch('/api/rent-increase/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenancyId, proposedRent: Number(proposedRent), effectiveDate, tenantTitle }),
    })
    const j = await res.json()

    if (!res.ok) {
      if (j.error === 'fixed_term_block') {
        setFixedTermError(j.fixedTermError)
        setFixedTermEndDate(j.fixedTermEndDate)
      } else if (j.validationErrors?.length) {
        setValidErrors(j.validationErrors)
        if (j.earliestValidDate) setEarliestDate(j.earliestValidDate)
      } else {
        setPreviewError(j.error || 'Preview generation failed')
      }
      setPreviewing(false)
      return
    }

    setCoverB64(j.coverLetter)
    setForm4aB64(j.form4A)
    setStep('preview')
    setPreviewing(false)
  }, [tenancyId, proposedRent, effectiveDate, tenantTitle])

  // ── Send ─────────────────────────────────────────────────────────────────

  async function handleSend() {
    if (!confirm(
      `You are about to send a legally binding Section 13 rent increase notice to ${tenancy?.person?.email}.\n\n` +
      `This cannot be unsent. Are you sure?`
    )) return

    setSending(true)
    setSendError(null)
    setSendWarning(null)

    const res = await fetch('/api/rent-increase/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenancyId, proposedRent: Number(proposedRent), effectiveDate, tenantTitle }),
    })
    const j = await res.json()

    if (!res.ok) {
      setSendError(j.error || 'Send failed')
      setSending(false)
      return
    }

    setSentNoticeId(j.noticeId)
    if (j.warning) setSendWarning(j.warning)
    setStep('sent')
    setSending(false)
  }

  // ── Loading ──────────────────────────────────────────────────────────────

  if (loading || !tenancy) return (
    <div className="min-h-screen bg-neutral-50">
      <AppBar left={<BackButton href="/admin/tenancy-management" />} />
      <p className="p-xl text-sm text-neutral-400">Loading…</p>
    </div>
  )

  const person = tenancy.person
  const currentRent = Number(tenancy.rent_amount || 0)
  const increase = proposedRent ? Number(proposedRent) - currentRent : 0
  const pctIncrease = currentRent > 0 && proposedRent
    ? (((Number(proposedRent) - currentRent) / currentRent) * 100).toFixed(1)
    : null

  // ── STEP: Form ───────────────────────────────────────────────────────────

  if (step === 'form') return (
    <div className="min-h-screen bg-neutral-50 pb-3xl">
      <AppBar left={<BackButton href={`/admin/tenant/${tenancy.person ? (tenancy as any).person_id || '' : ''}`} />} />
      <main className="mx-auto max-w-lg px-lg py-lg">
        <div className="mb-xl">
          <p className="text-xs font-bold uppercase tracking-wide text-neutral-400 mb-xs">Section 13 — Rent Increase Notice</p>
          <h1 className="text-2xl font-bold text-neutral-900">{person?.full_name}</h1>
          <p className="text-sm text-neutral-500 mt-xs">
            {tenancy.room?.name} · {tenancy.property?.address}
          </p>
        </div>

        {/* Current tenancy summary */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-lg mb-xl">
          <p className="text-xs font-bold uppercase tracking-wide text-neutral-400 mb-md">Current tenancy</p>
          <div className="grid grid-cols-2 gap-md">
            <div>
              <p className="text-xs text-neutral-400 mb-xs">Current rent</p>
              <p className="font-bold text-neutral-900 text-lg">{fmtMoney(currentRent)}/mo</p>
            </div>
            <div>
              <p className="text-xs text-neutral-400 mb-xs">Tenancy start</p>
              <p className="font-semibold text-neutral-900 text-sm">{fmtDate(tenancy.start_date)}</p>
            </div>
          </div>
          {earliestDate && (
            <div className="mt-md pt-md border-t border-neutral-100">
              <p className="text-xs text-neutral-400 mb-xs">Earliest legal effective date</p>
              <p className="text-sm font-semibold text-blue-700">{fmtDate(earliestDate)}</p>
              <p className="text-xs text-neutral-400 mt-xs">
                Based on 2-month notice + 52-week minimum gap rule (Housing Act 1988, s.13)
              </p>
            </div>
          )}
        </div>

        {/* Fixed-term block */}
        {fixedTermError && (
          <div className="bg-red-50 border border-red-300 rounded-xl p-lg mb-xl">
            <p className="text-sm font-bold text-red-900 mb-xs">⛔ Section 13 notice cannot be served</p>
            <p className="text-sm text-red-800">{fixedTermError}</p>
            {fixedTermEndDate && (
              <p className="text-xs text-red-600 mt-sm font-semibold">
                Fixed term ends: {fmtDate(fixedTermEndDate)}. Return to this screen after that date to serve notice.
              </p>
            )}
          </div>
        )}

        {/* Legal notice */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-md mb-xl">
          <p className="text-xs font-semibold text-amber-900 mb-xs">⚖️ Legal requirements</p>
          <ul className="text-xs text-amber-800 space-y-xs list-disc list-inside">
            <li>Minimum <strong>2 months' notice</strong> before effective date (post-Renters' Rights Act, May 2026)</li>
            <li>At least <strong>52 weeks</strong> since tenancy start or last Section 13 notice</li>
            <li>Effective date must be the <strong>{new Date(tenancy.start_date + 'T12:00:00').getDate()}{['st','nd','rd'][new Date(tenancy.start_date + 'T12:00:00').getDate()-1]||'th'} of the month</strong> (start of rental period)</li>
            <li>Proposed rent must not exceed <strong>local market rate</strong></li>
          </ul>
        </div>

        {/* Form fields */}
        <div className="space-y-lg">
          {/* Tenant title */}
          <div>
            <label className="block text-sm font-semibold text-neutral-700 mb-xs">
              Tenant title <span className="text-neutral-400 font-normal">(for formal documents)</span>
            </label>
            <select
              value={tenantTitle}
              onChange={e => setTenantTitle(e.target.value)}
              className="w-full rounded-xl border border-neutral-200 bg-white px-md py-sm text-sm text-neutral-900"
            >
              <option value="Mr">Mr</option>
              <option value="Ms">Ms</option>
              <option value="Mrs">Mrs</option>
              <option value="Miss">Miss</option>
              <option value="Mx">Mx</option>
              <option value="Dr">Dr</option>
            </select>
          </div>

          {/* Proposed rent */}
          <div>
            <label className="block text-sm font-semibold text-neutral-700 mb-xs">
              Proposed new rent (£/month) *
            </label>
            <div className="relative">
              <span className="absolute left-md top-1/2 -translate-y-1/2 text-neutral-400 font-semibold">£</span>
              <input
                type="number"
                min={currentRent + 1}
                step="1"
                value={proposedRent}
                onChange={e => setProposedRent(e.target.value)}
                placeholder={String(Math.ceil(currentRent * 1.05))}
                className="w-full rounded-xl border border-neutral-200 bg-white pl-2xl pr-md py-sm text-sm text-neutral-900"
              />
            </div>
            {proposedRent && Number(proposedRent) > currentRent && (
              <p className="text-xs text-neutral-500 mt-xs">
                Increase: {fmtMoney(increase)}/mo (+{pctIncrease}%)
                {' · '}New rent: {fmtMoney(Number(proposedRent))}/mo
              </p>
            )}
            {proposedRent && Number(proposedRent) <= currentRent && (
              <p className="text-xs text-red-600 mt-xs">Proposed rent must be higher than the current rent.</p>
            )}
          </div>

          {/* Effective date */}
          <div>
            <label className="block text-sm font-semibold text-neutral-700 mb-xs">
              Proposed effective date *
            </label>
            <input
              type="date"
              value={effectiveDate}
              min={earliestDate || undefined}
              onChange={e => { setEffectiveDate(e.target.value); setValidErrors([]) }}
              className="w-full rounded-xl border border-neutral-200 bg-white px-md py-sm text-sm text-neutral-900"
            />
            {earliestDate && (
              <p className="text-xs text-neutral-400 mt-xs">
                Earliest legal date: {fmtDate(earliestDate)}
              </p>
            )}
          </div>
        </div>

        {/* Validation errors */}
        {validationErrors.length > 0 && (
          <div className="mt-lg rounded-xl bg-red-50 border border-red-200 p-md">
            <p className="text-sm font-semibold text-red-800 mb-sm">The proposed date is not legally valid:</p>
            <ul className="space-y-xs">
              {validationErrors.map((e, i) => (
                <li key={i} className="text-sm text-red-700">• {e}</li>
              ))}
            </ul>
            {earliestDate && (
              <button
                onClick={() => { setEffectiveDate(earliestDate); setValidErrors([]) }}
                className="mt-sm text-xs text-blue-700 hover:underline font-semibold"
              >
                Use earliest valid date ({fmtDate(earliestDate)}) →
              </button>
            )}
          </div>
        )}

        {previewError && (
          <div className="mt-lg rounded-xl bg-red-50 border border-red-200 p-md">
            <p className="text-sm text-red-700">{previewError}</p>
          </div>
        )}

        <button
          onClick={handlePreview}
          disabled={
            previewing ||
            !!fixedTermError ||
            !proposedRent ||
            Number(proposedRent) <= currentRent ||
            !effectiveDate
          }
          className="mt-xl w-full rounded-xl bg-neutral-900 px-lg py-md text-sm font-bold text-white hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {previewing ? 'Generating documents…' : 'Preview both documents →'}
        </button>

        <p className="text-xs text-neutral-400 text-center mt-md">
          You will see both the cover letter and Form 4A before anything is sent.
        </p>
      </main>
    </div>
  )

  // ── STEP: Preview ────────────────────────────────────────────────────────

  if (step === 'preview') return (
    <div className="min-h-screen bg-neutral-50 pb-3xl">
      <AppBar left={<BackButton onClick={() => setStep('form')} />} />
      <main className="mx-auto max-w-3xl px-lg py-lg">
        <div className="mb-xl">
          <p className="text-xs font-bold uppercase tracking-wide text-neutral-400 mb-xs">Preview — review before sending</p>
          <h1 className="text-2xl font-bold text-neutral-900">Section 13 Notice — {person?.full_name}</h1>
          <p className="text-sm text-neutral-500 mt-xs">
            {fmtMoney(currentRent)}/mo → {fmtMoney(Number(proposedRent))}/mo · Effective {fmtDate(effectiveDate)}
          </p>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-md mb-xl">
          <p className="text-xs font-semibold text-amber-900">⚠️ Review carefully before sending</p>
          <p className="text-xs text-amber-800 mt-xs">
            Once sent, this is a legally binding notice under s.13 of the Housing Act 1988.
            Check all dates, figures, names, and addresses are correct in both documents.
          </p>
        </div>

        {/* Document 1 — Cover letter */}
        <div className="mb-xl">
          <h2 className="text-base font-bold text-neutral-900 mb-sm">Document 1 — Cover Letter</h2>
          {coverB64 && (
            <div className="rounded-2xl border border-neutral-200 overflow-hidden bg-white">
              <iframe
                src={`data:application/pdf;base64,${coverB64}`}
                className="w-full"
                style={{ height: '600px' }}
                title="Cover letter preview"
              />
            </div>
          )}
          <a
            href={`data:application/pdf;base64,${coverB64}`}
            download={`Cover-Letter-${person?.full_name?.replace(/\s+/g,'-')}-${effectiveDate}.pdf`}
            className="mt-sm inline-block text-xs text-blue-700 hover:underline"
          >
            ↓ Download cover letter PDF
          </a>
        </div>

        {/* Document 2 — Form 4A */}
        <div className="mb-xl">
          <h2 className="text-base font-bold text-neutral-900 mb-sm">Document 2 — Form 4A (statutory notice)</h2>
          {form4aB64 && (
            <div className="rounded-2xl border border-neutral-200 overflow-hidden bg-white">
              <iframe
                src={`data:application/pdf;base64,${form4aB64}`}
                className="w-full"
                style={{ height: '700px' }}
                title="Form 4A preview"
              />
            </div>
          )}
          <a
            href={`data:application/pdf;base64,${form4aB64}`}
            download={`Form-4A-Section-13-${person?.full_name?.replace(/\s+/g,'-')}-${effectiveDate}.pdf`}
            className="mt-sm inline-block text-xs text-blue-700 hover:underline"
          >
            ↓ Download Form 4A PDF
          </a>
        </div>

        {/* Send actions */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-lg">
          <h3 className="font-bold text-neutral-900 mb-xs">Ready to send?</h3>
          <p className="text-sm text-neutral-500 mb-lg">
            Both documents will be emailed to <strong>{person?.email}</strong> as PDF attachments.
            The notice will be recorded in CROS. Rent will <strong>not</strong> be updated until you
            confirm it has taken effect on {fmtDate(effectiveDate)}.
          </p>

          {sendError && (
            <div className="mb-md rounded-xl bg-red-50 border border-red-200 p-md">
              <p className="text-sm text-red-700">{sendError}</p>
            </div>
          )}

          <div className="flex gap-md">
            <button
              onClick={() => setStep('form')}
              className="flex-1 rounded-xl border border-neutral-200 px-lg py-md text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
            >
              ← Go back and edit
            </button>
            <button
              onClick={handleSend}
              disabled={sending}
              className="flex-1 rounded-xl bg-blue-700 px-lg py-md text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {sending ? 'Sending…' : '📨 Send Section 13 notice'}
            </button>
          </div>
        </div>
      </main>
    </div>
  )

  // ── STEP: Sent ───────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-neutral-50">
      <AppBar left={<BackButton href="/admin/tenancy-management" />} />
      <main className="mx-auto max-w-lg px-lg py-3xl text-center">
        <div className="text-5xl mb-lg">📨</div>
        <h1 className="text-2xl font-bold text-neutral-900 mb-sm">Section 13 notice sent</h1>
        <p className="text-sm text-neutral-600 mb-sm">
          Both documents have been emailed to <strong>{person?.email}</strong>.
        </p>
        <p className="text-sm text-neutral-500 mb-xl">
          The notice has been recorded in CROS (ID: <code className="text-xs bg-neutral-100 px-xs py-[2px] rounded">{sentNoticeId}</code>).
          Rent will remain at {fmtMoney(currentRent)}/mo until you confirm the increase has taken effect on {fmtDate(effectiveDate)}.
        </p>

        {sendWarning && (
          <div className="mb-xl rounded-xl bg-amber-50 border border-amber-200 p-md text-left">
            <p className="text-sm text-amber-800">⚠️ {sendWarning}</p>
          </div>
        )}

        <div className="space-y-sm">
          <a
            href={`data:application/pdf;base64,${coverB64}`}
            download={`Cover-Letter-${person?.full_name?.replace(/\s+/g,'-')}-${effectiveDate}.pdf`}
            className="block rounded-xl border border-neutral-200 px-lg py-md text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
          >
            ↓ Download cover letter PDF
          </a>
          <a
            href={`data:application/pdf;base64,${form4aB64}`}
            download={`Form-4A-Section-13-${person?.full_name?.replace(/\s+/g,'-')}-${effectiveDate}.pdf`}
            className="block rounded-xl border border-neutral-200 px-lg py-md text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
          >
            ↓ Download Form 4A PDF
          </a>
          <button
            onClick={() => router.back()}
            className="w-full rounded-xl bg-neutral-900 px-lg py-md text-sm font-bold text-white hover:bg-neutral-800"
          >
            Back to tenant profile
          </button>
        </div>
      </main>
    </div>
  )
}
