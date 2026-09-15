'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

export default function ReviewPage() {
  const searchParams = useSearchParams()
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

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-100 flex items-center justify-center">
        <p className="text-neutral-500 text-sm">Loading your application…</p>
      </div>
    )
  }

  if (error || !applicant) {
    return (
      <div className="min-h-screen bg-neutral-100 flex items-center justify-center px-4">
        <div className="bg-white rounded-xl p-8 border border-red-200 max-w-md w-full">
          <h1 className="text-lg font-bold text-red-700 mb-2">Something went wrong</h1>
          <p className="text-sm text-neutral-600">{error}</p>
          <p className="text-xs text-neutral-400 mt-4">If you think this is an error, email management@capitalrooms.co.uk with your name and we'll sort it out.</p>
        </div>
      </div>
    )
  }

  const property = applicant.properties
  const room = applicant.rooms

  return (
    <div className="min-h-screen bg-neutral-100 py-10 px-4">
      <div className="mx-auto max-w-xl space-y-4">

        {/* Confirmation header */}
        <div className="bg-white rounded-xl p-6 border border-green-200">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">✓</span>
            <div>
              <h1 className="text-xl font-bold text-neutral-900">Application received</h1>
              <p className="text-sm text-neutral-500">
                {property?.name ? `${property.name}${room?.name ? ` · ${room.name}` : ''}` : 'Capital Rooms'}
              </p>
            </div>
          </div>
          <p className="text-sm text-neutral-600">
            Thanks, <strong>{applicant.full_name}</strong>. We've got everything we need. We'll be in touch within 1–2 working days.
          </p>
        </div>

        {/* Your details */}
        <div className="bg-white rounded-xl p-6 border border-neutral-200">
          <h2 className="text-sm font-bold text-neutral-700 uppercase tracking-wide mb-4">Your details</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-neutral-500 text-xs">Name</dt>
              <dd className="font-medium text-neutral-900">{applicant.full_name}</dd>
            </div>
            <div>
              <dt className="text-neutral-500 text-xs">Email</dt>
              <dd className="font-medium text-neutral-900 truncate">{applicant.email}</dd>
            </div>
            {applicant.profession && (
              <div>
                <dt className="text-neutral-500 text-xs">Profession</dt>
                <dd className="font-medium text-neutral-900">{applicant.profession}</dd>
              </div>
            )}
            {applicant.preferred_start_date && (
              <div>
                <dt className="text-neutral-500 text-xs">Preferred start</dt>
                <dd className="font-medium text-neutral-900">
                  {new Date(applicant.preferred_start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* What happens next */}
        <div className="bg-white rounded-xl p-6 border border-neutral-200">
          <h2 className="text-sm font-bold text-neutral-700 uppercase tracking-wide mb-4">What happens next</h2>
          <ol className="space-y-4">
            {[
              {
                n: '1',
                title: 'Application review',
                body: "We'll look over your application to make sure you're a good fit for the house. This usually takes 1–2 working days.",
              },
              {
                n: '2',
                title: 'Offer & documents',
                body: "If you're successful, we'll send you an offer along with the tenancy agreement, renters' rights guide, and property certificates.",
              },
              {
                n: '3',
                title: 'Holding deposit',
                body: "You'll pay one week's rent as a holding deposit by bank transfer. This reserves the room for you while referencing is completed.",
              },
              {
                n: '4',
                title: 'Referencing',
                body: "We run standard referencing checks through our provider (Homeppl). Once those clear, the room is yours.",
              },
            ].map(step => (
              <li key={step.n} className="flex gap-4">
                <div className="w-7 h-7 rounded-full bg-neutral-900 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                  {step.n}
                </div>
                <div>
                  <p className="font-semibold text-neutral-900 text-sm">{step.title}</p>
                  <p className="text-sm text-neutral-600 mt-0.5">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Contact */}
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-6 py-4 text-sm text-neutral-600">
          Questions? Email{' '}
          <a href="mailto:management@capitalrooms.co.uk" className="font-semibold text-neutral-900 hover:underline">
            management@capitalrooms.co.uk
          </a>
          {' '}and we'll get back to you.
        </div>
      </div>
    </div>
  )
}
