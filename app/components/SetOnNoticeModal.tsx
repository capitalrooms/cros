'use client'

import { useState } from 'react'
import { buildCheckoutEmail } from '@/lib/checkoutEmailTemplate'

interface Tenancy {
  id: string
  person?: {
    full_name: string
    email: string
    phone: string
  }
  room?: {
    name: string
  }
  property?: {
    name: string
    address: string
  }
  rent_amount: number
}

interface Cleaner {
  id: string
  full_name: string
  email?: string
  phone?: string
}

interface SetOnNoticeModalProps {
  tenancy: Tenancy | null
  cleaners: Cleaner[]
  onClose: () => void
  onConfirm: (data: OnNoticeData) => Promise<void>
}

export interface OnNoticeData {
  moveOutDate: string
  newAskingRent: number | null
  emailTenant: boolean
  emailCleaner: boolean
  cleanerId?: string
  notesForLettings: string
  checkoutEmailHtml?: string
}

export default function SetOnNoticeModal({ tenancy, cleaners, onClose, onConfirm }: SetOnNoticeModalProps) {
  const [step, setStep] = useState<'details' | 'preview' | 'sending'>('details')
  const [moveOutDate, setMoveOutDate] = useState('')
  const [newAskingRent, setNewAskingRent] = useState<number | null>(null)
  const [emailTenant, setEmailTenant] = useState(true)
  const [emailCleaner, setEmailCleaner] = useState(false)
  const [selectedCleanerId, setSelectedCleanerId] = useState('')
  const [notesForLettings, setNotesForLettings] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!tenancy) return null

  // Calculate pro rata rent
  const calculateProRata = (moveOutDate: string, monthlyRent: number) => {
    if (!monthlyRent || monthlyRent <= 0) {
      return { proRataAmount: 0, daysOccupied: 0, daysInMonth: 0 }
    }

    const today = new Date()
    const moveOut = new Date(moveOutDate)
    const lastDayOfMonth = new Date(moveOut.getFullYear(), moveOut.getMonth() + 1, 0)

    const daysRemaining = Math.ceil((moveOut.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    const daysInMonth = lastDayOfMonth.getDate()
    const proRataAmount = (monthlyRent / daysInMonth) * daysRemaining
    const daysOccupied = daysRemaining

    return {
      proRataAmount: Math.max(0, proRataAmount),
      daysOccupied,
      daysInMonth,
    }
  }

  const proRata = moveOutDate && tenancy.rent_amount ? calculateProRata(moveOutDate, tenancy.rent_amount) : null

  // Build preview email
  const checkoutEmailHtml = emailTenant && moveOutDate && proRata ? buildCheckoutEmail({
    tenantName: tenancy.person?.full_name || 'Tenant',
    tenantEmail: tenancy.person?.email || '',
    roomName: tenancy.room?.name || 'Room',
    propertyAddress: tenancy.property?.address || '',
    moveOutDate,
    lastRentAmount: tenancy.rent_amount,
    proRataRent: proRata.proRataAmount,
    proRataCalculation: `${proRata.daysOccupied} days of ${proRata.daysInMonth}`,
    contactEmail: 'admin@capitalrooms.co.uk',
    contactPhone: '+44 (0)20 XXXX XXXX',
  }) : null

  const handleConfirm = async () => {
    if (!moveOutDate) {
      setError('Please select a move-out date')
      return
    }

    setSending(true)
    setError(null)

    try {
      await onConfirm({
        moveOutDate,
        newAskingRent,
        emailTenant,
        emailCleaner,
        cleanerId: selectedCleanerId,
        notesForLettings,
        checkoutEmailHtml: emailTenant ? checkoutEmailHtml || undefined : undefined,
      })

      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="rounded-2xl bg-white w-full max-w-2xl mx-lg max-h-[90vh] overflow-y-auto">
        {/* Step: Details Collection */}
        {step === 'details' && (
          <div className="p-lg">
            <div className="flex items-center justify-between mb-lg">
              <h2 className="text-2xl font-bold text-neutral-900">Mark as On Notice</h2>
              <button
                onClick={onClose}
                className="text-neutral-400 hover:text-neutral-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-lg">
              {/* Tenant Info */}
              <div className="p-md bg-neutral-50 rounded-lg border border-neutral-200">
                <p className="text-sm text-neutral-600">
                  <strong>Tenant:</strong> {tenancy.person?.full_name}
                </p>
                <p className="text-sm text-neutral-600">
                  <strong>Room:</strong> {tenancy.room?.name}, {tenancy.property?.address}
                </p>
                <p className="text-sm text-neutral-600">
                  <strong>Current Rent:</strong> £{tenancy.rent_amount}/month
                </p>
              </div>

              {/* Move-out Date */}
              <div>
                <label className="block text-sm font-semibold text-neutral-900 mb-sm">
                  When are they moving out? *
                </label>
                <input
                  type="date"
                  value={moveOutDate}
                  onChange={(e) => {
                    setMoveOutDate(e.target.value)
                    setError(null)
                  }}
                  className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm"
                  required
                />
                {proRata && (
                  <p className="text-xs text-neutral-600 mt-sm">
                    ℹ️ Pro-rata rent: £{proRata.proRataAmount.toFixed(2)} ({proRata.daysOccupied} days)
                  </p>
                )}
              </div>

              {/* New Asking Rent */}
              <div>
                <label className="block text-sm font-semibold text-neutral-900 mb-sm">
                  What will you market the room at? (new asking rent)
                </label>
                <div className="flex items-center gap-sm">
                  <span className="text-neutral-600">£</span>
                  <input
                    type="number"
                    value={newAskingRent ?? ''}
                    onChange={(e) => setNewAskingRent(e.target.value ? Number(e.target.value) : null)}
                    placeholder="e.g., 850"
                    className="flex-1 rounded-lg border border-neutral-300 px-md py-sm text-sm"
                  />
                  <span className="text-neutral-600">/month</span>
                </div>
              </div>

              {/* Email Notifications */}
              <div className="space-y-md p-md bg-blue-50 rounded-lg border border-blue-200">
                <h3 className="font-semibold text-neutral-900 text-sm">Send Notifications</h3>

                {/* Email Tenant */}
                <label className="flex items-start gap-md cursor-pointer">
                  <input
                    type="checkbox"
                    checked={emailTenant}
                    onChange={(e) => setEmailTenant(e.target.checked)}
                    className="mt-1 w-4 h-4 cursor-pointer"
                  />
                  <div className="flex-1">
                    <p className="font-medium text-neutral-900 text-sm">Email checkout instructions to tenant</p>
                    <p className="text-xs text-neutral-600 mt-xs">
                      Send pro-rata rent calculation and checkout checklist
                    </p>
                  </div>
                </label>

                {/* Email Cleaner */}
                <label className="flex items-start gap-md cursor-pointer">
                  <input
                    type="checkbox"
                    checked={emailCleaner}
                    onChange={(e) => setEmailCleaner(e.target.checked)}
                    className="mt-1 w-4 h-4 cursor-pointer"
                  />
                  <div className="flex-1">
                    <p className="font-medium text-neutral-900 text-sm">Notify cleaner to schedule cleaning</p>
                    <p className="text-xs text-neutral-600 mt-xs">
                      Cleaner will receive notification about post-checkout cleaning
                    </p>
                  </div>
                </label>

                {emailCleaner && (
                  <div>
                    <label className="block text-xs font-semibold text-neutral-900 mb-xs">
                      Which cleaner? *
                    </label>
                    <select
                      value={selectedCleanerId}
                      onChange={(e) => setSelectedCleanerId(e.target.value)}
                      className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm"
                      required={emailCleaner}
                    >
                      <option value="">Select cleaner...</option>
                      {cleaners.map((cleaner) => (
                        <option key={cleaner.id} value={cleaner.id}>
                          {cleaner.full_name} {cleaner.email ? `(${cleaner.email})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Notes for Lettings Team */}
              <div>
                <label className="block text-sm font-semibold text-neutral-900 mb-sm">
                  Notes for lettings team
                </label>
                <textarea
                  value={notesForLettings}
                  onChange={(e) => setNotesForLettings(e.target.value)}
                  placeholder="e.g., Tenant mentioned they might need early access for movers, room has had cosmetic damage..."
                  className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm h-20"
                />
                <p className="text-xs text-neutral-600 mt-sm">
                  These notes will appear in the room details in the lettings screen
                </p>
              </div>

              {error && (
                <div className="p-md bg-red-50 border border-red-300 rounded-lg text-red-900 text-sm">
                  {error}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-md">
                {emailTenant && moveOutDate && proRata ? (
                  <button
                    onClick={() => setStep('preview')}
                    className="flex-1 rounded-lg bg-blue-600 px-lg py-md text-sm font-bold text-white hover:bg-blue-700"
                  >
                    Preview Email & Confirm
                  </button>
                ) : (
                  <button
                    onClick={handleConfirm}
                    disabled={sending || !moveOutDate}
                    className="flex-1 rounded-lg bg-green-600 px-lg py-md text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    {sending ? 'Confirming...' : 'Confirm & Mark On Notice'}
                  </button>
                )}
                <button
                  onClick={onClose}
                  disabled={sending}
                  className="rounded-lg border border-neutral-300 px-lg py-md text-sm font-semibold hover:bg-neutral-50 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step: Email Preview */}
        {step === 'preview' && checkoutEmailHtml && (
          <div className="p-lg">
            <div className="flex items-center justify-between mb-lg">
              <h2 className="text-2xl font-bold text-neutral-900">Preview Checkout Email</h2>
              <button
                onClick={() => setStep('details')}
                className="text-neutral-400 hover:text-neutral-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-lg">
              <div className="p-md bg-yellow-50 border border-yellow-300 rounded-lg text-yellow-900 text-sm">
                📧 This email will be sent to <strong>{tenancy.person?.email}</strong>
              </div>

              {/* Email Preview */}
              <div className="border border-neutral-300 rounded-lg overflow-hidden">
                <iframe
                  srcDoc={checkoutEmailHtml}
                  className="w-full h-96 border-0"
                  title="Email Preview"
                />
              </div>

              <p className="text-xs text-neutral-600">
                Scroll within the preview to see the full email. Check that all information is correct before sending.
              </p>

              {error && (
                <div className="p-md bg-red-50 border border-red-300 rounded-lg text-red-900 text-sm">
                  {error}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-md">
                <button
                  onClick={handleConfirm}
                  disabled={sending}
                  className="flex-1 rounded-lg bg-green-600 px-lg py-md text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {sending ? 'Sending...' : 'Send Email & Mark On Notice'}
                </button>
                <button
                  onClick={() => setStep('details')}
                  disabled={sending}
                  className="rounded-lg border border-neutral-300 px-lg py-md text-sm font-semibold hover:bg-neutral-50 disabled:opacity-50"
                >
                  Back
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
