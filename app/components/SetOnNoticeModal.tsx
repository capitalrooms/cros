'use client'
import { displayName } from '@/lib/people'
import { useState } from 'react'
import { buildCheckoutEmail } from '@/lib/checkoutEmailTemplate'

interface Tenancy {
  id: string
  person?: { name: string; email: string; phone: string }
  room?: { name: string }
  property?: { name: string; address: string }
  rent_amount: number
  /** rent_due_day from DB — may be undefined for older tenancies */
  rent_due_day?: number | null
}

interface Cleaner {
  id: string
  name: string
  email?: string
  phone?: string
}

interface Contractor {
  id: string
  name: string
  email?: string
}

export interface OnNoticeData {
  moveOutDate: string
  noticeReceivedDate: string
  rentDueDay: number
  newAskingRent?: string
  emailTenant: boolean
  emailCleaner: boolean
  cleanerId?: string
  notesForLettings: string
  checkoutEmailHtml?: string
  proRataAmount: number
  proRataDays: number
  dailyRate: number
  pendingJobs?: string[]
  jobContractorId?: string
}

interface Props {
  tenancy: Tenancy | null
  cleaners: Cleaner[]
  contractors?: Contractor[]
  onClose: () => void
  onConfirm: (data: OnNoticeData) => Promise<void>
}

// ─── Pro-rata calculation ───────────────────────────────────────────────────
// Calculates from the last rent-due date (based on rent_due_day) up to and
// including the move-out date. Formula: rent × 12 / 365 × days.
// Special case: if the final period covers a complete calendar month (e.g. rent
// due on the 1st and tenant leaves on the last day of that month), charge the
// full monthly rent rather than the daily-rate approximation.
function calcProRata(
  monthlyRent: number,
  rentDueDay: number,
  moveOutDate: string
): { proRataAmount: number; daysOccupied: number; dailyRate: number; lastDueDate: Date; isFullMonth: boolean } {
  if (!monthlyRent || monthlyRent <= 0 || !moveOutDate) {
    return { proRataAmount: 0, daysOccupied: 0, dailyRate: 0, lastDueDate: new Date(), isFullMonth: false }
  }

  const moveOut = new Date(moveOutDate + 'T12:00:00')
  let year = moveOut.getFullYear()
  let month = moveOut.getMonth() // 0-indexed

  // Clamp due day to the number of days in the candidate month
  const clamp = (y: number, m: number) =>
    Math.min(rentDueDay, new Date(y, m + 1, 0).getDate())

  let dueDay = clamp(year, month)
  if (moveOut.getDate() < dueDay) {
    // move-out is before the due date this month → last due date was last month
    if (month === 0) { year--; month = 11 } else { month-- }
    dueDay = clamp(year, month)
  }

  const lastDueDate = new Date(year, month, dueDay, 12, 0, 0)
  // +1: count both start and end dates (1st to 31st inclusive = 31 days, not 30)
  const daysOccupied = Math.round(
    (moveOut.getTime() - lastDueDate.getTime()) / (1000 * 60 * 60 * 24)
  ) + 1

  // Full-month check: last due date is the Nth of month M, and move-out is the
  // last day of that same month M → charge the full monthly rent
  const lastDayOfMonth = new Date(year, month + 1, 0).getDate()
  const isFullMonth =
    lastDueDate.getFullYear() === moveOut.getFullYear() &&
    lastDueDate.getMonth()    === moveOut.getMonth()    &&
    moveOut.getDate()         === lastDayOfMonth

  const dailyRate = monthlyRent * 12 / 365
  const proRataAmount = isFullMonth ? monthlyRent : Math.max(0, dailyRate * daysOccupied)

  return { proRataAmount, daysOccupied, dailyRate, lastDueDate, isFullMonth }
}

