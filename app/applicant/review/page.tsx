'use client'

// "Thank you" after an application is sent — what happens next, and "Reopen my application" while we haven't moved
// it on. Look: the shared public frame (components/public/PublicShell, design "C").
import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import PublicShell from '@/components/public/PublicShell'

const NEXT_STEPS = [
  { title: 'Application review', body: 'We’ll look over your application to make sure you’re a good fit for the house. This usually takes 1–2 working days.' },
  { title: 'Your offer', body: 'If you’re successful, we’ll email you an offer with a link to reserve the room.' },
  { title: 'Holding deposit', body: 'Lock it down! Pay one week’s rent as a holding deposit by bank transfer and we’ll take the room off the market for you.' },
  { title: 'Referencing', body: 'You’ll get an email to start your referencing online through Homeppl — they have a handy online chat if you have questions.' },
  { title: 'Signing & getting the keys', body: 'Passed the checks? We’ll email the tenancy pack to review, then an Adobe Sign email to sign. On move-in day, meet us at the property for the grand tour and key handover.' },
]
const ROMAN = ['i', 'ii', 'iii', 'iv', 'v']

export default function ReviewPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const applicantId = searchParams.get('applicantId')

  const [loading, setLoading] = useState(true)
  const [applicant, setApplicant] = useState<any>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      if (!applicantId) {
        setError('Invalid application link')
        setLoading(false)
        return
      }
      const res = await fetch(`/api/applicant/review?applicantId=${applicantId}`)
      const json = await res.json()
      if (!res.ok || !json.applicant) {
        setError(json.error || 'Could not load your application')
        setLoading(false)
        return
      }
      setApplicant(json.applicant)
      setLoading(false)
    }
    load()
  }, [applicantId])

  const wrap = 'mx-auto max-w-6xl px-6 md:px-14'

  if (loading) {
    return <PublicShell label="Application received"><p className={`${wrap} py-24 text-[16px] pub-muted`}>Loading your application…</p></PublicShell>
  }

  if (error || !applicant) {
    return (
      <PublicShell label="Application">
        <section className={`${wrap} py-20`}>
          <h1 className="pub-serif m-0 text-[44px] leading-tight">Something went wrong</h1>
          <p className="m-0 mt-4 text-[16px]">{error}</p>
          <p className="m-0 mt-4 text-[14px] pub-muted">If you think this is an error, email management@capitalrooms.co.uk with your name and we’ll sort it out.</p>
        </section>
      </PublicShell>
    )
  }

  const property = applicant.properties
  const room = applicant.rooms
  const first = applicant.first_name || String(applicant.full_name || '').split(' ')[0] || ''
  const canReopen = ['invited', 'applied'].includes(applicant.pipeline_stage) && applicant.room_id && applicant.property_id
  const where = [room?.name, property?.name].filter(Boolean).join(' · ')

  function reopen() {
    // the form loads the answers with this email, so nobody else can open them from the link alone
    try { sessionStorage.setItem(`cr-apply-email-${applicant.id}`, applicant.email ?? '') } catch { /* private mode: the form asks for it */ }
    router.push(`/applicant/apply?roomId=${applicant.room_id}&propertyId=${applicant.property_id}&edit=${applicant.id}`)
  }

  return (
    <PublicShell label="Application received">
      <section className={`${wrap} grid items-end gap-10 pt-10 md:grid-cols-2 md:gap-16 md:pt-14`}>
        <div className="flex flex-col gap-5">
          <h1 className="pub-serif pub-display pub-enter m-0">
            <span className="pub-drift-l block">Thank you,</span>
            <span className="pub-drift-r block italic">{first || 'friend'}.</span>
          </h1>
          {where && <p className="pub-eyebrow pub-enter-2 m-0">{where}</p>}
          <p className="pub-serif pub-enter-2 m-0 text-[24px] leading-snug md:text-[30px]">
            We’ve got everything we need. We’ll be in touch within 1–2 working days.
          </p>
        </div>
        <div className="pub-arch pub-arch-open mx-auto aspect-[3/4] w-full max-w-[300px] md:max-w-[420px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="pub-zoom" src="/illustrations/tenant-home.webp" alt="Illustration: relaxing at home" style={{ objectPosition: '9% 60%' }} />
        </div>
      </section>

      <section className={`${wrap} pt-16 md:pt-24`}>
        <h2 className="pub-h2">What happens next</h2>
        <ol className="m-0 mt-6 grid list-none p-0 md:grid-cols-5">
          {NEXT_STEPS.map((s, i) => (
            <li key={s.title} className="pub-rise flex gap-4 py-5 md:flex-col md:gap-2 md:pr-5" style={{ borderTop: i === 0 ? '1px solid #111' : '1px solid #D9D5CD' }}>
              <span className="pub-serif w-10 shrink-0 text-[26px] italic leading-none md:text-[32px]">{ROMAN[i]}.</span>
              <div className="flex flex-col gap-1">
                <p className="m-0 text-[16px] font-semibold">{s.title}</p>
                <p className="m-0 text-[14px] leading-relaxed" style={{ color: '#4A4741' }}>{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className={`${wrap} flex flex-col gap-3 pb-16 pt-14`}>
        {canReopen ? (
          <>
            <p className="m-0 text-[15px]" style={{ color: '#4A4741' }}>Need to change something?</p>
            <button type="button" onClick={reopen} className="pub-btn-ghost self-start">Reopen my application</button>
            <p className="m-0 max-w-xl text-[13px] pub-muted">Your answers are still there. Change what you need and send it again — it reaches us as an update, not a new application.</p>
          </>
        ) : (
          <p className="m-0 text-[15px]" style={{ color: '#4A4741' }}>Need to change something? Email us and we’ll update it for you.</p>
        )}
        <p className="m-0 mt-4 text-[15px]">
          Questions? Email <a className="pub-link" href="mailto:management@capitalrooms.co.uk">management@capitalrooms.co.uk</a> and we’ll get back to you.
        </p>
      </section>
    </PublicShell>
  )
}
