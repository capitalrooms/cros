'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AppBar from '@/components/AppBar'
import { blockAddress } from '@/lib/formatAddress'
import BackButton from '@/app/components/BackButton'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import QuickNotifyModal from '@/app/admin/components/QuickNotifyModal'
import { sortPropertiesNumerically } from '@/lib/sortProperties'

interface Property {
  id: string
  address: string
  name?: string
}

export default function QuickNotifyPage() {
  const router = useRouter()
  const [properties, setProperties] = useState<Property[]>([])
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    async function init() {
      const user = await getCurrentUser()
      if (!user || (user.assignment?.role !== 'administrator' && user.assignment?.role !== 'admin')) {
        router.push('/login')
        return
      }

      const supabase = createClient()
      const { data, error } = await supabase
        .from('properties')
        .select('id, address, name')
        .order('address')

      if (!error && data) {
        setProperties(sortPropertiesNumerically(data))
      }
      setLoading(false)
    }

    init()
  }, [router])

  const handlePropertySelect = (propertyId: string) => {
    setSelectedPropertyId(propertyId)
    setModalOpen(true)
  }

  const handleModalClose = () => {
    setModalOpen(false)
    setSelectedPropertyId(null)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar left={<BackButton href="/admin" />} />
        <main className="mx-auto max-w-4xl px-lg py-3xl">
          <p className="text-neutral-500">Loading properties…</p>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin" />} />

      <main className="mx-auto max-w-4xl px-lg py-2xl">
        <div className="space-y-2xl">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 mb-xs">Quick Notify</h1>
            <p className="text-sm text-neutral-500">Select a property to send messages to tenants, cleaners, or contractors</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
            {properties.length === 0 ? (
              <div className="col-span-full rounded-xl border border-neutral-200 bg-white p-lg text-center">
                <p className="text-neutral-400">No properties found</p>
              </div>
            ) : (
              properties.map(property => (
                <button
                  key={property.id}
                  onClick={() => handlePropertySelect(property.id)}
                  className="text-left rounded-xl border border-neutral-200 bg-white p-lg hover:border-neutral-300 hover:shadow-sm transition-all"
                >
                  <h3 className="text-base font-semibold text-neutral-900 mb-xs whitespace-pre-line">
                    📍 {blockAddress(property.name || property.address)}
                  </h3>
                  <p className="text-xs text-neutral-400">Click to send notifications</p>
                </button>
              ))
            )}
          </div>
        </div>
      </main>

      {/* Quick Notify Modal */}
      {modalOpen && selectedPropertyId && (
        <QuickNotifyModal
          propertyId={selectedPropertyId}
          onClose={handleModalClose}
          onSuccess={() => {
            setTimeout(() => router.push('/admin'), 2000)
          }}
        />
      )}
    </div>
  )
}
