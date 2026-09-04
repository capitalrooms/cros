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

export interface OnNoticeData {
  moveOutDate: string
  noticeReceivedDate: string
  rentDueDay: number
  newAskingRent: number | null
  emailTenant: boolean
  emailCleaner: boolean
  cleanerId?: string
  notesForLettings: string
  checkoutEmailHtml?: string
  proRataAmount: number
  proRataDays: number
  daysInMonth: number
}

interface Props {
  tenancy: Tenancy | null
  cleaners: Cleaner[]
  onClose: () => void
  onConfirm: (data: OnNoticeData) => Promise<void>
}

// ─── Pro-rata calculation ───────────────────────────────────────────────────
// Calculates from the last rent-due date (based on rent_due_day) up to
// move-out date. This is what the tenant actually owes for their final
// partial rent period.
function calcProRata(
  monthlyRent: number,
  rentDueDay: number,
  moveOutDate: string
): { proRataAmount: number; daysOccupied: number; daysInMonth: number; lastDueDate: Date } {
  if (!monthlyRent || monthlyRent <= 0 || !moveOutDate) {
    return { proRataAmount: 0, daysOccupied: 0, daysInMonth: 30, lastDueDate: new Date() }
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
  const daysOccupied = Math.round(
    (moveOut.getTime() - lastDueDate.getTime()) / (1000 * 60 * 60 * 24)
  )
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const proRataAmount = Math.max(0, (monthlyRent / daysInMonth) * daysOccupied)

  return { proRataAmount, daysOccupied, daysInMonth, lastDueDate }
}

export default function SetOnNoticeModal({ tenancy, cleaners, onClose, onConfirm }: Props) {
  const today = new Date().toISOString().split('T')[0]

  const [step, setStep] = useState<'details' | 'confirm-rent' | 'preview' | 'sending'>('details')
  const [moveOutDate, setMoveOutDate]           = useState('')
  const [noticeReceivedDate, setNoticeReceivedDate] = useState(today)
  const [rentDueDay, setRentDueDay]             = useState<number>(tenancy?.rent_due_day ?? 1)
  const [newAskingRent, setNewAskingRent]       = useState<number | null>(null)
  const [emailTenant, setEmailTenant]           = useState(true)
  const [emailCleaner, setEmailCleaner]         = useState(false)
  const [selectedCleanerId, setSelectedCleanerId] = useState('')
  const [notesForLettings, setNotesForLettings] = useState('')
  const [proRataConfirmed, setProRataConfirmed] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  if (!tenancy) return null

  const proRata = moveOutDate && tenancy.rent_amount
    ? calcProRata(tenancy.rent_amount, rentDueDay, moveOutDate)
    : null

  const checkoutEmailHtml = emailTenant && moveOutDate && proRata
    ? buildCheckoutEmail({
        tenantName:         displayName(tenancy.person) || 'Tenant',
        tenantEmail:        tenancy.person?.email || '',
        roomName:           tenancy.room?.name || 'Room',
        propertyAddress:    tenancy.property?.address || '',
        moveOutDate,
        lastRentAmount:     tenancy.rent_amount,
        proRataRent:        proRata.proRataAmount,
        proRataCalculation: `${proRata.daysOccupied} days of ${proRata.daysInMonth} (rent due day: ${rentDueDay})`,
        contactEmail: 'admin@capitalrooms.co.uk',
        contactPhone: '+44 (0)20 XXXX XXXX',
      })
    : null

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
        daysInMonth:    proRata?.daysInMonth ?? 30,
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

        {/* Notice received date */}
        <div>
          <label className="block text-sm font-semibold text-neutral-900 mb-xs">
            When was notice given? *
          </label>
          <input
            type="date"
            value={noticeReceivedDate}
            max={today}
            onChange={e => setNoticeReceivedDate(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm"
          />
          <p className="text-xs text-neutral-400 mt-xs">
            Today if they just told you; back-date if notice was given earlier (by phone, etc.)
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
              Last rent period: {fmt(proRata.lastDueDate.toISOString().split('T')[0])} → {fmt(moveOutDate)}
              {' '}= <strong>{proRata.daysOccupied} of {proRata.daysInMonth} days</strong>
              {' '}→ £{proRata.proRataAmount.toFixed(2)}
            </p>
          )}
        </div>

        {/* New asking rent */}
        <div>
          <label className="block text-sm font-semibold text-neutral-900 mb-xs">
            New asking rent (optional)
          </label>
          <div className="flex items-center gap-sm">
            <span className="text-neutral-600">£</span>
            <input
              type="number"
              value={newAskingRent ?? ''}
              onChange={e => setNewAskingRent(e.target.value ? Number(e.target.value) : null)}
              placeholder="e.g. 850"
              className="flex-1 rounded-lg border border-neutral-300 px-md py-sm text-sm"
            />
            <span className="text-neutral-600">/month</span>
          </div>
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
              <tr>
                <td className="py-xs text-neutral-500">Days in rent period</td>
                <td className="py-xs">{proRata.daysOccupied} of {proRata.daysInMonth}</td>
              </tr>
              <tr className="border-t border-neutral-200">
                <td className="pt-md text-neutral-900 font-bold">Final rent due</td>
                <td className="pt-md text-neutral-900 font-bold text-lg">
                  £{proRata.proRataAmount.toFixed(2)}
                </td>
              </tr>
            </tbody>
          </table>

          <p className="text-xs text-neutral-400 mt-sm">
            Formula: (£{tenancy.rent_amount} ÷ {proRata.daysInMonth} days) × {proRata.daysOccupied} days
            = £{proRata.proRataAmount.toFixed(2)}
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
            onClick={() => setStep('preview')}
            disabled={!proRataConfirmed}
            className="flex-1 rounded-lg bg-blue-600 px-lg py-md text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Preview email →
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
