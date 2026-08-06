'use client'

import { useEffect, useState } from 'react'
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading'
import { useRouter } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'

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

export default function ComplianceDashboard() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [properties, setProperties] = useState<Property[]>([])

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      if (!data || data.assignment?.role !== 'administrator') {
        router.push('/login')
        return
      }

      const supabase = createClient()
      const { data: propsData } = await supabase
        .from('properties')
        .select('*')
        .order('name')

      setProperties(propsData || [])
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

  const statusBadge = (status: ComplianceStatus) => {
    if (status.status === 'compliant')
      return <span className="px-md py-xs rounded-lg bg-green-100 text-green-700 text-xs font-bold">✅ Compliant</span>
    if (status.status === 'expiring_soon')
      return <span className="px-md py-xs rounded-lg bg-yellow-100 text-yellow-700 text-xs font-bold">⚠️ Expires in {status.daysUntilExpiry}d</span>
    return <span className="px-md py-xs rounded-lg bg-red-100 text-red-700 text-xs font-bold">❌ Expired</span>
  }

  const allCompliant = properties.every(
    (p) =>
      checkStatus(p.gas_safe_cert_expiry).status === 'compliant' &&
      checkStatus(p.electrical_cert_expiry).status === 'compliant'
  )

  if (loading) { return <GenericPageSkeleton /> }
  }

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar />

      <main className="mx-auto max-w-6xl px-lg py-lg">
        <div className="mb-3xl">
          <h1 className="text-3xl font-bold text-neutral-900">Compliance</h1>
          <p className="mt-sm text-sm text-neutral-600">
            Track certifications, expiry dates, and compliance status across all properties
          </p>
        </div>

        {/* Overall Status */}
        <div className="mb-3xl rounded-3xl bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-200 p-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-green-700 uppercase tracking-wide">Overall Status</p>
              <h2 className="text-2xl font-bold text-green-900 mt-xs">
                {allCompliant ? '✅ All Compliant' : '⚠️ Action Required'}
              </h2>
              <p className="text-sm text-green-700 mt-md">
                {properties.length} properties monitored
              </p>
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
      </main>
    </div>
  )
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
    <div className={`rounded-lg border-2 p-md ${
      status.status === 'compliant'
        ? 'border-green-200 bg-green-50'
        : status.status === 'expiring_soon'
        ? 'border-yellow-200 bg-yellow-50'
        : 'border-red-200 bg-red-50'
    }`}>
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
            <p className={`text-xs font-bold mt-xs ${
              status.status === 'compliant'
                ? 'text-green-700'
                : status.status === 'expiring_soon'
                ? 'text-yellow-700'
                : 'text-red-700'
            }`}>
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
