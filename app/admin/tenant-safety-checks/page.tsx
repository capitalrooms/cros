'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading'

interface SafetyCheckResponse {
  id: string
  check_type: 'fire_door' | 'smoke_alarm'
  request_sent_at: string
  response_received_at: string | null
  tenant_response: string | null
  issue_type: string | null
  issue_description: string | null
  properties?: { name: string } | null
  rooms?: { name: string } | null
  people?: { name: string } | null
}

const checkTypeLabels: Record<string, string> = {
  fire_door: '🚪 Fire Door',
  smoke_alarm: '🔔 Smoke Alarm',
}

const responseLabels: Record<string, { label: string; color: string }> = {
  confirmed_ok: { label: '✓ All good', color: 'bg-green-100 text-green-800' },
  issue_reported: { label: '⚠️ Issue found', color: 'bg-red-100 text-red-800' },
  no_response: { label: '⏳ Awaiting response', color: 'bg-yellow-100 text-yellow-800' },
}

export default function TenantSafetyChecksAdminPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [checks, setChecks] = useState<SafetyCheckResponse[]>([])
  const [tab, setTab] = useState<'fire_door' | 'smoke_alarm'>('fire_door')
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'completed'>('all')

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      if (!data || !['admin', 'administrator'].includes(data.assignment?.role)) {
        router.push('/login')
        return
      }

      await loadChecks()
      setLoading(false)
    }

    init()
  }, [router])

  async function loadChecks() {
    const { data: checksData } = await supabase
      .from('tenant_self_checks')
      .select('*, properties(name), rooms(name), people:checked_by(full_name, first_name, last_name)')
      .order('response_received_at', { ascending: false, nullsFirst: false })
      .order('request_sent_at', { ascending: false })

    if (checksData) {
      setChecks(checksData as any)
    }
  }

  if (loading) return <GenericPageSkeleton />

  const filtered = checks.filter((check) => {
    const typeMatch = check.check_type === tab
    let statusMatch = true

    if (filterStatus === 'pending') statusMatch = check.response_received_at === null
    if (filterStatus === 'completed') statusMatch = check.response_received_at !== null

    return typeMatch && statusMatch
  })

  const stats = {
    total: checks.filter(c => c.check_type === tab).length,
    pending: checks.filter(c => c.check_type === tab && c.response_received_at === null).length,
    completed: checks.filter(c => c.check_type === tab && c.response_received_at !== null).length,
    issues: checks.filter(c => c.check_type === tab && c.tenant_response === 'issue_reported').length,
  }

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin" />} />

      <main className="mx-auto max-w-6xl px-lg py-lg">
        <div className="mb-3xl">
          <h1 className="text-3xl font-bold text-neutral-900">Tenant Safety Checks</h1>
          <p className="mt-sm text-neutral-600">Monitor fire door and smoke alarm safety confirmations from tenants.</p>
        </div>

        {/* Tabs */}
        <div className="mb-lg flex gap-md border-b border-neutral-300">
          {['fire_door', 'smoke_alarm'].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t as 'fire_door' | 'smoke_alarm')}
              className={`px-lg py-md text-sm font-semibold transition border-b-2 ${
                tab === t
                  ? 'border-neutral-900 text-neutral-900'
                  : 'border-transparent text-neutral-600 hover:text-neutral-900'
              }`}
            >
              {checkTypeLabels[t]}
            </button>
          ))}
        </div>

        {/* Stats */}
        <div className="mb-lg grid grid-cols-4 gap-md">
          <div className="rounded-lg border border-neutral-200 bg-white p-md">
            <p className="text-xs text-neutral-600 font-semibold">Total</p>
            <p className="text-2xl font-bold text-neutral-900 mt-sm">{stats.total}</p>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-white p-md">
            <p className="text-xs text-neutral-600 font-semibold">Pending</p>
            <p className="text-2xl font-bold text-yellow-600 mt-sm">{stats.pending}</p>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-white p-md">
            <p className="text-xs text-neutral-600 font-semibold">Responded</p>
            <p className="text-2xl font-bold text-green-600 mt-sm">{stats.completed}</p>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-white p-md">
            <p className="text-xs text-neutral-600 font-semibold">Issues Found</p>
            <p className="text-2xl font-bold text-red-600 mt-sm">{stats.issues}</p>
          </div>
        </div>

        {/* Filter */}
        <div className="mb-lg flex gap-md">
          {(['all', 'pending', 'completed'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilterStatus(f)}
              className={`px-lg py-sm rounded-lg text-sm font-semibold transition ${
                filterStatus === f
                  ? 'bg-neutral-900 text-white'
                  : 'border border-neutral-300 text-neutral-700 hover:border-neutral-400'
              }`}
            >
              {f === 'all' ? 'All' : f === 'pending' ? 'Pending' : 'Completed'}
            </button>
          ))}
        </div>

        {/* Checks Table */}
        {filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-xl text-center">
            <p className="text-sm text-neutral-500">No safety checks found</p>
          </div>
        ) : (
          <div className="rounded-lg border border-neutral-200 divide-y divide-neutral-200 bg-white overflow-hidden">
            {filtered.map((check) => (
              <div key={check.id} className="p-lg hover:bg-neutral-50 transition">
                <div className="flex items-start justify-between gap-lg mb-md">
                  <div>
                    <div className="flex items-center gap-sm mb-sm">
                      <p className="font-bold text-neutral-900">{check.properties?.name}</p>
                      <span className="text-xs px-md py-xs bg-neutral-100 rounded text-neutral-700">
                        {check.rooms?.name}
                      </span>
                    </div>
                    <p className="text-sm text-neutral-600">
                      Tenant: <span className="font-semibold">{check.people.name || 'Unknown'}</span>
                    </p>
                  </div>
                  <span className={`px-md py-xs rounded-full text-xs font-semibold shrink-0 ${
                    check.response_received_at ? 
                    (check.tenant_response === 'issue_reported' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800') :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {check.response_received_at 
                      ? (check.tenant_response === 'issue_reported' ? '⚠️ Issue' : '✓ OK') 
                      : '⏳ Pending'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-md text-sm">
                  <div>
                    <p className="text-xs text-neutral-500 font-semibold">Requested</p>
                    <p className="mt-xs text-neutral-700">
                      {new Date(check.request_sent_at).toLocaleDateString('en-GB')}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500 font-semibold">Responded</p>
                    <p className="mt-xs text-neutral-700">
                      {check.response_received_at 
                        ? new Date(check.response_received_at).toLocaleDateString('en-GB')
                        : '—'}
                    </p>
                  </div>
                  {check.tenant_response === 'issue_reported' && (
                    <div>
                      <p className="text-xs text-neutral-500 font-semibold">Issue</p>
                      <p className="mt-xs text-red-700 font-semibold">{check.issue_type}</p>
                    </div>
                  )}
                </div>

                {check.issue_description && (
                  <div className="mt-md p-md bg-neutral-50 rounded">
                    <p className="text-xs font-semibold text-neutral-600 mb-xs">Details:</p>
                    <p className="text-sm text-neutral-700">{check.issue_description}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
