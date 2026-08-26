'use client'

import { useState, useEffect, use } from 'react'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'

interface Tenancy {
  id: string
  person_id: string
  room_id: string
  property_id: string
  start_date: string
  end_date: string | null
  rent_amount: number | null
  rent_due_day: number | null
  deposit_amount: number | null
  lease_reference: string | null
  created_at: string
}

interface Tenant {
  id: string
  email: string
  full_name: string | null
  phone?: string
  occupation?: string
  role: string
}

interface Room {
  id: string
  name: string
  property_id: string
}

interface Property {
  id: string
  name: string
  address: string
}

type TabType = 'information' | 'documents' | 'reports' | 'communications'

export default function TenancyDetailPage({
  params,
}: {
  params: Promise<{ id: string; roomId: string; tenancyId: string }>
}) {
  const router = useRouter()
  const { id: propertyId, roomId, tenancyId } = use(params)
  const [activeTab, setActiveTab] = useState<TabType>('information')
  const [tenancy, setTenancy] = useState<Tenancy | null>(null)
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [room, setRoom] = useState<Room | null>(null)
  const [property, setProperty] = useState<Property | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      if (!data || (data.assignment?.role !== 'administrator' && data.assignment?.role !== 'admin')) {
        router.push('/login')
        return
      }

      const supabase = createClient()

      // Fetch tenancy data
      const { data: tenancyData, error: tenancyError } = await supabase
        .from('tenancies')
        .select('*')
        .eq('id', tenancyId)
        .single()

      if (tenancyError || !tenancyData) {
        console.error('Failed to load tenancy:', tenancyError)
        router.push(`/admin/properties/${propertyId}`)
        return
      }

      setTenancy(tenancyData as Tenancy)

      // Fetch tenant data
      const { data: tenantData } = await supabase
        .from('people')
        .select('*')
        .eq('id', tenancyData.person_id)
        .single()

      if (tenantData) setTenant(tenantData as Tenant)

      // Fetch room data
      const { data: roomData } = await supabase
        .from('rooms')
        .select('id, name, property_id')
        .eq('id', roomId)
        .single()

      if (roomData) setRoom(roomData as Room)

      // Fetch property data
      const { data: propData } = await supabase
        .from('properties')
        .select('id, name, address')
        .eq('id', propertyId)
        .single()

      if (propData) setProperty(propData as Property)

      setLoading(false)
    }

    init()
  }, [propertyId, roomId, tenancyId, router])

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50">
        <AppBar right={<BackButton />} />
        <div className="flex items-center justify-center py-2xl">
          <div className="text-sm text-neutral-500">Loading tenancy details...</div>
        </div>
      </div>
    )
  }

  if (!tenancy || !tenant || !room || !property) {
    return (
      <div className="min-h-screen bg-neutral-50">
        <AppBar right={<BackButton />} />
        <div className="mx-auto max-w-6xl px-lg py-2xl">
          <div className="p-lg rounded-lg border border-red-300 bg-red-50">
            <p className="text-sm font-semibold text-red-700">Tenancy details not found</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <AppBar right={<BackButton />} />

      <main className="mx-auto max-w-6xl">
        {/* Header Card - Black background */}
        <div className="bg-neutral-900 text-white p-lg mb-0">
          <div className="flex items-start justify-between gap-lg mb-lg">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-sm">TENANCY</p>
              <h1 className="text-3xl font-bold">{tenant.full_name || tenant.email}</h1>
              <p className="text-sm text-neutral-300 mt-xs">
                Active since {new Date(tenancy.start_date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-neutral-400">Room</p>
              <p className="font-semibold">{room.name}, {property.name}</p>
              <p className="text-sm text-neutral-300">{property.address}</p>
            </div>
          </div>

          {/* Tabs on header */}
          <div className="border-t border-neutral-700 pt-lg">
            <div className="flex gap-2xl">
              {(['information', 'documents', 'reports', 'communications'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`text-sm font-semibold transition ${
                    activeTab === tab
                      ? 'text-white border-b-2 border-white'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="bg-white px-lg pt-lg pb-2xl border-t border-neutral-200">

        {/* Information Tab */}
        {activeTab === 'information' && (
          <div className="space-y-lg px-lg py-lg">
            {/* Tenant Profile */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-600 mb-md">TENANT PROFILE</h3>
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-lg">
                <div className="grid gap-lg md:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-neutral-600 font-semibold mb-xs">EMAIL</p>
                    <p className="font-semibold text-neutral-900">{tenant.email}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-neutral-600 font-semibold mb-xs">PHONE</p>
                    <p className="font-semibold text-neutral-900">{tenant.phone || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-neutral-600 font-semibold mb-xs">OCCUPATION</p>
                    <p className="font-semibold text-neutral-900">{tenant.occupation || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-neutral-600 font-semibold mb-xs">ROLE</p>
                    <p className="font-semibold text-neutral-900">{tenant.role}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Tenancy Information */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-600 mb-md">TENANCY INFORMATION</h3>
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-lg">
                <div className="grid gap-lg md:grid-cols-3">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-neutral-600 font-semibold mb-xs">START DATE</p>
                    <p className="font-semibold text-neutral-900">
                      {new Date(tenancy.start_date).toLocaleDateString('en-GB')}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-neutral-600 font-semibold mb-xs">END DATE</p>
                    <p className="font-semibold text-neutral-900">
                      {tenancy.end_date
                        ? new Date(tenancy.end_date).toLocaleDateString('en-GB')
                        : 'Ongoing'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-neutral-600 font-semibold mb-xs">LEASE REFERENCE</p>
                    <p className="font-semibold text-neutral-900">{tenancy.lease_reference || '—'}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Rent & Deposit */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-600 mb-md">RENT & DEPOSIT</h3>
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-lg">
                <div className="grid gap-lg md:grid-cols-3">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-neutral-600 font-semibold mb-xs">MONTHLY RENT</p>
                    <p className="font-bold text-neutral-900 text-lg">£{tenancy.rent_amount || '—'}</p>
                    <p className="text-xs text-neutral-600 mt-xs">Due on day {tenancy.rent_due_day || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-neutral-600 font-semibold mb-xs">DEPOSIT</p>
                    <p className="font-bold text-neutral-900 text-lg">£{tenancy.deposit_amount || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-neutral-600 font-semibold mb-xs">TENANCY LENGTH</p>
                    <p className="font-semibold text-neutral-900">
                      {tenancy.end_date
                        ? Math.floor((new Date(tenancy.end_date).getTime() - new Date(tenancy.start_date).getTime()) / (1000 * 60 * 60 * 24 * 30))
                        : 'Indefinite'} months
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-md pt-lg border-t border-neutral-200">
              <button className="px-lg py-md bg-white border border-neutral-300 text-neutral-900 rounded-lg font-semibold text-sm hover:bg-neutral-50 transition">
                View Rent History
              </button>
              <button className="px-lg py-md bg-neutral-900 text-white rounded-lg font-semibold text-sm hover:bg-neutral-800 transition">
                Mark on Notice
              </button>
            </div>
          </div>
        )}

        {/* Documents Tab */}
        {activeTab === 'documents' && (
          <div className="px-lg py-lg space-y-lg">
            {/* Document Type Categories in Priority Order */}
            {[
              { type: 'agreement', label: 'Tenancy Agreement (Signed)', icon: '📋' },
              { type: 'referencing_report', label: 'Referencing Report', icon: '✓' },
              { type: 'deposit_certificate', label: 'Deposit Certificate', icon: '💳' },
              { type: 'id_proof', label: 'ID Proof', icon: '🆔' },
              { type: 'employment_letter', label: 'Employment Letter', icon: '📄' },
              { type: 'other', label: 'Other Documents', icon: '📁' },
            ].map((docType) => (
              <div key={docType.type}>
                <div className="flex items-center gap-sm mb-sm">
                  <span className="text-lg">{docType.icon}</span>
                  <h4 className="text-sm font-bold uppercase tracking-wider text-neutral-600">{docType.label}</h4>
                </div>
                <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-lg">
                  <p className="text-neutral-600 text-sm">No document uploaded yet</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Reports Tab */}
        {activeTab === 'reports' && (
          <div className="px-lg py-lg">
            <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-600 mb-md">MAINTENANCE REPORTS</h3>
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-lg">
              <p className="text-neutral-600 text-sm">No reports submitted</p>
            </div>
          </div>
        )}

        {/* Communications Tab */}
        {activeTab === 'communications' && (
          <div className="px-lg py-lg">
            <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-600 mb-md">COMMUNICATIONS LOG</h3>
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-lg">
              <p className="text-neutral-600 text-sm">No communications logged</p>
            </div>
          </div>
        )}
        </div>
      </main>
    </div>
  )
}
