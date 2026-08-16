'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import Link from 'next/link'

interface SafetyCheck {
  id: string
  check_type: 'fire_door' | 'smoke_alarm'
  request_sent_at: string
  response_received_at: string | null
  tenant_response: string | null
  issue_type: string | null
  issue_description: string | null
}

const ISSUE_TYPES = {
  fire_door: [
    { value: 'door_not_closing', label: 'Door not closing properly' },
    { value: 'strike_plate_loose', label: 'Strike plate loose' },
    { value: 'frame_damaged', label: 'Frame damaged' },
    { value: 'hinges_broken', label: 'Hinges broken' },
    { value: 'latch_broken', label: 'Latch broken' },
    { value: 'other', label: 'Other issue' },
  ],
  smoke_alarm: [
    { value: 'battery_low', label: 'Battery low/beeping' },
    { value: 'not_working', label: 'Alarm not working' },
    { value: 'glass_dirty', label: 'Glass/sensor dirty' },
    { value: 'physically_damaged', label: 'Physically damaged' },
    { value: 'missing', label: 'Alarm missing' },
    { value: 'other', label: 'Other issue' },
  ],
}

export default function SafetyChecksPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [checks, setChecks] = useState<SafetyCheck[]>([])
  const [loading, setLoading] = useState(true)
  const [respondingTo, setRespondingTo] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    response: 'confirmed_ok',
    issue_type: '',
    issue_description: '',
  })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      if (!data || data.assignment?.role !== 'tenant') {
        router.push('/login')
        return
      }
      setUser(data.user)

      const supabase = createClient()
      const tenantId = data.id

      // Fetch active safety checks for this tenant
      const { data: checksData } = await supabase
        .from('tenant_self_checks')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('request_sent_at', { ascending: false })

      setChecks(checksData || [])
      setLoading(false)
    }
    init()
  }, [router])

  async function handleSubmitResponse(checkId: string) {
    if (formData.response === 'issue_reported' && !formData.issue_type) {
      alert('Please select an issue type')
      return
    }

    setSubmitting(true)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('tenant_self_checks')
        .update({
          response_received_at: new Date().toISOString(),
          tenant_response: formData.response,
          issue_type: formData.response === 'issue_reported' ? formData.issue_type : null,
          issue_description: formData.response === 'issue_reported' ? formData.issue_description : null,
        })
        .eq('id', checkId)

      if (error) throw error

      alert('✅ Response recorded. Thank you!')
      setRespondingTo(null)
      setFormData({ response: 'confirmed_ok', issue_type: '', issue_description: '' })

      // Refresh checks
      const { data: checksData } = await supabase
        .from('tenant_self_checks')
        .select('*')
        .eq('tenant_id', user.id)
        .order('request_sent_at', { ascending: false })

      setChecks(checksData || [])
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="flex items-center justify-center min-h-screen">Loading...</div>

  const pendingChecks = checks.filter((c) => !c.response_received_at)
  const completedChecks = checks.filter((c) => c.response_received_at)

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar right={<Link href="/tenant" className="text-sm font-bold text-white">← Dashboard</Link>} />

      <main className="mx-auto max-w-2xl px-lg py-2xl">
        <h1 className="text-3xl font-bold text-neutral-900 mb-lg">🏠 Safety Checks</h1>

        {/* Pending Checks */}
        {pendingChecks.length > 0 && (
          <section className="mb-3xl">
            <h2 className="text-xl font-bold text-neutral-900 mb-md">⏰ Checks Awaiting Your Response</h2>
            <div className="space-y-md">
              {pendingChecks.map((check) => (
                <div
                  key={check.id}
                  className="rounded-2xl border-2 border-blue-300 bg-blue-50 p-lg"
                >
                  <div className="flex items-start justify-between gap-md mb-md">
                    <div>
                      <h3 className="font-bold text-neutral-900 text-lg">
                        {check.check_type === 'fire_door' ? '🚪' : '🔔'}{' '}
                        {check.check_type === 'fire_door' ? 'Fire Door Check' : 'Smoke Alarm Check'}
                      </h3>
                      <p className="text-sm text-neutral-600 mt-xs">
                        Requested {new Date(check.request_sent_at).toLocaleDateString('en-GB')}
                      </p>
                    </div>
                  </div>

                  {check.check_type === 'fire_door' ? (
                    <p className="text-sm text-neutral-700 mb-lg">
                      Please check that your room's fire door closes properly and latches securely.
                    </p>
                  ) : (
                    <p className="text-sm text-neutral-700 mb-lg">
                      Please test your smoke alarm by pressing the test button. You should hear it beeping.
                    </p>
                  )}

                  {respondingTo === check.id ? (
                    <div className="space-y-md">
                      <div>
                        <label className="block text-sm font-semibold text-neutral-900 mb-sm">
                          Is everything OK?
                        </label>
                        <div className="space-y-sm">
                          <label className="flex items-center gap-sm cursor-pointer">
                            <input
                              type="radio"
                              name="response"
                              value="confirmed_ok"
                              checked={formData.response === 'confirmed_ok'}
                              onChange={(e) => setFormData({ ...formData, response: e.target.value })}
                              className="cursor-pointer"
                            />
                            <span className="text-sm text-neutral-900">✅ Yes, everything is fine</span>
                          </label>
                          <label className="flex items-center gap-sm cursor-pointer">
                            <input
                              type="radio"
                              name="response"
                              value="issue_reported"
                              checked={formData.response === 'issue_reported'}
                              onChange={(e) => setFormData({ ...formData, response: e.target.value })}
                              className="cursor-pointer"
                            />
                            <span className="text-sm text-neutral-900">⚠️ There's an issue</span>
                          </label>
                        </div>
                      </div>

                      {formData.response === 'issue_reported' && (
                        <div className="space-y-md">
                          <div>
                            <label className="block text-sm font-semibold text-neutral-900 mb-sm">
                              What's the issue?
                            </label>
                            <select
                              value={formData.issue_type}
                              onChange={(e) => setFormData({ ...formData, issue_type: e.target.value })}
                              className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm"
                            >
                              <option value="">Select an issue...</option>
                              {ISSUE_TYPES[check.check_type as keyof typeof ISSUE_TYPES].map((issue) => (
                                <option key={issue.value} value={issue.value}>
                                  {issue.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-sm font-semibold text-neutral-900 mb-sm">
                              Tell us more (optional)
                            </label>
                            <textarea
                              value={formData.issue_description}
                              onChange={(e) => setFormData({ ...formData, issue_description: e.target.value })}
                              className="w-full rounded-xl border border-neutral-300 px-md py-sm text-sm"
                              rows={3}
                              placeholder="Any additional details..."
                            />
                          </div>
                        </div>
                      )}

                      <div className="flex gap-md pt-md">
                        <button
                          onClick={() => handleSubmitResponse(check.id)}
                          disabled={submitting}
                          className="flex-1 rounded-xl bg-blue-600 px-md py-sm text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          {submitting ? 'Saving...' : '✓ Submit'}
                        </button>
                        <button
                          onClick={() => {
                            setRespondingTo(null)
                            setFormData({ response: 'confirmed_ok', issue_type: '', issue_description: '' })
                          }}
                          className="flex-1 rounded-xl border border-neutral-300 px-md py-sm text-sm font-semibold hover:bg-neutral-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setRespondingTo(check.id)}
                      className="w-full rounded-xl bg-blue-600 px-md py-sm text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      Respond Now
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Completed Checks */}
        {completedChecks.length > 0 && (
          <section>
            <h2 className="text-xl font-bold text-neutral-900 mb-md">✅ Completed Checks</h2>
            <div className="space-y-sm">
              {completedChecks.map((check) => (
                <div
                  key={check.id}
                  className="rounded-lg border border-neutral-200 bg-white p-md"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-neutral-900">
                        {check.check_type === 'fire_door' ? '🚪' : '🔔'}{' '}
                        {check.check_type === 'fire_door' ? 'Fire Door' : 'Smoke Alarm'}
                      </p>
                      <p className="text-sm text-neutral-600 mt-xs">
                        {new Date(check.response_received_at!).toLocaleDateString('en-GB')}
                      </p>
                      {check.issue_type && (
                        <p className="text-xs text-red-600 mt-sm font-medium">Issue reported: {check.issue_type}</p>
                      )}
                    </div>
                    <span className="text-lg">
                      {check.tenant_response === 'confirmed_ok' ? '✅' : '⚠️'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {pendingChecks.length === 0 && completedChecks.length === 0 && (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center">
            <p className="text-sm text-neutral-600">No safety checks at the moment</p>
          </div>
        )}
      </main>
    </div>
  )
}
