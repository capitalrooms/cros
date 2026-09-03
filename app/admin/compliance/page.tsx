'use client'

import { useEffect, useState } from 'react'
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading'
import { useRouter } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import Link from 'next/link'

type Tab = 'certificates' | 'safety-checks' | 'dashboard'

interface Property {
  id: string
  name: string
  address: string
  gas_safe_cert_date?: string
  gas_safe_cert_expiry?: string
  electrical_cert_date?: string
  electrical_cert_expiry?: string
  fire_detection_test_date?: string
  fire_detection_test_date_expiry?: string
  emergency_lighting_test_date?: string
  pat_test_date?: string
  pat_test_date_expiry?: string
}

interface ComplianceStatus {
  status: 'compliant' | 'expiring_soon' | 'expired'
  daysUntilExpiry?: number
}

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

function ComplianceItem({
  label,
  date,
  expiry,
  status,
  icon,
}: {
  label: string
  date?: string
  expiry?: string
  status: ComplianceStatus
  icon: string
}) {
  return (
    <div
      className={`rounded-lg border-2 p-md ${
        status.status === 'compliant'
          ? 'border-green-200 bg-green-50'
          : status.status === 'expiring_soon'
          ? 'border-yellow-200 bg-yellow-50'
          : 'border-red-200 bg-red-50'
      }`}
    >
      <div className="flex items-center justify-between mb-md">
        <p className="text-2xl">{icon}</p>
        <p className="text-xs font-bold uppercase text-neutral-600">{label}</p>
      </div>

      {date ? (
        <>
          <p className="text-xs text-neutral-600">
            Certified: {new Date(date).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })}
          </p>
          {expiry && (
            <p
              className={`text-xs font-bold mt-xs ${
                status.status === 'compliant'
                  ? 'text-green-700'
                  : status.status === 'expiring_soon'
                  ? 'text-yellow-700'
                  : 'text-red-700'
              }`}
            >
              Expires: {new Date(expiry).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })}
            </p>
          )}
        </>
      ) : (
        <p className="text-xs text-neutral-500 italic">Not recorded</p>
      )}
    </div>
  )
}

