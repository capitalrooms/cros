'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import AppBar from '@/components/AppBar'
import PageHero from '@/components/PageHero'
import BackButton from '@/app/components/BackButton'
import { fiveWeeksDeposit, oneWeekRent } from '@/lib/tenancy/deposit'

interface ApplicantData {
  id: string
  full_name: string
  email: string
  phone: string | null
  preferred_start_date: string | null
  preferred_term: string | null
  offered_rent: number | null
  advertised_rent: number | null
  pipeline_stage: string
  converted_person_id: string | null
  room_id: string | null
  property_id: string | null
  rooms: { id: string; name: string; unit_code: string | null; current_asking_rent: number | null } | null
  properties: { id: string; name: string; address: string } | null
}

export default function CreateTenancyPage() {
  const router = useRouter()
  const params = useParams()
  const applicantId = params.id as string
  const supabase = createClient()

  const [applicant, setApplicant] = useState<ApplicantData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Form state ──────────────────────────────────────────────────────────────
  const [startDate, setStartDate]           = useState('')
  const [endDate, setEndDate]               = useState('')
  const [termMonths, setTermMonths]         = useState('')
  const [rent, setRent]                     = useState('')
  const [rentDueDay, setRentDueDay]         = useState('1')
  const [rentFrequency, setRentFrequency]   = useState<'monthly'|'weekly'|'fortnightly'>('monthly')
  const [rentInAdvance, setRentInAdvance]   = useState('1')
  const [deposit, setDeposit]               = useState('')
  const [depositHeldBy, setDepositHeldBy]   = useState<'agent'|'landlord'>('agent')
  const [depositRef, setDepositRef]         = useState('')
  const [holdingDeposit, setHoldingDeposit] = useState('')
  const [agreementType, setAgreementType]   = useState('assured_periodic')
  const [lettingFeeCharged, setLettingFeeCharged] = useState(true)
  // Fee config loaded from property (letting_fee_pct or letting_fee_flat)
  const [propertyFeePct, setPropertyFeePct]   = useState<number | null>(null)
  const [propertyFeeFlat, setPropertyFeeFlat] = useState<number | null>(null)
  // Admin can override the suggested fee amount
  const [lettingFeeOverride, setLettingFeeOverride] = useState('')
  const [leaseRef, setLeaseRef]             = useState('')
  const [officeNotes, setOfficeNotes]       = useState('')

  // ── Load applicant ──────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const user = await getCurrentUser()
      if (!user) { router.push('/login'); return }

      const { data, error: err } = await (supabase as any)
        .from('applicants')
        .select('*, rooms(id, name, unit_code, current_asking_rent), properties(id, name, address, letting_fee_pct, letting_fee_flat)')
        .eq('id', applicantId)
        .single()

      if (err || !data) { setError('Applicant not found'); setLoading(false); return }

      setApplicant(data as ApplicantData)

      // Load property letting fee config
      const propAny = data.properties as any
      if (propAny?.letting_fee_pct != null) setPropertyFeePct(Number(propAny.letting_fee_pct))
      if (propAny?.letting_fee_flat != null) setPropertyFeeFlat(Number(propAny.letting_fee_flat))

      // Pre-fill form from application
      // the AGREED rent: a lower offer we accepted, else the rent on the offer sent to them — never the advert
      const { data: offerRow } = await supabase.from('offers').select('advertised_rent')
        .or(`applicant_id.eq.${applicantId}${(data as any).offer_id ? `,id.eq.${(data as any).offer_id}` : ''}`)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      const agreedRent = ((data as any).rent_offer_type === 'below_asking' && data.offered_rent) ? data.offered_rent : ((offerRow as any)?.advertised_rent || data.offered_rent || '')
      setRent(agreedRent ? String(agreedRent) : '')
      if (data.preferred_start_date) setStartDate(data.preferred_start_date)

      // Pre-fill holding deposit (floor of 1 week's rent)
      if (agreedRent) {
        setHoldingDeposit(oneWeekRent(Number(agreedRent)).toFixed(2))
        // Default deposit to 5 weeks
        setDeposit(fiveWeeksDeposit(Number(agreedRent)).toFixed(2))
      }

      // Parse preferred term into months
      if (data.preferred_term) {
        const match = data.preferred_term.match(/(\d+)\s*month/i)
        if (match) setTermMonths(match[1])
      }

      setLoading(false)
    }
    load()
  }, [applicantId])

  // Auto-fill end date from term months
  useEffect(() => {
    if (termMonths && startDate) {
      const d = new Date(startDate)
      d.setMonth(d.getMonth() + Number(termMonths))
      d.setDate(d.getDate() - 1)
      setEndDate(d.toISOString().split('T')[0])
    }
  }, [termMonths, startDate])

  // ── Save ────────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!rent || !startDate) { setError('Start date and rent are required'); return }
    setSaving(true); setError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`

      const body = {
        room_id:      applicant?.room_id,
        property_id:  applicant?.property_id,
        start_date:   startDate,
        end_date:     endDate || undefined,
        rent_amount:  Number(rent),
        rent_due_day: Number(rentDueDay),
        rent_frequency: rentFrequency,
        rent_in_advance: Number(rentInAdvance),
        deposit_amount: deposit ? Number(deposit) : undefined,
        deposit_held_by: depositHeldBy,
        deposit_scheme_ref: depositRef || undefined,
        holding_deposit_received: holdingDeposit ? Number(holdingDeposit) : undefined,
        agreement_type: agreementType,
        tenancy_type: agreementType === 'assured_periodic' ? 'standard' : 'short_term',
        is_periodic: true,
        letting_fee_charged: lettingFeeCharged ? null : 0,   // amount: blank = property's usual fee, 0 = no fee
        lease_reference: leaseRef || undefined,
        office_notes: officeNotes || undefined,
        notice_period_months: 2,
      }

      const res = await fetch(`/api/applicants/${applicantId}/convert`, {
        method: 'POST', headers, body: JSON.stringify(body),
      })
      const data = await res.json()

      if (!res.ok && res.status !== 409) throw new Error(data.error || 'Conversion failed')

      // open the new tenancy's letting file (or the tenant, if no tenancy could be made)
      if (data.tenancyId) router.push(`/admin/lettings/${data.tenancyId}?from=/admin/applicants`)
      else if (data.personId) router.push(`/admin/tenant/${data.personId}`)
      else router.push('/admin/applicants')

    } catch (e: any) {
      setError(e.message || 'Something went wrong')
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar left={<BackButton href="/admin/applicants" />} />
        <div className="flex items-center justify-center pt-3xl">
          <p className="text-sm text-neutral-400">Loading…</p>
        </div>
      </div>
    )
  }

  if (!applicant) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar left={<BackButton href="/admin/applicants" />} />
        <div className="flex items-center justify-center pt-3xl">
          <p className="text-sm text-red-600">{error || 'Applicant not found'}</p>
        </div>
      </div>
    )
  }

  if (applicant.pipeline_stage === 'converted' && applicant.converted_person_id) {
    router.replace(`/admin/tenant/${applicant.converted_person_id}`)
    return null
  }

  const agreedRent = rent ? Number(rent) : 0
  const annual = agreedRent * 12
  const fiveWeeks = fiveWeeksDeposit(agreedRent)
  const oneWeek = oneWeekRent(agreedRent)
  const depositBalance = deposit
    ? Math.max(0, Number(deposit) - (holdingDeposit ? Number(holdingDeposit) : 0))
    : 0
  const rentDue = agreedRent * Number(rentInAdvance)

  // Suggested letting fee — from property config, fallback to 75% (¾ month)
  const suggestedFee = lettingFeeOverride
    ? Number(lettingFeeOverride)
    : propertyFeeFlat != null
      ? propertyFeeFlat
      : propertyFeePct != null
        ? Math.round(agreedRent * propertyFeePct / 100)
        : agreedRent > 0 ? Math.round(agreedRent * 0.75) : 0

  const feeLabel = propertyFeeFlat != null
    ? `£${propertyFeeFlat} flat (property default)`
    : propertyFeePct != null
      ? `${propertyFeePct}% of first month — property default`
      : "¾ of first month's rent — Capital Rooms standard"

  const totalDue = rentDue + depositBalance

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin/applicants" />} />
      <PageHero eyebrow="Lettings · Applicants" title="Set up tenancy" />

      <main className="mx-auto max-w-6xl px-lg py-xl">

        {/* Page title */}
        <div className="mb-xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-xs">Lettings → Applicants → Set up tenancy</p>
        </div>

        {/* Applicant summary card */}
        <div className="rounded-xl border border-neutral-200 bg-white p-lg mb-xl">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-md">Applicant</p>
          <div className="flex items-start justify-between gap-lg">
            <div className="flex-1">
              <p className="text-lg font-bold text-neutral-900">{applicant.full_name}</p>
              <p className="text-sm text-neutral-500">{applicant.email}{applicant.phone ? ` · ${applicant.phone}` : ''}</p>
            </div>
            <div className="text-right">
              {applicant.properties && (
                <p className="text-sm font-semibold text-neutral-900">{applicant.properties.address || applicant.properties.name}</p>
              )}
              {applicant.rooms && (
                <p className="text-xs text-neutral-500">{applicant.rooms.unit_code || applicant.rooms.name}</p>
              )}
            </div>
          </div>

          {/* Key application facts */}
          <div className="grid grid-cols-3 gap-md mt-lg pt-md border-t border-neutral-100 text-xs">
            <div>
              <p className="text-neutral-400 uppercase tracking-wide font-semibold mb-xs">Offered rent</p>
              <p className="font-semibold text-neutral-900">
                {applicant.offered_rent
                  ? `£${Number(applicant.offered_rent).toLocaleString()}/mo`
                  : applicant.rooms?.current_asking_rent
                    ? `£${applicant.rooms.current_asking_rent.toLocaleString()}/mo (asking)`
                    : '—'}
              </p>
            </div>
            <div>
              <p className="text-neutral-400 uppercase tracking-wide font-semibold mb-xs">Preferred move-in</p>
              <p className="font-semibold text-neutral-900">
                {applicant.preferred_start_date
                  ? new Date(applicant.preferred_start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-neutral-400 uppercase tracking-wide font-semibold mb-xs">Preferred term</p>
              <p className="font-semibold text-neutral-900">{applicant.preferred_term || '—'}</p>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="rounded-xl border border-neutral-200 bg-white divide-y divide-neutral-100">

          {/* Agreement type */}
          <div className="p-lg">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-sm">Agreement type</p>
            <div className="grid grid-cols-2 gap-sm">
              {([
                ['assured_periodic', 'Assured Periodic Tenancy'],
                ['fixed_term',       'Fixed-term (initial period)'],
                ['company_let',      'Company Let'],
                ['licence',          'Licence Agreement'],
              ] as const).map(([val, label]) => (
                <button key={val} type="button"
                  onClick={() => setAgreementType(val)}
                  className={`rounded-lg border px-md py-sm text-sm font-medium text-left transition ${agreementType === val ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Letting fee */}
          <div className="p-lg">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-sm">Letting fee (charged to landlord)</p>
            <div className="rounded-lg bg-neutral-50 border border-neutral-200 px-md py-sm mb-sm">
              <div className="flex items-center justify-between mb-sm">
                <div>
                  <p className="text-sm font-semibold text-neutral-900">
                    {agreedRent ? `£${suggestedFee.toLocaleString()}` : 'Enter rent first'}
                  </p>
                  <p className="text-[10px] text-neutral-400 mt-xs">{feeLabel}</p>
                </div>
                <label className="flex items-center gap-sm cursor-pointer">
                  <input type="checkbox" checked={lettingFeeCharged}
                    onChange={e => setLettingFeeCharged(e.target.checked)}
                    className="rounded border-neutral-300 w-4 h-4" />
                  <span className="text-xs font-medium text-neutral-700">Charged</span>
                </label>
              </div>
              {lettingFeeCharged && (
                <div>
                  <label className="block text-[10px] uppercase tracking-wider font-semibold text-neutral-400 mb-xs">
                    Override fee amount (leave blank to use suggestion)
                  </label>
                  <div className="relative">
                    <span className="absolute left-sm top-1/2 -translate-y-1/2 text-neutral-400 text-sm">£</span>
                    <input type="number" value={lettingFeeOverride}
                      onChange={e => setLettingFeeOverride(e.target.value)}
                      placeholder={agreedRent ? String(suggestedFee) : '0'}
                      className="w-full pl-6 pr-sm py-xs border border-neutral-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900" />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Dates */}
          <div className="p-lg">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-sm">Dates</p>
            <div className="grid grid-cols-3 gap-md mb-sm">
              <div>
                <label className="block text-xs text-neutral-500 mb-xs">Start date *</label>
                <input type="date" value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900" />
              </div>
              <div>
                <label className="block text-xs text-neutral-500 mb-xs">Term (months)</label>
                <input type="number" min="1" max="60" value={termMonths}
                  onChange={e => setTermMonths(e.target.value)}
                  placeholder="e.g. 12"
                  className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900" />
              </div>
              <div>
                <label className="block text-xs text-neutral-500 mb-xs">End date (blank = rolling)</label>
                <input type="date" value={endDate}
                  onChange={e => { setEndDate(e.target.value); setTermMonths('') }}
                  className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900" />
              </div>
            </div>
          </div>

          {/* Rent */}
          <div className="p-lg">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-sm">Rent</p>
            <div className="grid grid-cols-3 gap-md mb-sm">
              <div>
                <label className="block text-xs text-neutral-500 mb-xs">Amount (£/mo) *</label>
                <div className="relative">
                  <span className="absolute left-sm top-1/2 -translate-y-1/2 text-neutral-400 text-sm">£</span>
                  <input type="number" value={rent} onChange={e => setRent(e.target.value)} placeholder="925"
                    className="w-full pl-6 pr-sm py-sm border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900" />
                </div>
                {applicant.offered_rent && applicant.rooms?.current_asking_rent &&
                  applicant.offered_rent !== applicant.rooms.current_asking_rent && (
                  <p className="text-[10px] text-amber-600 mt-xs">
                    Asking: £{applicant.rooms.current_asking_rent.toLocaleString()} · Offered: £{Number(applicant.offered_rent).toLocaleString()}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs text-neutral-500 mb-xs">Due day</label>
                <select value={rentDueDay} onChange={e => setRentDueDay(e.target.value)}
                  className="w-full px-sm py-sm border border-neutral-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900">
                  {Array.from({length: 28}, (_, i) => i + 1).map(d => (
                    <option key={d} value={d}>{d}{d===1?'st':d===2?'nd':d===3?'rd':'th'}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-neutral-500 mb-xs">Rent in advance</label>
                <select value={rentInAdvance} onChange={e => setRentInAdvance(e.target.value)}
                  className="w-full px-sm py-sm border border-neutral-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900">
                  {[1,2,3,6].map(n => (
                    <option key={n} value={n}>{n} month{n>1?'s':''}{n===1?' (standard)':''}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Deposit */}
          <div className="p-lg">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-sm">Deposit</p>

            {/* Calculator */}
            {agreedRent > 0 && (
              <div className="rounded-lg bg-neutral-50 border border-neutral-200 px-md py-sm mb-md">
                <div className="grid grid-cols-3 gap-md text-center">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-neutral-400 mb-xs">5 weeks' rent</p>
                    <p className="text-base font-semibold text-neutral-900">£{fiveWeeks.toLocaleString()}</p>
                    <p className="text-[10px] text-neutral-400">Legal max (TFA 2019)</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-neutral-400 mb-xs">1 month</p>
                    <p className="text-base font-semibold text-neutral-900">£{agreedRent.toLocaleString()}</p>
                    <p className="text-[10px] text-neutral-400">Equivalent</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-neutral-400 mb-xs">Max holding deposit</p>
                    <p className="text-base font-semibold text-amber-700">£{oneWeek.toLocaleString()}</p>
                    <p className="text-[10px] text-neutral-400">1 week (statutory cap)</p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-md">
              {/* Full deposit */}
              <div>
                <label className="block text-xs text-neutral-500 mb-xs">Full deposit charged</label>
                <div className="flex gap-sm">
                  <div className="relative flex-1">
                    <span className="absolute left-sm top-1/2 -translate-y-1/2 text-neutral-400 text-sm">£</span>
                    <input type="number" value={deposit} onChange={e => setDeposit(e.target.value)} placeholder="0"
                      className="w-full pl-6 pr-sm py-sm border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900" />
                  </div>
                  {agreedRent > 0 && (
                    <>
                      <button type="button" onClick={() => setDeposit(String(fiveWeeks))}
                        className="px-sm py-sm border border-neutral-200 rounded-lg text-xs text-neutral-600 hover:bg-neutral-50 whitespace-nowrap">
                        5 weeks
                      </button>
                      <button type="button" onClick={() => setDeposit(String(agreedRent))}
                        className="px-sm py-sm border border-neutral-200 rounded-lg text-xs text-neutral-600 hover:bg-neutral-50 whitespace-nowrap">
                        1 month
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Held by */}
              <div>
                <label className="block text-xs text-neutral-500 mb-xs">Held by</label>
                <div className="grid grid-cols-2 gap-sm">
                  {(['agent', 'landlord'] as const).map(v => (
                    <button key={v} type="button" onClick={() => setDepositHeldBy(v)}
                      className={`rounded-lg border px-md py-sm text-sm font-medium transition ${depositHeldBy === v ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'}`}>
                      {v === 'agent' ? 'Agent' : 'Landlord'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Holding deposit */}
              <div>
                <label className="block text-xs text-neutral-500 mb-xs">Holding deposit received</label>
                <div className="flex gap-sm">
                  <div className="relative flex-1">
                    <span className="absolute left-sm top-1/2 -translate-y-1/2 text-neutral-400 text-sm">£</span>
                    <input type="number" value={holdingDeposit} onChange={e => setHoldingDeposit(e.target.value)} placeholder="0"
                      className="w-full pl-6 pr-sm py-sm border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900" />
                  </div>
                  {agreedRent > 0 && (
                    <button type="button" onClick={() => setHoldingDeposit(String(oneWeek))}
                      className="px-sm py-sm border border-neutral-200 rounded-lg text-xs text-neutral-600 hover:bg-neutral-50 whitespace-nowrap">
                      Set max (1 wk)
                    </button>
                  )}
                </div>
                {deposit && holdingDeposit && (
                  <p className="text-[11px] text-neutral-500 mt-xs">
                    Deposit balance due on move-in: <span className="font-semibold text-neutral-900">£{depositBalance.toLocaleString()}</span>
                  </p>
                )}
              </div>

              {/* Scheme ref */}
              <div>
                <label className="block text-xs text-neutral-500 mb-xs">Deposit scheme reference</label>
                <input type="text" value={depositRef} onChange={e => setDepositRef(e.target.value)}
                  placeholder="DPS / TDS / MyDeposits ref — complete after protection"
                  className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900" />
              </div>
            </div>
          </div>

          {/* Move-in balance summary */}
          {agreedRent > 0 && (
            <div className="p-lg">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-sm">Move-in balance demand</p>
              <div className="rounded-lg bg-neutral-900 px-lg py-md text-white">
                <div className="flex justify-between text-sm mb-xs">
                  <span className="text-neutral-400">Rent in advance ({rentInAdvance} month{Number(rentInAdvance)>1?'s':''})</span>
                  <span className="font-semibold">£{rentDue.toLocaleString()}</span>
                </div>
                {deposit && (
                  <div className="flex justify-between text-sm mb-xs">
                    <span className="text-neutral-400">Deposit balance{holdingDeposit ? ` (£${Number(holdingDeposit).toLocaleString()} holding deposit already received)` : ''}</span>
                    <span className="font-semibold">£{depositBalance.toLocaleString()}</span>
                  </div>
                )}
                {lettingFeeCharged && (
                  <div className="flex justify-between text-sm mb-xs">
                    <span className="text-neutral-400">Letting fee</span>
                    <span className="font-semibold">£{suggestedFee.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold border-t border-white/10 pt-sm mt-sm">
                  <span>Total due on move-in</span>
                  <span>£{(totalDue + (lettingFeeCharged ? suggestedFee : 0)).toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}

          {/* Reference & notes */}
          <div className="p-lg">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-sm">Reference & notes</p>
            <div className="space-y-md">
              <div>
                <label className="block text-xs text-neutral-500 mb-xs">Lease / tenancy reference</label>
                <input type="text" value={leaseRef} onChange={e => setLeaseRef(e.target.value)}
                  placeholder="e.g. TEN-2024-CLH04"
                  className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900" />
              </div>
              <div>
                <label className="block text-xs text-neutral-500 mb-xs">Office notes (internal)</label>
                <textarea rows={2} value={officeNotes} onChange={e => setOfficeNotes(e.target.value)}
                  placeholder="Any internal notes about this tenancy…"
                  className="w-full px-md py-sm border border-neutral-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-neutral-900" />
              </div>
            </div>
          </div>

        </div>

        {/* Error */}
        {error && (
          <div className="mt-lg rounded-lg bg-red-50 border border-red-200 px-md py-sm">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Save */}
        <div className="mt-lg flex gap-md">
          <button onClick={handleSave} disabled={saving}
            className="flex-1 rounded-xl bg-neutral-900 py-md font-bold text-white hover:bg-neutral-800 disabled:opacity-50 transition text-sm">
            {saving ? 'Creating tenancy…' : 'Create tenancy & convert applicant →'}
          </button>
          <button onClick={() => router.back()}
            className="px-xl rounded-xl border border-neutral-300 py-md font-semibold text-neutral-700 hover:bg-neutral-50 text-sm">
            Cancel
          </button>
        </div>

      </main>
    </div>
  )
}
