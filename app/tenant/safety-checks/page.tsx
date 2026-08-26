'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading'

interface SafetyCheck {
  id: string
  check_type: 'fire_door' | 'smoke_alarm'
  request_sent_at: string
  tenant_response: string | null
  issue_type: string | null
  issue_description: string | null
  rooms?: { name: string } | null
  properties?: { name: string; address: string } | null
}

interface IssueType {
  issue_key: string
  display_name: string
  category: string
}

const checkTypeLabels: Record<string, { title: string; icon: string; description: string }> = {
  fire_door: {
    title: 'Fire Door Safety Check',
    icon: '🚪',
    description: 'Please check that your room\'s fire door closes properly and latches securely.',
  },
  smoke_alarm: {
    title: 'Smoke Alarm Safety Check',
    icon: '🔔',
    description: 'Please test your smoke alarm and check that the battery is working.',
  },
}

export default function TenantSafetyChecksPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [checks, setChecks] = useState<SafetyCheck[]>([])
  const [issueTypes, setIssueTypes] = useState<Record<string, IssueType[]>>({})
  const [responding, setResponding] = useState<string | null>(null)
  const [response, setResponse] = useState({
    status: 'confirmed_ok' as 'confirmed_ok' | 'issue_reported',
    issueType: '',
    issueDescription: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      if (!data) {
        router.push('/login')
        return
      }

      // Load active safety checks for this tenant
      const { data: checksData } = await supabase
        .from('tenant_self_checks')
        .select('*, rooms(name), properties(name, address)')
        .eq('response_received_at', null)
        .order('request_sent_at', { ascending: false })

      if (checksData) {
        setChecks(checksData as any)
      }

      // Load issue types
      const { data: issuesData } = await supabase
        .from('tenant_self_check_issues')
        .select('*')

      if (issuesData) {
        const byCategory = issuesData.reduce((acc: Record<string, IssueType[]>, issue: IssueType) => {
          if (!acc[issue.category]) acc[issue.category] = []
          acc[issue.category].push(issue)
          return acc
        }, {})
        setIssueTypes(byCategory)
      }

      setLoading(false)
    }

    init()
  }, [router])

  async function handleRespond(checkId: string) {
    if (!response.status) {
      setError('Please select a response')
      return
    }

    if (response.status === 'issue_reported' && !response.issueType) {
      setError('Please select an issue type')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const updateData: any = {
        tenant_response: response.status,
        response_received_at: new Date().toISOString(),
      }

      if (response.status === 'issue_reported') {
        updateData.issue_type = response.issueType
        updateData.issue_description = response.issueDescription || null
      }

      const { error: updateError } = await supabase
        .from('tenant_self_checks')
        .update(updateData)
        .eq('id', checkId)

      if (updateError) throw updateError

      setSuccess('✓ Your response has been recorded')
      setResponding(null)
      setResponse({ status: 'confirmed_ok', issueType: '', issueDescription: '' })

      // Reload checks
      const { data: checksData } = await supabase
        .from('tenant_self_checks')
        .select('*, rooms(name), properties(name, address)')
        .eq('response_received_at', null)
        .order('request_sent_at', { ascending: false })

      if (checksData) {
        setChecks(checksData as any)
      }

      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit response')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <GenericPageSkeleton />

  const activeCheck = responding ? checks.find(c => c.id === responding) : null

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar right={<BackButton href="/tenant" />} />

      <main className="mx-auto max-w-2xl px-lg py-lg">
        <div className="mb-3xl">
          <h1 className="text-3xl font-bold text-neutral-900">Safety Checks</h1>
          <p className="mt-sm text-neutral-600">
            {checks.length === 0
              ? 'No active safety checks right now.'
              : `You have ${checks.length} safety check${checks.length === 1 ? '' : 's'} to complete.`}
          </p>
        </div>

        {error && (
          <div className="mb-lg rounded-lg bg-red-50 border border-red-200 p-md text-sm text-red-800">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-lg rounded-lg bg-green-50 border border-green-200 p-md text-sm text-green-800">
            {success}
          </div>
        )}

        {checks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-xl text-center">
            <p className="text-sm text-neutral-500">No active safety checks</p>
          </div>
        ) : (
          <div className="space-y-lg">
            {checks.map((check) => (
              <div key={check.id} className="rounded-lg border border-neutral-200 bg-white p-lg">
                <div className="flex items-start justify-between gap-lg mb-lg">
                  <div>
                    <div className="flex items-center gap-sm mb-sm">
                      <span className="text-3xl">
                        {checkTypeLabels[check.check_type]?.icon}
                      </span>
                      <div>
                        <h3 className="font-bold text-neutral-900">
                          {checkTypeLabels[check.check_type]?.title}
                        </h3>
                        <p className="text-sm text-neutral-600 mt-xs">
                          {check.properties?.name} • {check.rooms?.name}
                        </p>
                      </div>
                    </div>
                    <p className="text-sm text-neutral-700 mt-md">
                      {checkTypeLabels[check.check_type]?.description}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold px-md py-xs bg-yellow-100 text-yellow-800 rounded-full">
                    Awaiting response
                  </span>
                </div>

                <button
                  onClick={() => setResponding(check.id)}
                  className="w-full rounded-lg bg-neutral-900 text-white font-semibold py-md text-sm hover:bg-neutral-800 transition"
                >
                  Respond to check
                </button>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Response Modal */}
      {activeCheck && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-lg">
          <div className="w-full max-w-lg rounded-2xl bg-white p-lg shadow-xl">
            <div className="flex items-center justify-between mb-lg">
              <h2 className="text-xl font-bold text-neutral-900">
                {checkTypeLabels[activeCheck.check_type]?.title}
              </h2>
              <button
                onClick={() => setResponding(null)}
                disabled={submitting}
                className="text-neutral-400 hover:text-neutral-900 text-2xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="space-y-lg mb-lg">
              {/* Response Type */}
              <div>
                <label className="block text-sm font-bold text-neutral-700 mb-md">
                  What's the status?
                </label>
                <div className="space-y-sm">
                  <button
                    onClick={() => {
                      setResponse({ status: 'confirmed_ok', issueType: '', issueDescription: '' })
                    }}
                    className={`w-full px-lg py-md rounded-lg border-2 text-left transition ${
                      response.status === 'confirmed_ok'
                        ? 'border-green-600 bg-green-50'
                        : 'border-neutral-200 hover:border-neutral-300'
                    }`}
                  >
                    <p className="font-semibold text-neutral-900">✓ Everything looks fine</p>
                    <p className="text-xs text-neutral-600 mt-xs">The {activeCheck.check_type.includes('fire') ? 'door' : 'alarm'} is working properly</p>
                  </button>

                  <button
                    onClick={() => {
                      setResponse({ status: 'issue_reported', issueType: '', issueDescription: '' })
                    }}
                    className={`w-full px-lg py-md rounded-lg border-2 text-left transition ${
                      response.status === 'issue_reported'
                        ? 'border-red-600 bg-red-50'
                        : 'border-neutral-200 hover:border-neutral-300'
                    }`}
                  >
                    <p className="font-semibold text-neutral-900">⚠️ There's an issue</p>
                    <p className="text-xs text-neutral-600 mt-xs">I've found something that needs attention</p>
                  </button>
                </div>
              </div>

              {/* Issue Details (only if issue reported) */}
              {response.status === 'issue_reported' && (
                <>
                  <div>
                    <label className="block text-sm font-bold text-neutral-700 mb-md">
                      What's the issue?
                    </label>
                    <select
                      value={response.issueType}
                      onChange={(e) => setResponse({ ...response, issueType: e.target.value })}
                      className="w-full rounded-lg border border-neutral-300 px-lg py-md text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                    >
                      <option value="">Select an issue</option>
                      {issueTypes[activeCheck.check_type]?.map((issue) => (
                        <option key={issue.issue_key} value={issue.issue_key}>
                          {issue.display_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-neutral-700 mb-md">
                      Additional details (optional)
                    </label>
                    <textarea
                      value={response.issueDescription}
                      onChange={(e) => setResponse({ ...response, issueDescription: e.target.value })}
                      placeholder="Describe what you observed..."
                      rows={3}
                      className="w-full rounded-lg border border-neutral-300 px-lg py-md text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex gap-md">
              <button
                onClick={() => setResponding(null)}
                disabled={submitting}
                className="flex-1 rounded-lg border border-neutral-300 px-lg py-md text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRespond(activeCheck.id)}
                disabled={submitting}
                className="flex-1 rounded-lg bg-neutral-900 px-lg py-md text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                {submitting ? 'Submitting…' : 'Submit response'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
