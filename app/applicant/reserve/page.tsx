'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { PROCESS_GUIDE, PROCESS_GUIDE_SIGNOFF } from '@/lib/lettings/processGuide'

const ACCOUNT_NAME = 'Capital Rooms Ltd'
const SORT_CODE = '20-18-93'
const ACCOUNT_NUMBER = '40162574'

export default function ReservePage() {
  const params = useSearchParams()
  const roomId = params.get('roomId')
  const propertyId = params.get('propertyId')
  const applicantId = params.get('a')   // on links from our emails, so "I've paid" knows who you are
  const [room, setRoom] = useState<any>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [paidNote, setPaidNote] = useState('')
  const [paidState, setPaidState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')

  async function confirmPaid() {
    setPaidState('sending')
    try {
      const res = await fetch('/api/applicant/confirm-deposit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicantId, screenshotNote: paidNote.trim() || undefined }),
      })
      setPaidState(res.ok ? 'done' : 'error')
    } catch {
      setPaidState('error')
    }
  }

  useEffect(() => {
    if (!roomId) return
    fetch(`/api/applicant/room/${roomId}`).then(r => (r.ok ? r.json() : null)).then(setRoom).catch(() => setRoom(null))
  }, [roomId])

  const monthly: number | null = room?.monthly ?? null
  const weekly: number | null = room?.weekly ?? null
  const ref: string = room?.reference ?? 'HOLD'
  const propAddress: string = room?.property || ''
  const roomName: string | null = room?.name ?? null
  const gbp = (n: number | null) => n == null ? '' : n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const copy = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  const CopyRow = ({ label, value, id }: { label: string; value: string; id: string }) => (
    <div className="flex items-center justify-between py-sm border-b border-neutral-100 last:border-0">
      <div>
        <p className="text-xs text-neutral-500">{label}</p>
        <p className="text-sm font-semibold text-neutral-900 font-mono">{value}</p>
      </div>
      <button
        onClick={() => copy(value, id)}
        className="text-xs font-medium bg-neutral-900 text-white px-sm py-xs rounded-lg hover:bg-neutral-800 transition-colors shrink-0 ml-md"
      >
        {copied === id ? '✓ Copied' : 'Copy'}
      </button>
    </div>
  )

  return (
    <div className="min-h-screen bg-neutral-100 py-xl px-lg">
      <div className="mx-auto max-w-lg">

        {/* Hero */}
        <div className="bg-neutral-900 text-white rounded-2xl p-lg mb-lg text-center">
          <div className="text-3xl mb-sm">🎉</div>
          <h1 className="text-2xl font-bold mb-xs">The search is over!</h1>
          {room ? (
            <p className="text-sm text-neutral-300">
              {roomName && <span className="font-semibold text-white">{roomName}</span>}
              {propAddress && <span> · {propAddress}</span>}
            </p>
          ) : (
            <p className="text-sm text-neutral-400">Loading room details…</p>
          )}
          {monthly && (
            <p className="text-lg font-bold text-white mt-xs">
              £{monthly.toLocaleString()}<span className="text-sm font-normal text-neutral-400">/month</span>
              <span className="text-sm font-normal text-neutral-400"> · all bills included</span>
            </p>
          )}
        </div>

        {/* How to secure it */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-lg mb-lg">
          <h2 className="text-base font-bold text-neutral-900 mb-xs">How to secure it 💳</h2>
          <p className="text-sm text-neutral-600 mb-md leading-relaxed">
            To take this room off the market, we need a holding deposit of{' '}
            <strong className="text-neutral-900">
              one week&apos;s rent {weekly ? `— £${gbp(weekly)}` : ''}
            </strong>.
            Don&apos;t worry, this is deducted from your final balance — it&apos;s not an extra fee.
          </p>
          <p className="text-sm text-neutral-600 leading-relaxed">
            Please pay by bank transfer using the details below, then let us know once sent.
            A screenshot of the confirmation is helpful but not required.
          </p>
        </div>

        {/* Bank details */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-lg mb-lg">
          <h2 className="text-base font-bold text-neutral-900 mb-md">Bank transfer details</h2>
          <div className="space-y-0">
            <CopyRow label="Account name" value={ACCOUNT_NAME} id="name" />
            <CopyRow label="Sort code" value={SORT_CODE} id="sort" />
            <CopyRow label="Account number" value={ACCOUNT_NUMBER} id="acc" />
            <CopyRow label="Payment reference" value={ref} id="ref" />
            {weekly && (
              <CopyRow label="Amount" value={`£${gbp(weekly)}`} id="amount" />
            )}
          </div>
          {weekly && (
            <div className="mt-md bg-neutral-50 rounded-xl p-md border border-neutral-200">
              <p className="text-xs text-neutral-500 mb-xs">How we calculate the holding deposit</p>
              <p className="text-xs text-neutral-600">
                Monthly rent (£{monthly?.toLocaleString()}) × 12 ÷ 52 = <strong>£{gbp(weekly)} per week</strong>
              </p>
            </div>
          )}
        </div>

        {/* I've paid */}
        {applicantId && (
          <div className="bg-white rounded-2xl border-2 border-neutral-900 p-lg mb-lg">
            {paidState === 'done' ? (
              <div className="text-center">
                <div className="text-4xl mb-sm">🎉</div>
                <p className="text-lg font-bold text-neutral-900">Thank you for reserving {roomName ? roomName : 'your room'}!</p>
                <p className="text-sm text-neutral-700 mt-xs">
                  We&apos;re so excited to welcome you on board. We&apos;ll check your holding deposit has reached our account
                  and confirm by email with your receipt — the room is held for you while we do.
                </p>
                <p className="text-sm text-neutral-600 mt-sm">Here&apos;s what happens now 👇</p>
              </div>
            ) : (
              <>
                <h2 className="text-base font-bold text-neutral-900 mb-xs">Sent the holding deposit?</h2>
                <p className="text-sm text-neutral-600 mb-md">Let us know here as soon as the transfer has gone, so we can take the room off the market.</p>
                <input
                  value={paidNote}
                  onChange={e => setPaidNote(e.target.value)}
                  placeholder="Optional: bank, time sent or anything we should know"
                  className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm mb-md"
                />
                <button
                  onClick={confirmPaid}
                  disabled={paidState === 'sending'}
                  className="w-full rounded-xl bg-neutral-900 py-md text-sm font-bold text-white hover:bg-neutral-800 disabled:opacity-50"
                >
                  {paidState === 'sending' ? 'Letting them know…' : "✓ I've paid the holding deposit"}
                </button>
                {paidState === 'error' && (
                  <p className="text-sm text-red-700 mt-sm">That didn&apos;t go through. Please email or call us to let us know you&apos;ve paid.</p>
                )}
              </>
            )}
          </div>
        )}

        {/* So, what happens now? — our guide to the process, from securing the room to moving in */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-lg mb-lg">
          <h2 className="text-base font-bold text-neutral-900">So, what happens now?</h2>
          <p className="text-xs text-neutral-500 mb-md">The process from securing, to moving!</p>
          <ol className="space-y-md">
            {PROCESS_GUIDE.map((step, i) => {
              const done = i === 0 && paidState === 'done'
              return (
                <li key={step.title} className="flex gap-md">
                  <span className={`shrink-0 w-8 h-8 rounded-full text-base flex items-center justify-center ${done ? 'bg-green-100' : 'bg-neutral-100'}`} aria-hidden="true">
                    {done ? '✅' : step.icon}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">{step.title}{done ? ' — done!' : ''}</p>
                    <p className="text-xs text-neutral-600 leading-relaxed">
                      {i === 0 && weekly != null ? `Send £${gbp(weekly)} to the account above using the reference shown${applicantId ? ', then press “I’ve paid the holding deposit”' : ', then let us know'}. We’ll take the room off the market and reserve it for you.` : step.body}
                    </p>
                  </div>
                </li>
              )
            })}
          </ol>
          <p className="text-xs text-neutral-600 mt-md">{PROCESS_GUIDE_SIGNOFF}</p>
        </div>

        {/* Holding deposit terms — Tenant Fees Act 2019, Schedule 2 */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-lg mb-lg">
          <p className="text-xs text-amber-800 leading-relaxed">
            <strong>Important:</strong> Paying the holding deposit takes the room off the market for you while we complete
            your checks. It isn&apos;t an extra fee: it comes off the balance you pay before moving in. It is returned to you within
            7 days if we or the landlord decide not to go ahead. We may keep it only if you pull out, fail a Right to Rent
            check, give us false or misleading information, or don&apos;t take reasonable steps to sign the agreement within
            15 days (unless we agree a different date with you).
          </p>
        </div>

        {/* International */}
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-md mb-lg">
          <p className="text-xs text-blue-800 leading-relaxed">
            🌍 <strong>Paying from outside the UK?</strong> Please make sure your bank&apos;s transfer
            fees are covered on your side — we need to receive the full amount shown.
          </p>
        </div>

        {/* Contact */}
        <div className="text-center text-sm text-neutral-500 pb-xl">
          Any questions? Contact us at{' '}
          <a href="mailto:info@capitalrooms.co.uk" className="text-neutral-900 underline">
            info@capitalrooms.co.uk
          </a>{' '}
          or call{' '}
          <a href="tel:02071129163" className="text-neutral-900 underline">
            0207 112 9163
          </a>
        </div>
      </div>
    </div>
  )
}
