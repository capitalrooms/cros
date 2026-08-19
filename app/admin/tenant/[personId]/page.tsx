'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import AppBar from '@/components/AppBar'

interface TenantProfile {
  id: string
  name: string
  email: string
  phone: string
  role: string
  created_at: string
}

interface TenancyInfo {
  id: string
  room_id: string
  property_id: string
  start_date: string
  end_date: string | null
  rent_monthly: number
  room?: { name: string }
  property?: { address: string }
}

interface Communication {
  id: string
  title: string
  message: string
  notification_type: string
  status: string
  created_at: string
}

interface SafetyCheck {
  id: string
  check_type: string
  response: string
  created_at: string
}

export default function TenantProfilePage({
  params
}: {
  params: Promise<{ personId: string }>
}) {
  const router = useRouter()
  const { personId } = use(params)

  const [tenant, setTenant] = useState<TenantProfile | null>(null)
  const [tenancies, setTenancies] = useState<TenancyInfo[]>([])
  const [communications, setCommunications] = useState<Communication[]>([])
  const [safetyChecks, setSafetyChecks] = useState<SafetyCheck[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'communications' | 'safety' | 'history'>('overview')

  const supabase = createClient()

  useEffect(() => {
    async function init() {
      const user = await getCurrentUser()
      if (!user || (user.assignment?.role !== 'administrator' && user.assignment?.role !== 'admin')) {
        router.push('/login')
        return
      }

      // Load tenant profile
      const { data: tenantData } = await supabase
        .from('people')
        .select('*')
        .eq('id', personId)
        .single()

      setTenant(tenantData)

      // Load tenancies
      const { data: tenanciesData } = await supabase
        .from('tenancies')
        .select('*, room:rooms(name), property:properties(address)')
        .eq('person_id', personId)
        .order('start_date', { ascending: false })

      setTenancies(tenanciesData || [])

      // Load communications
      const { data: commsData } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipient_id', personId)
        .order('created_at', { ascending: false })
        .limit(50)

      setCommunications(commsData || [])

      // Load safety checks
      const { data: checksData } = await supabase
        .from('tenant_self_checks')
        .select('*')
        .eq('tenancy_id', tenanciesData?.[0]?.id || '')
        .order('created_at', { ascending: false })

      setSafetyChecks(checksData || [])

      setLoading(false)
    }

    init()
  }, [personId, router])

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black">
        <AppBar right={<Link href="/admin" className="text-white">← Admin</Link>} />
        <div className="p-xl text-neutral-400">Loading...</div>
      </div>
    )
  }

  if (!tenant) {
    return (
      <div className="min-h-screen bg-black">
        <AppBar right={<Link href="/admin" className="text-white">← Admin</Link>} />
        <div className="p-xl text-neutral-400">Tenant not found</div>
      </div>
    )
  }

  const currentTenancy = tenancies.find(t => !t.end_date)
  const previousTenancies = tenancies.filter(t => t.end_date)

  return (
    <div className="min-h-screen bg-black">
      <AppBar
        right={
          <Link href="/admin" className="text-white hover:opacity-80">
            ← Admin
          </Link>
        }
      />

      <main className="mx-auto max-w-6xl px-lg py-2xl">
        {/* Profile Header */}
        <div className="mb-3xl">
          <h1 className="text-3xl font-bold text-white mb-md">👤 {tenant.name}</h1>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-lg">
            <div className="rounded-lg bg-neutral-900 border border-neutral-700 p-lg">
              <p className="text-xs text-neutral-400 mb-sm uppercase">Email</p>
              <p className="text-sm font-semibold text-white break-all">{tenant.email}</p>
            </div>
            <div className="rounded-lg bg-neutral-900 border border-neutral-700 p-lg">
              <p className="text-xs text-neutral-400 mb-sm uppercase">Phone</p>
              <p className="text-sm font-semibold text-white">{tenant.phone || '—'}</p>
            </div>
            <div className="rounded-lg bg-neutral-900 border border-neutral-700 p-lg">
              <p className="text-xs text-neutral-400 mb-sm uppercase">Role</p>
              <p className="text-sm font-semibold text-white capitalize">{tenant.role}</p>
            </div>
            <div className="rounded-lg bg-neutral-900 border border-neutral-700 p-lg">
              <p className="text-xs text-neutral-400 mb-sm uppercase">Member Since</p>
              <p className="text-sm font-semibold text-white">{formatDate(tenant.created_at)}</p>
            </div>
          </div>
        </div>

        {/* Current Tenancy */}
        {currentTenancy && (
          <div className="mb-3xl rounded-lg border border-neutral-700 bg-neutral-950 overflow-hidden">
            <div className="bg-green-950 border-b border-neutral-700 p-lg">
              <h2 className="text-lg font-semibold text-white">🏠 Current Tenancy</h2>
            </div>
            <div className="p-lg space-y-md">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-lg">
                <div>
                  <p className="text-xs text-neutral-400 mb-sm">Property</p>
                  <p className="text-sm font-semibold text-white">{currentTenancy.property?.address}</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-400 mb-sm">Room</p>
                  <p className="text-sm font-semibold text-white">{currentTenancy.room?.name}</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-400 mb-sm">Monthly Rent</p>
                  <p className="text-sm font-semibold text-white">£{currentTenancy.rent_monthly}</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-400 mb-sm">Since</p>
                  <p className="text-sm font-semibold text-white">{formatDate(currentTenancy.start_date)}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Previous Tenancies */}
        {previousTenancies.length > 0 && (
          <div className="mb-3xl rounded-lg border border-neutral-700 bg-neutral-950 overflow-hidden">
            <div className="bg-neutral-800 border-b border-neutral-700 p-lg">
              <h2 className="text-lg font-semibold text-white">📋 Previous Tenancies ({previousTenancies.length})</h2>
            </div>
            <div className="divide-y divide-neutral-800">
              {previousTenancies.map((tenancy) => (
                <div key={tenancy.id} className="p-lg hover:bg-neutral-900 transition">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-lg text-sm">
                    <div>
                      <p className="text-xs text-neutral-400 mb-xs">Property</p>
                      <p className="font-semibold text-white">{tenancy.property?.address}</p>
                    </div>
                    <div>
                      <p className="text-xs text-neutral-400 mb-xs">Room</p>
                      <p className="font-semibold text-white">{tenancy.room?.name}</p>
                    </div>
                    <div>
                      <p className="text-xs text-neutral-400 mb-xs">Period</p>
                      <p className="font-semibold text-white">{formatDate(tenancy.start_date)} - {formatDate(tenancy.end_date!)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-neutral-400 mb-xs">Rent</p>
                      <p className="font-semibold text-white">£{tenancy.rent_monthly}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-md mb-lg border-b border-neutral-700">
          {[
            { id: 'overview' as const, label: 'Overview' },
            { id: 'communications' as const, label: `Communications (${communications.length})` },
            { id: 'safety' as const, label: `Safety Checks (${safetyChecks.length})` },
            { id: 'history' as const, label: 'Full History' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-lg py-md font-semibold text-sm transition ${
                activeTab === tab.id
                  ? 'text-white border-b-2 border-blue-600'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'communications' && (
          <div className="rounded-lg border border-neutral-700 bg-neutral-950 overflow-hidden">
            {communications.length === 0 ? (
              <div className="p-lg text-center text-neutral-400">No communications yet</div>
            ) : (
              <div className="divide-y divide-neutral-800 max-h-[600px] overflow-y-auto">
                {communications.map((comm) => (
                  <div key={comm.id} className="p-lg hover:bg-neutral-900 transition">
                    <p className="font-semibold text-white text-sm">{comm.title}</p>
                    <p className="text-xs text-neutral-400 mt-xs line-clamp-2">{comm.message}</p>
                    <div className="flex items-center justify-between mt-md text-xs text-neutral-500">
                      <span>{comm.notification_type}</span>
                      <span>{formatDate(comm.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'safety' && (
          <div className="rounded-lg border border-neutral-700 bg-neutral-950 overflow-hidden">
            {safetyChecks.length === 0 ? (
              <div className="p-lg text-center text-neutral-400">No safety checks yet</div>
            ) : (
              <div className="divide-y divide-neutral-800">
                {safetyChecks.map((check) => (
                  <div key={check.id} className="p-lg">
                    <p className="font-semibold text-white text-sm capitalize">{check.check_type}</p>
                    <p className="text-xs text-neutral-400 mt-xs">{check.response}</p>
                    <p className="text-xs text-neutral-500 mt-md">{formatDate(check.created_at)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
            <div className="rounded-lg border border-neutral-700 bg-neutral-950 p-lg">
              <h3 className="font-semibold text-white mb-md">Contact Info</h3>
              <div className="space-y-md text-sm">
                <div>
                  <p className="text-neutral-400">Email</p>
                  <p className="text-white font-semibold break-all">{tenant.email}</p>
                </div>
                <div>
                  <p className="text-neutral-400">Phone</p>
                  <p className="text-white font-semibold">{tenant.phone || '—'}</p>
                </div>
                <div>
                  <p className="text-neutral-400">Member Since</p>
                  <p className="text-white font-semibold">{formatDate(tenant.created_at)}</p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-neutral-700 bg-neutral-950 p-lg">
              <h3 className="font-semibold text-white mb-md">Quick Stats</h3>
              <div className="space-y-md text-sm">
                <div>
                  <p className="text-neutral-400">Current Tenancies</p>
                  <p className="text-white font-semibold text-2xl">{currentTenancy ? 1 : 0}</p>
                </div>
                <div>
                  <p className="text-neutral-400">Previous Tenancies</p>
                  <p className="text-white font-semibold text-2xl">{previousTenancies.length}</p>
                </div>
                <div>
                  <p className="text-neutral-400">Messages Received</p>
                  <p className="text-white font-semibold text-2xl">{communications.length}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-lg">
            <div className="rounded-lg border border-neutral-700 bg-neutral-950 p-lg">
              <h3 className="font-semibold text-white mb-lg">Complete Timeline</h3>
              <div className="space-y-lg">
                {currentTenancy && (
                  <div className="flex gap-lg">
                    <div className="flex flex-col items-center">
                      <div className="w-4 h-4 rounded-full bg-green-500"></div>
                      <div className="w-0.5 h-12 bg-neutral-700 mt-2"></div>
                    </div>
                    <div>
                      <p className="font-semibold text-white">[CURRENT] {currentTenancy.property?.address} - {currentTenancy.room?.name}</p>
                      <p className="text-sm text-neutral-400">Since {formatDate(currentTenancy.start_date)}</p>
                    </div>
                  </div>
                )}
                {previousTenancies.map((tenancy, idx) => (
                  <div key={tenancy.id} className="flex gap-lg">
                    <div className="flex flex-col items-center">
                      <div className="w-4 h-4 rounded-full bg-neutral-600"></div>
                      {idx < previousTenancies.length - 1 && <div className="w-0.5 h-12 bg-neutral-700 mt-2"></div>}
                    </div>
                    <div>
                      <p className="font-semibold text-white">{tenancy.property?.address} - {tenancy.room?.name}</p>
                      <p className="text-sm text-neutral-400">{formatDate(tenancy.start_date)} to {formatDate(tenancy.end_date!)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