export default function SetOnNoticeModal({ tenancy, cleaners, contractors = [], onClose, onConfirm }: Props) {
  const today = new Date().toISOString().split('T')[0]

  const [step, setStep] = useState<'details' | 'confirm-rent' | 'preview' | 'sending'>('details')
  const [moveOutDate, setMoveOutDate]           = useState('')
  const [noticeReceivedDate, setNoticeReceivedDate] = useState(today)
  const [rentDueDay, setRentDueDay]             = useState<number>(tenancy?.rent_due_day ?? 1)
  const [emailTenant, setEmailTenant]           = useState(true)
  const [emailCleaner, setEmailCleaner]         = useState(false)
  const [selectedCleanerId, setSelectedCleanerId] = useState('')
  const [notesForLettings, setNotesForLettings] = useState('')
  const [newAskingRent, setNewAskingRent]       = useState('')
  const [pendingJobs, setPendingJobs]           = useState<string[]>([])
  const [jobInput, setJobInput]                 = useState('')
  const [jobContractorId, setJobContractorId]   = useState('')
  const [proRataConfirmed, setProRataConfirmed] = useState(false)
  const [sending, setSending]                   = useState(false)
  const [buildingPreview, setBuildingPreview]   = useState(false)
  const [checkoutEmailHtml, setCheckoutEmailHtml] = useState<string | null>(null)
  const [error, setError]     = useState<string | null>(null)

  if (!tenancy) return null

  const proRata = moveOutDate && tenancy.rent_amount
    ? calcProRata(tenancy.rent_amount, rentDueDay, moveOutDate)
    : null

  // Build the checkout email preview and advance to the preview step
  const handleBuildPreview = async () => {
    if (!proRata || !moveOutDate) return
    setBuildingPreview(true)
    setError(null)
    try {
      const html = await buildCheckoutEmail({
        tenantName:         displayName(tenancy.person) || 'Tenant',
        tenantEmail:        tenancy.person?.email || '',
        roomName:           tenancy.room?.name || 'Room',
        propertyAddress:    tenancy.property?.address || '',
        moveOutDate,
        lastRentAmount:     tenancy.rent_amount,
        proRataRent:        proRata.proRataAmount,
        proRataCalculation: `${proRata.daysOccupied} days × £${proRata.dailyRate.toFixed(2)}/day`,
        contactEmail: 'management@capitalrooms.co.uk',
        contactPhone: '0207 112 9163',
      })
      setCheckoutEmailHtml(html)
      setStep('preview')
    } catch (err) {
      setError('Could not build email preview: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setBuildingPreview(false)
    }
  }

  const handleConfirm = async () => {
    if (!moveOutDate) { setError('Please select a move-out date'); return }
    setSending(true)
    setError(null)
    try {
      await onConfirm({
        moveOutDate,
        noticeReceivedDate,
        rentDueDay,
        newAskingRent,
        emailTenant,
        emailCleaner,
        cleanerId: selectedCleanerId || undefined,
        notesForLettings,
        checkoutEmailHtml: emailTenant ? checkoutEmailHtml || undefined : undefined,
        proRataAmount:  proRata?.proRataAmount ?? 0,
        proRataDays:    proRata?.daysOccupied ?? 0,
        dailyRate:      proRata?.dailyRate ?? 0,
        pendingJobs:    pendingJobs.filter(Boolean),
        jobContractorId: jobContractorId || undefined,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setSending(false)
    }
  }

  const fmt = (d: string) =>
    new Date(d + 'T12:00:00').toLocaleDateString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
    })

  // ── Step 1: Collect details ───────────────────────────────────────────────
  if (step === 'details') return (
    <Modal onClose={onClose}>
      <ModalHeader title="Mark as On Notice" onClose={onClose} />

      <div className="space-y-lg">
        {/* Tenant summary */}
        <div className="rounded-xl bg-neutral-50 border border-neutral-200 p-md">
          <p className="text-sm text-neutral-700"><strong>Tenant:</strong> {displayName(tenancy.person)}</p>
          <p className="text-sm text-neutral-700"><strong>Room:</strong> {tenancy.room?.name}, {tenancy.property?.address}</p>
          <p className="text-sm text-neutral-700"><strong>Rent:</strong> £{tenancy.rent_amount}/month</p>
        </div>

        {/* Notice received date — optional */}
        <div>
          <label className="block text-sm font-semibold text-neutral-900 mb-xs">
            When was notice given? <span className="font-normal text-neutral-400 text-xs">(optional)</span>
          </label>
          <input
            type="date"
            value={noticeReceivedDate}
            max={today}
            onChange={e => setNoticeReceivedDate(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm"
          />
          <p className="text-xs text-neutral-400 mt-xs">
            Leave as today, or back-date if notice was given earlier (by phone, etc.)
          </p>
        </div>

        {/* Move-out date */}
        <div>
          <label className="block text-sm font-semibold text-neutral-900 mb-xs">
            When are they moving out? *
          </label>
          <input
            type="date"
            value={moveOutDate}
            min={noticeReceivedDate || today}
            onChange={e => { setMoveOutDate(e.target.value); setProRataConfirmed(false); setError(null) }}
            className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm"
          />
        </div>

        {/* Rent due day */}
        <div>
          <label className="block text-sm font-semibold text-neutral-900 mb-xs">
            Rent due day (day of month)
          </label>
          <div className="flex items-center gap-sm">
            <span className="text-sm text-neutral-600">Day</span>
            <input
              type="number"
              min={1}
              max={28}
              value={rentDueDay}
              onChange={e => { setRentDueDay(Math.max(1, Math.min(28, Number(e.target.value)))); setProRataConfirmed(false) }}
              className="w-20 rounded-lg border border-neutral-300 px-md py-sm text-sm"
            />
            <span className="text-sm text-neutral-600">of each month</span>
          </div>
          {proRata && moveOutDate && (
            <p className="text-xs text-neutral-500 mt-xs">
              Final rent period: {fmt(proRata.lastDueDate.toISOString().split('T')[0])} → {fmt(moveOutDate)}
              {proRata.isFullMonth ? (
                <> = <strong>full calendar month</strong> = <strong>£{proRata.proRataAmount.toFixed(2)}</strong></>
              ) : (
                <> = <strong>{proRata.daysOccupied} days</strong>
                {' '}× £{proRata.dailyRate.toFixed(2)}/day (£{tenancy.rent_amount} × 12 ÷ 365)
                {' '}= <strong>£{proRata.proRataAmount.toFixed(2)}</strong></>
              )}
            </p>
          )}
        </div>

        {/* Notifications */}
        <div className="rounded-xl bg-blue-50 border border-blue-200 p-md space-y-md">
          <h3 className="text-sm font-semibold text-neutral-900">Send notifications</h3>
          <label className="flex items-start gap-md cursor-pointer">
            <input type="checkbox" checked={emailTenant}
              onChange={e => setEmailTenant(e.target.checked)}
              className="mt-1 w-4 h-4" />
            <div>
              <p className="text-sm font-medium text-neutral-900">Checkout email to tenant</p>
              <p className="text-xs text-neutral-600 mt-xs">
                Pro-rata rent, checkout checklist, deposit info — preview before sending
              </p>
            </div>
          </label>
          <label className="flex items-start gap-md cursor-pointer">
            <input type="checkbox" checked={emailCleaner}
              onChange={e => setEmailCleaner(e.target.checked)}
              className="mt-1 w-4 h-4" />
            <div>
              <p className="text-sm font-medium text-neutral-900">Notify cleaner</p>
              <p className="text-xs text-neutral-600 mt-xs">Schedule post-checkout clean</p>
            </div>
          </label>
          {emailCleaner && (
            <select
              value={selectedCleanerId}
              onChange={e => setSelectedCleanerId(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm"
            >
              <option value="">Select cleaner…</option>
              {cleaners.map(c => (
                <option key={c.id} value={c.id}>{c.name}{c.email ? ` (${c.email})` : ''}</option>
              ))}
            </select>
          )}
        </div>

        {/* New asking rent for remarketing */}
        <div>
          <label className="block text-sm font-semibold text-neutral-900 mb-xs">
            New asking rent for remarketing <span className="font-normal text-neutral-400 text-xs">(optional)</span>
          </label>
          <div className="relative">
            <span className="absolute left-md top-1/2 -translate-y-1/2 text-neutral-500 text-sm font-semibold">£</span>
            <input
              type="number"
              min={0}
              step={5}
              value={newAskingRent}
              onChange={e => setNewAskingRent(e.target.value)}
              placeholder={tenancy.rent_amount ? tenancy.rent_amount.toString() : '0'}
              className="w-full rounded-lg border border-neutral-300 pl-7 pr-md py-sm text-sm"
            />
          </div>
          <p className="text-xs text-neutral-400 mt-xs">
            Leave blank to keep the current rent of £{tenancy.rent_amount}/month
          </p>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-semibold text-neutral-900 mb-xs">
            Notes for lettings team
          </label>
          <textarea
            rows={2}
            value={notesForLettings}
            onChange={e => setNotesForLettings(e.target.value)}
            placeholder="e.g. room needs repainting, tenant mentioned damp in corner…"
            className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm resize-none"
          />
        </div>

        {/* Jobs to raise */}
        <div>
          <label className="block text-sm font-semibold text-neutral-900 mb-xs">
            Jobs to raise for contractor <span className="font-normal text-neutral-400 text-xs">(optional)</span>
          </label>
          {contractors.length > 0 && (
            <select
              value={jobContractorId}
              onChange={e => setJobContractorId(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm mb-sm"
            >
              <option value="">— Select contractor (optional) —</option>
              {contractors.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
          {/* Quick suggestion chips */}
          <div className="flex flex-wrap gap-xs mb-sm">
            {['Repaint walls','Replace ceiling light','Fix drawers','Fix carpet','Replace mattress','Touch up skirting'].map(s => (
              <button
                key={s}
                type="button"
                onClick={() => { if (!pendingJobs.includes(s)) setPendingJobs(j => [...j, s]) }}
                disabled={pendingJobs.includes(s)}
                className="rounded-full border border-neutral-300 px-sm py-xs text-xs text-neutral-600 hover:border-neutral-900 hover:text-neutral-900 disabled:opacity-40 disabled:cursor-default transition-colors"
              >{s}</button>
            ))}
          </div>
          {/* Free-text add */}
          <div className="flex gap-xs">
            <input
              type="text"
              value={jobInput}
              onChange={e => setJobInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && jobInput.trim()) {
                  e.preventDefault()
                  setPendingJobs(j => [...j, jobInput.trim()])
                  setJobInput('')
                }
              }}
              placeholder="Describe a job and press Enter…"
              className="flex-1 rounded-lg border border-neutral-300 px-md py-sm text-sm"
            />
            <button
              type="button"
              onClick={() => { if (jobInput.trim()) { setPendingJobs(j => [...j, jobInput.trim()]); setJobInput('') } }}
              className="rounded-lg bg-neutral-900 px-md py-sm text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-40"
              disabled={!jobInput.trim()}
            >Add</button>
          </div>
          {/* Listed jobs */}
          {pendingJobs.length > 0 && (
            <ul className="mt-sm space-y-xs">
              {pendingJobs.map((j, i) => (
                <li key={i} className="flex items-center justify-between gap-sm rounded-lg bg-amber-50 border border-amber-200 px-md py-xs text-sm text-neutral-800">
                  <span>🔧 {j}</span>
                  <button
                    type="button"
                    onClick={() => setPendingJobs(jobs => jobs.filter((_, idx) => idx !== i))}
                    className="text-neutral-400 hover:text-red-600 text-lg leading-none"
                  >×</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-md">
          {emailTenant && moveOutDate && proRata ? (
            <button
              onClick={() => setStep('confirm-rent')}
              className="flex-1 rounded-lg bg-blue-600 px-lg py-md text-sm font-bold text-white hover:bg-blue-700"
            >
              Review rent calculation →
            </button>
          ) : (
            <button
              onClick={handleConfirm}
              disabled={!moveOutDate || sending}
              className="flex-1 rounded-lg bg-green-600 px-lg py-md text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50"
            >
              {sending ? 'Saving…' : 'Confirm & Mark On Notice'}
            </button>
          )}
          <button onClick={onClose} className="rounded-lg border border-neutral-300 px-lg py-md text-sm font-semibold hover:bg-neutral-50">
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  )

  // ── Step 2: Confirm pro-rata calculation ──────────────────────────────────
  if (step === 'confirm-rent' && proRata) return (
    <Modal onClose={onClose}>
      <ModalHeader title="Confirm final rent" onClose={() => setStep('details')} />

      <div className="space-y-lg">
        <p className="text-sm text-neutral-600">
          Check the pro-rata calculation before the checkout email is prepared.
          Tick the box to confirm it&apos;s correct.
        </p>

        <div className="rounded-xl bg-neutral-50 border border-neutral-200 p-lg">
          <table className="w-full text-sm">
            <tbody>
              <tr>
                <td className="py-xs text-neutral-500 w-48">Monthly rent</td>
                <td className="py-xs font-semibold">£{tenancy.rent_amount.toFixed(2)}</td>
              </tr>
              <tr>
                <td className="py-xs text-neutral-500">Rent due day</td>
                <td className="py-xs">{rentDueDay}{rentDueDay === 1 ? 'st' : rentDueDay === 2 ? 'nd' : rentDueDay === 3 ? 'rd' : 'th'} of the month</td>
              </tr>
              <tr>
                <td className="py-xs text-neutral-500">Last rent period starts</td>
                <td className="py-xs">{fmt(proRata.lastDueDate.toISOString().split('T')[0])}</td>
              </tr>
              <tr>
                <td className="py-xs text-neutral-500">Move-out date</td>
                <td className="py-xs">{fmt(moveOutDate)}</td>
              </tr>
              {proRata.isFullMonth ? (
                <tr>
                  <td className="py-xs text-neutral-500">Calculation</td>
                  <td className="py-xs text-green-700 font-semibold">Full calendar month — no pro-rata needed</td>
                </tr>
              ) : (
                <>
                  <tr>
                    <td className="py-xs text-neutral-500">Daily rate</td>
                    <td className="py-xs">£{tenancy.rent_amount} × 12 ÷ 365 = £{proRata.dailyRate.toFixed(2)}/day</td>
                  </tr>
                  <tr>
                    <td className="py-xs text-neutral-500">Days in final period</td>
                    <td className="py-xs">{proRata.daysOccupied} days (inclusive)</td>
                  </tr>
                </>
              )}
              <tr className="border-t border-neutral-200">
                <td className="pt-md text-neutral-900 font-bold">Final rent due</td>
                <td className="pt-md text-neutral-900 font-bold text-lg">
                  £{proRata.proRataAmount.toFixed(2)}
                </td>
              </tr>
            </tbody>
          </table>

          <p className="text-xs text-neutral-400 mt-sm">
            {proRata.isFullMonth
              ? `Full month — £${proRata.proRataAmount.toFixed(2)}`
              : `£${tenancy.rent_amount} × 12 ÷ 365 × ${proRata.daysOccupied} days = £${proRata.proRataAmount.toFixed(2)}`
            }
          </p>
        </div>

        <label className="flex items-start gap-md cursor-pointer">
          <input
            type="checkbox"
            checked={proRataConfirmed}
            onChange={e => setProRataConfirmed(e.target.checked)}
            className="mt-1 w-4 h-4 accent-green-600"
          />
          <span className="text-sm text-neutral-900">
            I confirm this pro-rata amount is correct and should appear in the checkout email
          </span>
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-md">
          <button
            onClick={handleBuildPreview}
            disabled={!proRataConfirmed || buildingPreview}
            className="flex-1 rounded-lg bg-blue-600 px-lg py-md text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {buildingPreview ? 'Building preview…' : 'Preview email →'}
          </button>
          <button onClick={() => setStep('details')} className="rounded-lg border border-neutral-300 px-lg py-md text-sm font-semibold hover:bg-neutral-50">
            Back
          </button>
        </div>
      </div>
    </Modal>
  )

  // ── Step 3: Preview email ─────────────────────────────────────────────────
  if (step === 'preview' && checkoutEmailHtml) return (
    <Modal onClose={onClose}>
      <ModalHeader title="Preview checkout email" onClose={() => setStep('confirm-rent')} />

      <div className="space-y-lg">
        <div className="rounded-lg bg-yellow-50 border border-yellow-300 p-md text-sm text-yellow-900">
          📧 This will be sent to <strong>{tenancy.person?.email}</strong>
        </div>

        <div className="border border-neutral-300 rounded-lg overflow-hidden">
          <iframe srcDoc={checkoutEmailHtml} className="w-full h-96 border-0" title="Checkout email preview" />
        </div>

        <p className="text-xs text-neutral-500">
          Scroll inside the preview. A 2-week reminder will be sent automatically 14 days before move-out.
        </p>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-md">
          <button
            onClick={handleConfirm}
            disabled={sending}
            className="flex-1 rounded-lg bg-green-600 px-lg py-md text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50"
          >
            {sending ? 'Sending…' : 'Send email & mark on notice'}
          </button>
          <button onClick={() => setStep('confirm-rent')} disabled={sending}
            className="rounded-lg border border-neutral-300 px-lg py-md text-sm font-semibold hover:bg-neutral-50 disabled:opacity-50">
            Back
          </button>
        </div>
      </div>
    </Modal>
  )

  return null
}

// ── Small layout helpers ──────────────────────────────────────────────────────
function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-md">
      <div className="rounded-2xl bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-lg">{children}</div>
      </div>
    </div>
  )
}

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between mb-lg">
      <h2 className="text-2xl font-bold text-neutral-900">{title}</h2>
      <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 text-xl leading-none">✕</button>
    </div>
  )
}
