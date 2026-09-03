'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const ACCOUNT_NAME = 'Capital Rooms Ltd'
const SORT_CODE = '20-18-93'
const ACCOUNT_NUMBER = '40162574'

function weeklyRent(monthly: number) {
  return Math.round((monthly * 12) / 52)
}

function buildRef(propertyCode: string | null, roomName: string | null) {
  const propPart = (propertyCode || 'CAP').toUpperCase().replace(/\s/g, '')
  const roomPart = (roomName || '').replace(/[^0-9]/g, '').padStart(2, '0')
  return `${propPart}${roomPart} RESERVE`.trim()
}

export default function ReservePage() {
  const params = useSearchParams()
  const roomId = params.get('roomId')
  const propertyId = params.get('propertyId')
  const [room, setRoom] = useState<any>(null)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    if (!roomId) return
    supabase
      .from('rooms')
      .select('id, name, current_asking_rent, properties(name, address, property_code)')
      .eq('id', roomId)
      .single()
      .then(({ data }) => setRoom(data))
  }, [roomId])

  const monthly = room?.current_asking_rent ?? null
  const weekly = monthly ? weeklyRent(monthly) : null
  const propCode = (room?.properties as any)?.property_code || null
  const roomName = room?.name || null
  const ref = buildRef(propCode, roomName)
  const propAddress = (room?.properties as any)?.address || (room?.properties as any)?.name || ''

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
              one week&apos;s rent {weekly ? `— £${weekly.toLocaleString()}` : ''}
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
              <CopyRow label="Amount" value={`£${weekly.toLocaleString()}`} id="amount" />
            )}
          </div>
          {weekly && (
            <div className="mt-md bg-neutral-50 rounded-xl p-md border border-neutral-200">
              <p className="text-xs text-neutral-500 mb-xs">How we calculate the holding deposit</p>
              <p className="text-xs text-neutral-600">
                Monthly rent (£{monthly?.toLocaleString()}) × 12 ÷ 52 = <strong>£{weekly?.toLocaleString()} per week</strong>
              </p>
            </div>
          )}
        </div>

        {/* What happens next */}
        <div className="bg-white rounded-2xl border border-neutral-200 p-lg mb-lg">
          <h2 className="text-base font-bold text-neutral-900 mb-md">What happens next</h2>
          <ol className="space-y-md">
            {[
              { n: '1', t: 'Make the transfer', d: 'Send £' + (weekly ?? '—') + ' to the account above using the reference shown.' },
              { n: '2', t: 'Let us know', d: 'Message or email us once sent — a screenshot of the confirmation helps us confirm quickly.' },
              { n: '3', t: 'Room reserved', d: 'We take the room off the market as soon as payment is confirmed.' },
              { n: '4', t: 'Online referencing', d: 'We\'ll get you started with our referencing provider, Homeppl, straight away.' },
              { n: '5', t: 'Sign & move in', d: 'Once references pass, we\'ll issue the tenancy agreement and get you a move-in date.' },
            ].map(step => (
              <li key={step.n} className="flex gap-md">
                <span className="shrink-0 w-6 h-6 rounded-full bg-neutral-900 text-white text-xs font-bold flex items-center justify-center">
                  {step.n}
                </span>
                <div>
                  <p className="text-sm font-semibold text-neutral-900">{step.t}</p>
                  <p className="text-xs text-neutral-500 leading-relaxed">{step.d}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Non-refundable notice */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-lg mb-lg">
          <p className="text-xs text-amber-800 leading-relaxed">
            <strong>Important:</strong> The holding deposit is a non-refundable commitment to the room.
            However, if Capital Rooms or the landlord can no longer let the room to you,
            it will be returned to you in full.
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
