'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import QuickNotifyModal from '@/app/admin/components/QuickNotifyModal'

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
        setProperties(data)
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
      <div className="min-h-screen bg-black">
        <AppBar
          right={<BackButton href="/admin" />}
        />
        <main className="mx-auto max-w-4xl px-lg py-3xl">
          <p className="text-neutral-400">Loading properties...</p>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black">
      <AppBar
        right={
          <Link href="/admin" className="shrink-0 hover:opacity-80 text-white">
            ← Dashboard
          </Link>
        }
      />

      <main className="mx-auto max-w-4xl px-lg py-3xl">
        <div className="space-y-3xl">
          <div>
            <h1 className="text-3xl font-bold text-white mb-md">Quick Notify</h1>
            <p className="text-sm text-neutral-400">Select a property to send messages to tenants, cleaners, or contractors</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
            {properties.length === 0 ? (
              <div className="col-span-full rounded-lg border border-neutral-700 bg-neutral-900 p-lg text-center">
                <p className="text-neutral-400">No properties found</p>
              </div>
            ) : (
              properties.map(property => (
                <button
                  key={property.id}
                  onClick={() => handlePropertySelect(property.id)}
                  className="text-left rounded-lg border border-neutral-700 bg-neutral-900 p-lg hover:border-blue-600 hover:bg-neutral-900 transition-all"
                >
                  <h3 className="text-lg font-semibold text-white mb-sm">📍 {property.address}</h3>
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
