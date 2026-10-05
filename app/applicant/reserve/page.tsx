'use client'

// "Ready to lock it down?" — the page our offer email links to: the holding deposit, how to pay it, and what happens
// next. Look: the shared public frame (components/public/PublicShell, design "C").
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import PublicShell from '@/components/public/PublicShell'
import { PROCESS_GUIDE, PROCESS_GUIDE_SIGNOFF } from '@/lib/lettings/processGuide'

const ACCOUNT_NAME = 'Capital Rooms Ltd'
const SORT_CODE = '20-18-93'
const ACCOUNT_NUMBER = '40162574'
const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x']

export default function ReservePage() {
  const params = useSearchParams()
  const roomId = params.get('roomId')
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
    const q = applicantId ? `?a=${encodeURIComponent(applicantId)}` : ''
    fetch(`/api/applicant/room/${roomId}${q}`).then(r => (r.ok ? r.json() : null)).then(setRoom).catch(() => setRoom(null))
  }, [roomId, applicantId])

  const monthly: number | null = room?.monthly ?? null
  const weekly: number | null = room?.weekly ?? null
  const ref: string = room?.reference ?? 'HOLD'
  const propAddress: string = room?.property || ''
  const roomName: string | null = room?.name ?? null
  const firstName: string | null = room?.firstName ?? null
  const gbp = (n: number | null) => n == null ? '' : n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const copy = async (text: string, key: string) => {
    try { await navigator.clipboard.writeText(text) } catch { /* older browsers: the value is on screen to copy by hand */ }
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  const CopyRow = ({ label, value, id }: { label: string; value: string; id: string }) => (
    <div className="flex items-center justify-between gap-4 py-4" style={{ borderBottom: '1px solid #E4E0D8' }}>
      <div className="min-w-0">
        <p className="pub-eyebrow m-0">{label}</p>
        <p className="m-0 mt-1 break-all text-[17px] font-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</p>
      </div>
      <button onClick={() => copy(value, id)} className="pub-btn-ghost shrink-0">{copied === id ? 'Copied ✓' : 'Copy'}</button>
    </div>
  )

  return (
    <PublicShell label="Reservation">
      {/* Greeting */}
      <section className="mx-auto max-w-6xl px-6 pt-10 md:px-14 md:pt-14">
        <h1 className="pub-serif pub-display pub-enter m-0">
          <span className="pub-drift-l block">{firstName ? `Hi ${firstName},` : 'Hi there,'}</span>
          <span className="pub-drift-r block italic">ready to lock it down?</span>
        </h1>
      </section>

      {/* Picture + the deposit */}
      <section className="mx-auto grid max-w-6xl items-end gap-10 px-6 pt-10 md:grid-cols-2 md:gap-16 md:px-14 md:pt-16">
        <div className="pub-arch pub-arch-open mx-auto aspect-[3/4] w-full max-w-[300px] md:max-w-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="pub-zoom" src="/illustrations/tenant-home.webp" alt="Illustration: relaxing at home" style={{ objectPosition: '9% 60%' }} />
        </div>
        <div className="flex flex-col gap-4 pb-2">
          {room ? (
            <p className="pub-eyebrow m-0">{[roomName, propAddress].filter(Boolean).join(' · ')}</p>
          ) : (
            <p className="pub-eyebrow m-0">Loading your room…</p>
          )}
          <p className="pub-serif m-0 text-[26px] leading-snug md:text-[34px]">
            Hold it with a deposit of one week’s rent. While we check your references, nobody else can take it.
          </p>
          {weekly != null && (
            <div className="pub-enter-2 mt-4 flex flex-col gap-1">
              <p className="pub-eyebrow m-0">Holding deposit</p>
              <p className="pub-serif pub-figure m-0">£{gbp(weekly)}</p>
              <p className="m-0 text-[15px] leading-relaxed" style={{ color: '#4A4741' }}>
                £{monthly?.toLocaleString('en-GB')} a month × 12 ÷ 52. It isn’t an extra fee — it comes off the balance you pay before moving in.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Pay */}
      <section className="mx-auto grid max-w-6xl gap-10 px-6 pt-16 md:grid-cols-2 md:gap-16 md:px-14 md:pt-24">
        <div className="pub-rise flex flex-col gap-3">
          <h2 className="pub-serif m-0 text-[36px] leading-tight md:text-[44px]">Pay by bank transfer</h2>
          <p className="m-0 text-[15px] leading-relaxed" style={{ color: '#4A4741' }}>
            Use the details below, then let us know once it’s sent. A screenshot of the confirmation is helpful but not required.
          </p>
          <p className="m-0 text-[14px] leading-relaxed" style={{ color: '#6F6B64' }}>
            Paying from outside the UK? Please make sure your bank’s transfer fees are covered on your side — we need to receive the full amount shown.
          </p>
        </div>
        <div className="pub-rise" style={{ borderTop: '1px solid #111' }}>
          <CopyRow label="Account name" value={ACCOUNT_NAME} id="name" />
          <CopyRow label="Sort code" value={SORT_CODE} id="sort" />
          <CopyRow label="Account number" value={ACCOUNT_NUMBER} id="acc" />
          <CopyRow label="Payment reference" value={ref} id="ref" />
          {weekly != null && <CopyRow label="Amount" value={`£${gbp(weekly)}`} id="amount" />}
        </div>
      </section>

      {/* I've paid */}
      {applicantId && (
        <section className="mx-auto max-w-6xl px-6 pt-16 md:px-14">
          <div className="pub-rise p-6 md:p-10" style={{ background: '#111', color: '#F3F0EA' }}>
            {paidState === 'done' ? (
              <div className="flex flex-col gap-3">
                <p className="pub-serif m-0 text-[40px] leading-tight md:text-[56px]">Thank you{firstName ? `, ${firstName}` : ''}.</p>
                <p className="m-0 text-[16px] leading-relaxed" style={{ color: '#D8D3C8' }}>
                  We’re so excited to welcome you on board. We’ll check your holding deposit has reached our account and confirm by email with
                  your receipt — {roomName ? `${roomName} is` : 'the room is'} held for you while we do.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <h2 className="pub-serif m-0 text-[34px] leading-tight md:text-[44px]">Sent the holding deposit?</h2>
                <p className="m-0 text-[15px]" style={{ color: '#C9C4BA' }}>Let us know here as soon as the transfer has gone, so we can take the room off the market.</p>
                <input
                  value={paidNote}
                  onChange={e => setPaidNote(e.target.value)}
                  placeholder="Optional: bank, time sent or anything we should know"
                  className="pub-input"
                  style={{ color: '#F3F0EA', borderBottomColor: '#F3F0EA' }}
                />
                <button onClick={confirmPaid} disabled={paidState === 'sending'} className="pub-btn self-start"
                  style={{ background: '#F3F0EA', color: '#111' }}>
                  {paidState === 'sending' ? 'Letting us know…' : 'I’ve paid the holding deposit'}
                </button>
                {paidState === 'error' && (
                  <p className="m-0 text-[14px]" style={{ color: '#F2B8A2' }}>That didn’t go through. Please email or call us to let us know you’ve paid.</p>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* What happens next */}
      <section className="mx-auto max-w-6xl px-6 pt-16 md:px-14 md:pt-24">
        <h2 className="pub-serif m-0 text-[36px] leading-tight md:text-[44px]">So, what happens now?</h2>
        <p className="pub-eyebrow m-0 mt-2">From securing, to moving in</p>
        <ol className="m-0 mt-6 grid list-none p-0 md:grid-cols-2 md:gap-x-16">
          {PROCESS_GUIDE.map((step, i) => {
            const done = i === 0 && paidState === 'done'
            return (
              <li key={step.title} className="pub-rise flex gap-4 py-5" style={{ borderTop: i < 2 ? '1px solid #111' : '1px solid #D9D5CD' }}>
                <span className="pub-serif w-10 shrink-0 text-[26px] italic leading-none">{ROMAN[i] ?? i + 1}.</span>
                <div className="flex flex-col gap-1">
                  <p className="m-0 text-[16px] font-semibold">{step.title}{done ? ' — done' : ''}</p>
                  <p className="m-0 text-[14px] leading-relaxed" style={{ color: '#4A4741' }}>
                    {i === 0 && weekly != null ? `Send £${gbp(weekly)} to the account above using the reference shown${applicantId ? ', then press “I’ve paid the holding deposit”' : ', then let us know'}. We’ll take the room off the market and reserve it for you.` : step.body}
                  </p>
                </div>
              </li>
            )
          })}
        </ol>
        <p className="m-0 mt-6 text-[15px]" style={{ color: '#4A4741' }}>{PROCESS_GUIDE_SIGNOFF}</p>
      </section>

      {/* Holding deposit terms — Tenant Fees Act 2019, Schedule 2 */}
      <section className="mx-auto max-w-6xl px-6 pt-14 md:px-14">
        <p className="m-0 max-w-3xl text-[13px] leading-relaxed" style={{ color: '#4A4741', borderLeft: '1px solid #111', paddingLeft: 16 }}>
          <strong style={{ color: '#111' }}>Important:</strong> Paying the holding deposit takes the room off the market for you while we complete
          your checks. It isn’t an extra fee: it comes off the balance you pay before moving in. It is returned to you within
          7 days if we or the landlord decide not to go ahead. We may keep it only if you pull out, fail a Right to Rent
          check, give us false or misleading information, or don’t take reasonable steps to sign the agreement within
          15 days (unless we agree a different date with you).
        </p>
      </section>

      {/* Contact */}
      <section className="mx-auto max-w-6xl px-6 pb-16 pt-10 md:px-14">
        <p className="m-0 text-[15px]">
          Any questions? Email <a className="pub-link" href="mailto:info@capitalrooms.co.uk">info@capitalrooms.co.uk</a> or call{' '}
          <a className="pub-link" href="tel:02071129163">0207 112 9163</a>.
        </p>
      </section>
    </PublicShell>
  )
}
