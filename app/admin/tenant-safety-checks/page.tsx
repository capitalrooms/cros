'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import Link from 'next/link'

interface SafetyCheckResponse {
  id: string
  tenancy_id: string
  property_id: string
  room_id: string
  check_type: 'fire_door' | 'smoke_alarm'
  request_sent_at: string
  response_received_at: string | null
  tenant_response: string | null
  issue_type: string | null
  issue_description: string | null
  tenant_name?: string
  property_name?: string
  room_name?: string
}

export default function TenantSafetyChecksPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [checks, setChecks] = useState<SafetyCheckResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'fire_door' | 'smoke_alarm'>('all')
  const [responseFilter, setResponseFilter] = useState<'all' | 'pending' | 'ok' | 'issues'>('all')

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      if (!data || !['administrator', 'landlord', 'admin'].includes(data.assignment?.role)) {
        router.push('/login')
        return
      }
      setUser(data.user)

      const supabase = createClient()

      // Fetch all tenant self-checks with tenant/property/room names
      const { data: checksData } = await supabase
        .from('tenant_self_checks')
        .select(`
          *,
          tenancies (
            tenant_id,
            room_id
          ),
          properties (
            name
          ),
          rooms (
            name
          ),
          people (
            name
          )
        `)
        .order('request_sent_at', { ascending: false })

      // Transform data
      const transformed = (checksData || []).map((check: any) => ({
        id: check.id,
        tenancy_id: check.tenancy_id,
        property_id: check.property_id,
        room_id: check.room_id,
        check_type: check.check_type,
        request_sent_at: check.request_sent_at,
        response_received_at: check.response_received_at,
        tenant_response: check.tenant_response,
        issue_type: check.issue_type,
        issue_description: check.issue_description,
        property_name: check.properties?.name,
        room_name: check.rooms?.name,
        tenant_name: check.people?.name,
      }))

      setChecks(transformed)
      setLoading(false)
    }
    init()
  }, [router])

  const filteredChecks = checks.filter((check) => {
    if (filter !== 'all' && check.check_type !== filter) return false
    if (responseFilter === 'pending' && check.response_received_at) return false
    if (responseFilter === 'ok' && check.tenant_response !== 'confirmed_ok') return false
    if (responseFilter === 'issues' && check.tenant_response !== 'issue_reported') return false
    return true
  })

  const pendingCount = checks.filter((c) => !c.response_received_at).length
  const issuesCount = checks.filter((c) => c.tenant_response === 'issue_reported').length

  if (loading) return <div className="flex items-center justify-center min-h-screen">Loading...</div>

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar right={<Link href="/admin" className="text-sm font-bold text-white">← Admin</Link>} />

      <main className="mx-auto max-w-4xl px-lg py-2xl">
        <h1 className="text-3xl font-bold text-neutral-900 mb-lg">🏠 Tenant Safety Checks</h1>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-md mb-3xl">
          <div className="rounded-2xl border-2 border-blue-200 bg-blue-50 p-md">
            <p className="text-xs font-semibold text-neutral-600 uppercase">Pending Response</p>
            <p className="text-2xl font-bold text-blue-600 mt-xs">{pendingCount}</p>
          </div>
          <div className="rounded-2xl border-2 border-red-200 bg-red-50 p-md">
            <p className="text-xs font-semibold text-neutral-600 uppercase">Issues Reported</p>
            <p className="text-2xl font-bold text-red-600 mt-xs">{issuesCount}</p>
          </div>
          <div className="rounded-2xl border-2 border-green-200 bg-green-50 p-md">
            <p className="text-xs font-semibold text-neutral-600 uppercase">Total Checks</p>
            <p className="text-2xl font-bold text-green-600 mt-xs">{checks.length}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-3xl space-y-md">
          <div>
            <label className="block text-sm font-semibold text-neutral-900 mb-sm">Check Type</label>
            <div className="flex gap-sm">
              {(['all', 'fire_door', 'smoke_alarm'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setFilter(type)}
                  className={`flex-1 rounded-lg px-md py-sm text-sm font-semibold transition-colors ${
                    filter === type
                      ? 'bg-blue-600 text-white'
                      : 'border border-neutral-300 text-neutral-900 hover:bg-neutral-50'
                  }`}
                >
                  {type === 'all' ? 'All' : type === 'fire_door' ? '🚪 Fire Door' : '🔔 Smoke Alarm'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-neutral-900 mb-sm">Response Status</label>
            <div className="flex gap-sm">
              {(['all', 'pending', 'ok', 'issues'] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => setResponseFilter(status)}
                  className={`flex-1 rounded-lg px-md py-sm text-sm font-semibold transition-colors ${
                    responseFilter === status
                      ? 'bg-blue-600 text-white'
                      : 'border border-neutral-300 text-neutral-900 hover:bg-neutral-50'
                  }`}
                >
                  {status === 'all'
                    ? 'All'
                    : status === 'pending'
                      ? '⏰ Pending'
                      : status === 'ok'
                        ? '✅ All Good'
                        : '⚠️ Issues'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Results Table */}
        <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden">
          {filteredChecks.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-neutral-200 bg-neutral-50">
                  <tr>
                    <th className="px-md py-sm text-left font-semibold text-neutral-900">Tenant</th>
                    <th className="px-md py-sm text-left font-semibold text-neutral-900">Property / Room</th>
                    <th className="px-md py-sm text-left font-semibold text-neutral-900">Check Type</th>
                    <th className="px-md py-sm text-left font-semibold text-neutral-900">Sent</th>
                    <th className="px-md py-sm text-left font-semibold text-neutral-900">Response</th>
                    <th className="px-md py-sm text-left font-semibold text-neutral-900">Issue</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredChecks.map((check, idx) => (
                    <tr key={check.id} className={idx > 0 ? 'border-t border-neutral-200' : ''}>
                      <td className="px-md py-sm text-neutral-900 font-medium">{check.tenant_name || 'Unknown'}</td>
                      <td className="px-md py-sm text-neutral-600">
                        {check.property_name} / {check.room_name}
                      </td>
                      <td className="px-md py-sm">
                        <span className="text-sm">
                          {check.check_type === 'fire_door' ? '🚪 Fire Door' : '🔔 Smoke Alarm'}
                        </span>
                      </td>
                      <td className="px-md py-sm text-neutral-600 text-xs">
                        {new Date(check.request_sent_at).toLocaleDateString('en-GB')}
                      </td>
                      <td className="px-md py-sm">
                        {!check.response_received_at ? (
                          <span className="text-xs font-semibold text-orange-600">⏰ Awaiting</span>
                        ) : check.tenant_response === 'confirmed_ok' ? (
                          <span className="text-xs font-semibold text-green-600">✅ Confirmed OK</span>
                        ) : check.tenant_response === 'issue_reported' ? (
                          <span className="text-xs font-semibold text-red-600">⚠️ Issue Reported</span>
                        ) : (
                          <span className="text-xs font-semibold text-neutral-600">No Response</span>
                        )}
                      </td>
                      <td className="px-md py-sm text-neutral-600 text-xs">
                        {check.issue_type ? (
                          <div>
                            <p className="font-medium">{check.issue_type}</p>
                            {check.issue_description && (
                              <p className="text-neutral-500 mt-xs">{check.issue_description}</p>
                            )}
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-lg text-center">
              <p className="text-neutral-600">No checks match your filters</p>
            </div>
          )}
        </div>

        {/* Action Cards for Issues */}
        {issuesCount > 0 && (
          <section className="mt-3xl">
            <h2 className="text-xl font-bold text-neutral-900 mb-md">⚠️ Issues Requiring Action</h2>
            <div className="space-y-md">
              {checks
                .filter((c) => c.tenant_response === 'issue_reported')
                .map((check) => (
                  <div key={check.id} className="rounded-2xl border-2 border-red-200 bg-red-50 p-lg">
                    <div className="flex items-start justify-between gap-md">
                      <div>
                        <h3 className="font-bold text-neutral-900">
                          {check.check_type === 'fire_door' ? '🚪' : '🔔'} {check.property_name} / {check.room_name}
                        </h3>
                        <p className="text-sm text-neutral-600 mt-xs">Tenant: {check.tenant_name}</p>
                        <p className="text-sm font-semibold text-red-600 mt-sm">Issue: {check.issue_type}</p>
                        {check.issue_description && (
                          <p className="text-sm text-neutral-700 mt-xs italic">"{check.issue_description}"</p>
                        )}
                      </div>
                      <button className="rounded-lg bg-red-600 px-md py-sm text-sm font-semibold text-white hover:bg-red-700 whitespace-nowrap">
                        Create Job
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
