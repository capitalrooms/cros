'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

interface Tenancy {
  id: string
  tenant_id: string
  room_id: string
  start_date: string
  end_date: string | null
  person: {
    id: string
    name: string
    email: string | null
    phone: string | null
  }
  room: {
    id: string
    name: string
  }
}

interface PeopleTabProps {
  propertyId: string
}

export default function PeopleTab({ propertyId }: PeopleTabProps) {
  const [tenancies, setTenancies] = useState<Tenancy[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  useEffect(() => {
    loadTenancies()
  }, [propertyId])

  async function loadTenancies() {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('tenancies')
      .select(`
        id,
        tenant_id,
        room_id,
        start_date,
        end_date,
        person:tenant_id(id, name, email, phone),
        room:room_id(id, name)
      `)
      .eq('property_id', propertyId)
      .order('start_date', { ascending: false })

    if (err) {
      setError('Failed to load tenancies')
      console.error(err)
    } else {
      // Filter to current tenancies
      setTenancies(data || [])
    }
    setLoading(false)
  }

  const activeTenancies = tenancies.filter(t => !t.end_date || new Date(t.end_date) > new Date())
  const pastTenancies = tenancies.filter(t => t.end_date && new Date(t.end_date) <= new Date())

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const getDaysAsSince = (startDate: string) => {
    const days = Math.floor((new Date().getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24))
    return days
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-xl">
        <div className="text-sm text-neutral-400">Loading people...</div>
      </div>
    )
  }

  return (
    <div className="space-y-3xl">
      {error && (
        <div className="p-lg rounded-lg bg-red-950 border border-red-800">
          <p className="text-sm font-semibold text-red-400">{error}</p>
        </div>
      )}

      {/* Active Tenants Section */}
      <div>
        <h3 className="text-sm font-bold uppercase text-neutral-400 mb-lg pb-lg border-b border-neutral-100">
          👥 Current Tenants ({activeTenancies.length})
        </h3>

        {activeTenancies.length === 0 ? (
          <div className="rounded-lg border border-neutral-700 bg-neutral-900 p-xl text-center">
            <p className="text-sm text-neutral-400">No active tenancies</p>
          </div>
        ) : (
          <div className="grid gap-md">
            {activeTenancies.map((tenancy) => (
              <div key={tenancy.id} className="rounded-lg border border-neutral-700 bg-neutral-950 p-lg hover:shadow-md transition">
                <div className="flex items-start justify-between gap-lg mb-md">
                  <div className="flex-1">
                    <p className="font-semibold text-white">{tenancy.person.name}</p>
                    <p className="text-xs text-neutral-400 mt-xs">
                      {tenancy.room.name} • Moved in {formatDate(tenancy.start_date)} ({getDaysAsSince(tenancy.start_date)} days)
                    </p>
                  </div>
                  <span className="px-md py-sm rounded-full bg-green-100 text-green-700 text-xs font-semibold whitespace-nowrap">
                    Active
                  </span>
                </div>

                <div className="flex flex-wrap gap-md">
                  {tenancy.person.email && (
                    <button
                      onClick={() => navigator.clipboard.writeText(tenancy.person.email || '')}
                      className="text-xs text-blue-400 hover:text-blue-300 font-semibold"
                      title="Click to copy"
                    >
                      📧 {tenancy.person.email}
                    </button>
                  )}
                  {tenancy.person.phone && (
                    <button
                      onClick={() => navigator.clipboard.writeText(tenancy.person.phone || '')}
                      className="text-xs text-blue-400 hover:text-blue-300 font-semibold"
                      title="Click to copy"
                    >
                      📱 {tenancy.person.phone}
                    </button>
                  )}
                </div>

                <div className="flex gap-sm mt-lg">
                  <Link
                    href={`/admin/people/${tenancy.person.id}`}
                    className="text-xs font-semibold text-blue-400 hover:text-blue-300 underline"
                  >
                    View Profile
                  </Link>
                  <Link
                    href={`/admin/properties/${propertyId}/tenancies/${tenancy.id}`}
                    className="text-xs font-semibold text-blue-400 hover:text-blue-300 underline"
                  >
                    Tenancy Details
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Past Tenants Section */}
      {pastTenancies.length > 0 && (
        <div>
          <h3 className="text-sm font-bold uppercase text-neutral-400 mb-lg pb-lg border-b border-neutral-100">
            📋 Past Tenants ({pastTenancies.length})
          </h3>

          <div className="grid gap-md">
            {pastTenancies.map((tenancy) => (
              <div key={tenancy.id} className="rounded-lg border border-neutral-700 bg-neutral-900 p-lg">
                <div className="flex items-start justify-between gap-lg mb-md">
                  <div className="flex-1">
                    <p className="font-semibold text-white">{tenancy.person.name}</p>
                    <p className="text-xs text-neutral-400 mt-xs">
                      {tenancy.room.name} • {formatDate(tenancy.start_date)} to {formatDate(tenancy.end_date!)}
                    </p>
                  </div>
                  <span className="px-md py-sm rounded-full bg-neutral-200 text-neutral-400 text-xs font-semibold whitespace-nowrap">
                    Moved Out
                  </span>
                </div>

                <Link
                  href={`/admin/people/${tenancy.person.id}`}
                  className="text-xs font-semibold text-blue-400 hover:text-blue-300 underline"
                >
                  View Profile
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contractors/Staff Section */}
      <div>
        <h3 className="text-sm font-bold uppercase text-neutral-400 mb-lg pb-lg border-b border-neutral-100">
          🔧 Staff & Contractors
        </h3>

        <div className="rounded-lg border border-neutral-700 bg-neutral-900 p-xl text-center">
          <p className="text-sm text-neutral-400">Contractor management coming soon</p>
          <p className="text-xs text-neutral-400 mt-sm">Assign cleaners, electricians, and maintenance staff</p>
        </div>
      </div>
    </div>
  )
}