export default function CompliancePage() {
  const router = useRouter()
  const supabase = createClient()

  // Shared state
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('certificates')
  const [properties, setProperties] = useState<Property[]>([])

  // Safety checks state
  const [checks, setChecks] = useState<SafetyCheckResponse[]>([])
  const [checkFilter, setCheckFilter] = useState<'all' | 'fire_door' | 'smoke_alarm'>('all')
  const [responseFilter, setResponseFilter] = useState<'all' | 'pending' | 'ok' | 'issues'>('all')

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      if (!data || (data.assignment?.role !== 'administrator' && data.assignment?.role !== 'admin')) {
        router.push('/login')
        return
      }

      const { data: propsData } = await supabase.from('properties').select('*').order('name')
      setProperties(propsData || [])

      // Load safety checks
      const { data: checksData } = await supabase
        .from('tenant_self_checks')
        .select(
          `
          *,
          properties (name),
          rooms (name),
          people (full_name, first_name, last_name)
        `
        )
        .order('request_sent_at', { ascending: false })

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
        tenant_name: check.people.name,
      }))

      setChecks(transformed)
      setLoading(false)
    }

    init()
  }, [router])

  const checkStatus = (expiryDate?: string): ComplianceStatus => {
    if (!expiryDate) return { status: 'expired' }
    const today = new Date()
    const expiry = new Date(expiryDate)
    const daysUntil = Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

    if (daysUntil < 0) return { status: 'expired' }
    if (daysUntil < 30) return { status: 'expiring_soon', daysUntilExpiry: daysUntil }
    return { status: 'compliant' }
  }

  const allCompliant = properties.every(
    (p) =>
      checkStatus(p.gas_safe_cert_expiry).status === 'compliant' &&
      checkStatus(p.electrical_cert_expiry).status === 'compliant'
  )

  const filteredChecks = checks.filter((check) => {
    if (checkFilter !== 'all' && check.check_type !== checkFilter) return false
    if (responseFilter === 'pending' && check.response_received_at) return false
    if (responseFilter === 'ok' && check.tenant_response !== 'confirmed_ok') return false
    if (responseFilter === 'issues' && check.tenant_response !== 'issue_reported') return false
    return true
  })

  const pendingCount = checks.filter((c) => !c.response_received_at).length
  const issuesCount = checks.filter((c) => c.tenant_response === 'issue_reported').length

  if (loading) return <GenericPageSkeleton />

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin" />} />

      <main className="mx-auto max-w-6xl px-lg py-2xl">
        <div className="mb-2xl">
          <h1 className="text-3xl font-bold text-neutral-900">🛡️ Compliance</h1>
          <p className="mt-sm text-sm text-neutral-600 mb-lg">
            Certificates, safety checks, and compliance dashboard across all properties
          </p>

          {/* Tab buttons */}
          <div className="flex gap-sm border-b border-neutral-300">
            <button
              onClick={() => setActiveTab('certificates')}
              className={`px-lg py-md font-semibold transition ${
                activeTab === 'certificates'
                  ? 'border-b-2 border-neutral-900 text-neutral-900'
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              📋 Certificates
            </button>
            <button
              onClick={() => setActiveTab('safety-checks')}
              className={`px-lg py-md font-semibold transition relative ${
                activeTab === 'safety-checks'
                  ? 'border-b-2 border-neutral-900 text-neutral-900'
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              🏠 Safety Checks
              {(pendingCount + issuesCount > 0) && (
                <span className="ml-sm inline-block rounded-full bg-neutral-900 text-white px-sm py-0 text-xs font-bold">
                  {pendingCount + issuesCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-lg py-md font-semibold transition ${
                activeTab === 'dashboard'
                  ? 'border-b-2 border-neutral-900 text-neutral-900'
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              📊 Dashboard
            </button>
          </div>
        </div>

        {/* CERTIFICATES TAB */}
        {activeTab === 'certificates' && (
          <div>
            {/* Overall Status */}
            <div className="mb-3xl rounded-3xl bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-200 p-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-green-700 uppercase tracking-wide">Overall Status</p>
                  <h2 className="text-2xl font-bold text-green-900 mt-xs">
                    {allCompliant ? '✅ All Compliant' : '⚠️ Action Required'}
                  </h2>
                  <p className="text-sm text-green-700 mt-md">{properties.length} properties monitored</p>
                </div>
                <div className="text-5xl">📋</div>
              </div>
            </div>

            {/* Properties */}
            <div className="space-y-lg">
              {properties.map((prop) => {
                const gasSafe = checkStatus(prop.gas_safe_cert_expiry)
                const electrical = checkStatus(prop.electrical_cert_expiry)
                const fireDetection = checkStatus(prop.fire_detection_test_date)
                const emergencyLighting = checkStatus(prop.emergency_lighting_test_date)
                const patTest = checkStatus(prop.pat_test_date)

                const allPropCompliant =
                  gasSafe.status === 'compliant' &&
                  electrical.status === 'compliant' &&
                  fireDetection.status === 'compliant' &&
                  emergencyLighting.status === 'compliant' &&
                  patTest.status === 'compliant'

                return (
                  <div key={prop.id} className="rounded-2xl border-2 border-neutral-200 bg-white p-lg">
                    <div className="flex items-start justify-between gap-lg mb-lg">
                      <div>
                        <h3 className="text-xl font-bold text-neutral-900">{prop.name}</h3>
                        <p className="text-sm text-neutral-600 mt-xs">{prop.address}</p>
                      </div>
                      <div className="text-right">
                        {allPropCompliant ? (
                          <span className="px-lg py-md rounded-xl bg-green-100 text-green-700 text-sm font-bold">
                            ✅ All Compliant
                          </span>
                        ) : (
                          <span className="px-lg py-md rounded-xl bg-red-100 text-red-700 text-sm font-bold">
                            ❌ Action Required
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-md md:grid-cols-2 lg:grid-cols-3">
                      <ComplianceItem
                        label="Gas Safety"
                        date={prop.gas_safe_cert_date}
                        expiry={prop.gas_safe_cert_expiry}
                        status={gasSafe}
                        icon="🔥"
                      />
                      <ComplianceItem
                        label="EICR (Electrical)"
                        date={prop.electrical_cert_date}
                        expiry={prop.electrical_cert_expiry}
                        status={electrical}
                        icon="⚡"
                      />
                      <ComplianceItem
                        label="Fire Detection"
                        date={prop.fire_detection_test_date}
                        expiry={prop.fire_detection_test_date}
                        status={fireDetection}
                        icon="🚨"
                      />
                      <ComplianceItem
                        label="Emergency Lighting"
                        date={prop.emergency_lighting_test_date}
                        expiry={prop.emergency_lighting_test_date}
                        status={emergencyLighting}
                        icon="💡"
                      />
                      <ComplianceItem
                        label="PAT Testing"
                        date={prop.pat_test_date}
                        expiry={prop.pat_test_date}
                        status={patTest}
                        icon="🔌"
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* SAFETY CHECKS TAB */}
        {activeTab === 'safety-checks' && (
          <div className="space-y-lg">
            <div className="flex flex-wrap gap-md">
              <div className="flex gap-sm">
                <button
                  onClick={() => setCheckFilter('all')}
                  className={`px-md py-sm text-sm font-semibold rounded-lg transition ${
                    checkFilter === 'all' ? 'bg-neutral-900 text-white' : 'bg-white border border-neutral-300 text-neutral-700'
                  }`}
                >
                  All Types
                </button>
                <button
                  onClick={() => setCheckFilter('fire_door')}
                  className={`px-md py-sm text-sm font-semibold rounded-lg transition ${
                    checkFilter === 'fire_door' ? 'bg-neutral-900 text-white' : 'bg-white border border-neutral-300 text-neutral-700'
                  }`}
                >
                  Fire Door
                </button>
                <button
                  onClick={() => setCheckFilter('smoke_alarm')}
                  className={`px-md py-sm text-sm font-semibold rounded-lg transition ${
                    checkFilter === 'smoke_alarm' ? 'bg-neutral-900 text-white' : 'bg-white border border-neutral-300 text-neutral-700'
                  }`}
                >
                  Smoke Alarm
                </button>
              </div>

              <div className="flex gap-sm">
                <button
                  onClick={() => setResponseFilter('all')}
                  className={`px-md py-sm text-sm font-semibold rounded-lg transition ${
                    responseFilter === 'all' ? 'bg-neutral-900 text-white' : 'bg-white border border-neutral-300 text-neutral-700'
                  }`}
                >
                  All Responses
                </button>
                <button
                  onClick={() => setResponseFilter('pending')}
                  className={`px-md py-sm text-sm font-semibold rounded-lg transition ${
                    responseFilter === 'pending' ? 'bg-neutral-900 text-white' : 'bg-white border border-neutral-300 text-neutral-700'
                  }`}
                >
                  Pending
                </button>
                <button
                  onClick={() => setResponseFilter('ok')}
                  className={`px-md py-sm text-sm font-semibold rounded-lg transition ${
                    responseFilter === 'ok' ? 'bg-neutral-900 text-white' : 'bg-white border border-neutral-300 text-neutral-700'
                  }`}
                >
                  OK
                </button>
                <button
                  onClick={() => setResponseFilter('issues')}
                  className={`px-md py-sm text-sm font-semibold rounded-lg transition ${
                    responseFilter === 'issues' ? 'bg-neutral-900 text-white' : 'bg-white border border-neutral-300 text-neutral-700'
                  }`}
                >
                  Issues
                </button>
              </div>
            </div>

            {filteredChecks.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center">
                <p className="text-sm text-neutral-500">No safety checks match your filters</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-neutral-200 bg-white divide-y divide-neutral-200">
                {filteredChecks.map((check) => {
                  const statusColor =
                    check.tenant_response === 'confirmed_ok'
                      ? 'bg-green-50'
                      : check.tenant_response === 'issue_reported'
                      ? 'bg-red-50'
                      : 'bg-yellow-50'

                  return (
                    <div key={check.id} className={`p-md ${statusColor}`}>
                      <div className="flex items-start justify-between gap-md">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-md mb-sm">
                            <span className="text-sm font-bold text-neutral-900">{check.property_name}</span>
                            <span className="text-xs bg-neutral-100 px-sm py-xs rounded text-neutral-700">
                              {check.room_name || 'Unknown room'}
                            </span>
                          </div>
                          <p className="text-sm text-neutral-600">
                            {check.tenant_name} • {check.check_type === 'fire_door' ? '🚪 Fire Door' : '💨 Smoke Alarm'}
                          </p>
                          {check.issue_description && (
                            <p className="text-xs text-red-700 mt-sm font-semibold">⚠️ {check.issue_description}</p>
                          )}
                          <p className="text-xs text-neutral-500 mt-xs">
                            Sent: {new Date(check.request_sent_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          {!check.response_received_at ? (
                            <span className="px-md py-xs rounded-lg bg-yellow-100 text-yellow-700 text-xs font-bold">
                              ⏳ Pending
                            </span>
                          ) : check.tenant_response === 'confirmed_ok' ? (
                            <span className="px-md py-xs rounded-lg bg-green-100 text-green-700 text-xs font-bold">
                              ✅ OK
                            </span>
                          ) : (
                            <span className="px-md py-xs rounded-lg bg-red-100 text-red-700 text-xs font-bold">
                              ⚠️ Issue
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* DASHBOARD TAB */}
        {activeTab === 'dashboard' && (
          <div>
            <div className="rounded-2xl border border-neutral-200 bg-white p-lg">
              <h2 className="text-xl font-bold text-neutral-900 mb-md">Property Compliance Summary</h2>
              <p className="text-sm text-neutral-600 mb-lg">
                Quick overview of safety check responses across all properties. See the Safety Checks tab for detailed filtering.
              </p>

              <div className="space-y-md">
                {properties.map((prop) => {
                  const propChecks = checks.filter((c) => c.property_id === prop.id)
                  const pending = propChecks.filter((c) => !c.response_received_at).length
                  const ok = propChecks.filter((c) => c.tenant_response === 'confirmed_ok').length
                  const issues = propChecks.filter((c) => c.tenant_response === 'issue_reported').length
                  const total = propChecks.length

                  if (total === 0) return null

                  return (
                    <div key={prop.id} className="rounded-lg border border-neutral-200 bg-neutral-50 p-md">
                      <div className="flex items-start justify-between gap-md mb-sm">
                        <div>
                          <p className="font-bold text-neutral-900">{prop.name}</p>
                          <p className="text-xs text-neutral-600 mt-xs">{prop.address}</p>
                        </div>
                        <div className="text-right text-xs">
                          <p className="text-neutral-700">
                            {total} checks · {ok} ✅ · {issues} ⚠️ · {pending} ⏳
                          </p>
                        </div>
                      </div>
                      <div className="h-2 bg-neutral-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500"
                          style={{
                            width: `${((ok + pending + issues) / total) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>

              {properties.filter((p) => checks.filter((c) => c.property_id === p.id).length > 0).length === 0 && (
                <div className="text-center text-sm text-neutral-500 py-lg">
                  No safety check data yet
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
