'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function ReviewPage() {
  const searchParams = useSearchParams()
  const supabase = createClient()
  const applicantId = searchParams.get('applicantId')

  const [loading, setLoading] = useState(true)
  const [applicant, setApplicant] = useState<any>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadApplicant() {
      if (!applicantId) {
        setError('Invalid application ID')
        setLoading(false)
        return
      }

      const { data, error: fetchError } = await supabase
        .from('applicants')
        .select('*')
        .eq('id', applicantId)
        .single()

      if (fetchError || !data) {
        setError('Could not find your application')
        setLoading(false)
        return
      }

      setApplicant(data)
      setLoading(false)
    }

    loadApplicant()
  }, [applicantId, supabase])

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-100 flex items-center justify-center">
        <div className="text-neutral-600">Loading your application...</div>
      </div>
    )
  }

  if (error || !applicant) {
    return (
      <div className="min-h-screen bg-neutral-100 flex items-center justify-center px-lg">
        <div className="bg-white rounded-lg p-lg border border-red-300 max-w-md">
          <h1 className="text-lg font-bold text-red-700 mb-sm">Error</h1>
          <p className="text-sm text-neutral-600">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-100 py-xl px-lg">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="bg-white rounded-lg p-lg mb-lg border border-neutral-200">
          <h1 className="text-2xl font-bold text-neutral-900 mb-sm">
            Application Received ✓
          </h1>
          <p className="text-sm text-neutral-600">
            Thanks for completing your application. Here's what happens next.
          </p>
        </div>

        {/* Application Summary */}
        <div className="bg-white rounded-lg p-lg mb-lg border border-neutral-200">
          <h2 className="text-lg font-semibold text-neutral-900 mb-lg">
            Your Details
          </h2>

          <div className="grid grid-cols-2 gap-lg text-sm">
            <div>
              <div className="text-neutral-600 font-medium mb-xs">Name</div>
              <div className="text-neutral-900">{applicant.name}</div>
            </div>
            <div>
              <div className="text-neutral-600 font-medium mb-xs">Email</div>
              <div className="text-neutral-900">{applicant.email}</div>
            </div>
            <div>
              <div className="text-neutral-600 font-medium mb-xs">
                Profession
              </div>
              <div className="text-neutral-900">{applicant.profession}</div>
            </div>
            <div>
              <div className="text-neutral-600 font-medium mb-xs">
                Start Date
              </div>
              <div className="text-neutral-900">
                {applicant.preferred_start_date
                  ? new Date(applicant.preferred_start_date).toLocaleDateString()
                  : 'Not specified'}
              </div>
            </div>
            {applicant.bio && (
              <div className="col-span-2">
                <div className="text-neutral-600 font-medium mb-xs">
                  About You
                </div>
                <div className="text-neutral-900">{applicant.bio}</div>
              </div>
            )}
          </div>
        </div>

        {/* Next Steps */}
        <div className="bg-white rounded-lg p-lg border border-neutral-200">
          <h2 className="text-lg font-semibold text-neutral-900 mb-lg">
            What's Next?
          </h2>

          <div className="space-y-md">
            <div className="flex gap-md">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-neutral-900 text-white text-sm font-semibold">
                  1
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-neutral-900 mb-xs">
                  Application Review
                </h3>
                <p className="text-sm text-neutral-600">
                  We'll review your application to make sure you're a good fit
                  for the house. This usually takes 1-2 days.
                </p>
              </div>
            </div>

            <div className="flex gap-md">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-neutral-900 text-white text-sm font-semibold">
                  2
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-neutral-900 mb-xs">
                  Documents & Signature
                </h3>
                <p className="text-sm text-neutral-600">
                  We'll send you important documents including the tenancy
                  agreement, renters' rights guide, and certificates. You'll
                  digitally sign the holding deposit form.
                </p>
              </div>
            </div>

            <div className="flex gap-md">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-neutral-900 text-white text-sm font-semibold">
                  3
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-neutral-900 mb-xs">
                  Holding Deposit
                </h3>
                <p className="text-sm text-neutral-600">
                  You'll make a holding deposit payment by bank transfer (one
                  week's rent). This reserves the room for you.
                </p>
              </div>
            </div>

            <div className="flex gap-md">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-neutral-900 text-white text-sm font-semibold">
                  4
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-neutral-900 mb-xs">
                  Referencing
                </h3>
                <p className="text-sm text-neutral-600">
                  We'll run referencing checks with our provider (Homeppl). This
                  is a standard part of the renting process.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Contact Info */}
        <div className="bg-neutral-50 rounded-lg p-lg border border-neutral-200 mt-lg text-sm text-neutral-600">
          <p className="mb-sm">
            Have questions? Contact us at{' '}
            <a
              href="mailto:management@capitalrooms.co.uk"
              className="font-medium text-neutral-900 hover:underline"
            >
              management@capitalrooms.co.uk
            </a>
          </p>
          <p>
            We look forward to hearing from you and hopefully welcoming you to
            the house!
          </p>
        </div>
      </div>
    </div>
  )
}
