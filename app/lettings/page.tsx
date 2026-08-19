'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import AppBar from '@/components/AppBar'
import Link from 'next/link'
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading'
import SendOfferForm from '@/components/SendOfferForm'

interface AvailableRoom {
  id: string
  name: string
  property_id: string
  property_name: string
  property_address: string
  current_asking_rent: number | null
  available_date: string | null
  days_on_market: number | null
}

export default function LetteringsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [availableRooms, setAvailableRooms] = useState<AvailableRoom[]>([])

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      if (!data) {
        router.push('/login')
        return
      }

      await loadData()
      setLoading(false)
    }
    init()
  }, [router])

  async function loadData() {
    // Fetch available rooms
    const { data: availableData } = await supabase
      .from('rooms')
      .select('id, name, property_id, current_asking_rent, available_date, marketing_status, days_on_market, properties(name, address)')
      .eq('status', 'available')
      .order('available_date', { ascending: true })

    if (availableData) {
      const transformed = availableData.map((room: any) => ({
        id: room.id,
        name: room.name,
        property_id: room.property_id,
        property_name: room.properties?.name || 'Unknown',
        property_address: room.properties?.address || '',
        current_asking_rent: room.current_asking_rent,
        available_date: room.available_date,
        marketing_status: room.marketing_status,
        days_on_market: room.days_on_market,
      }))
      setAvailableRooms(transformed)
    }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-'
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  if (loading) return <GenericPageSkeleton />

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar right={<Link href="/" className="min-w-0 truncate font-semibold text-white hover:text-white/80">Home</Link>} />

      <main className="mx-auto max-w-6xl px-lg py-2xl">
        <div className="mb-2xl">
          <h1 className="text-3xl font-bold text-neutral-900">🚪 Available Rooms</h1>
          <p className="mt-sm text-sm text-neutral-600 mb-lg">Browse available properties and express interest</p>
        </div>

        <div>
          <h2 className="text-xl font-bold text-neutral-900 mb-lg">Available Rooms</h2>

          {availableRooms.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center">
              <p className="text-sm text-neutral-500">No available rooms</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-neutral-200 bg-white overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-neutral-200 bg-neutral-50">
                    <th className="px-lg py-md text-left text-sm font-semibold text-neutral-900">Property & Room</th>
                    <th className="px-lg py-md text-left text-sm font-semibold text-neutral-900">Available Date</th>
                    <th className="px-lg py-md text-left text-sm font-semibold text-neutral-900">Rent (£pcm)</th>
                    <th className="px-lg py-md text-center text-sm font-semibold text-neutral-900">Days on Market</th>
                  </tr>
                </thead>
                <tbody>
                  {availableRooms.map((room, idx) => (
                    <tr key={room.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-neutral-50'}>
                      <td className="px-lg py-md text-sm text-neutral-900">
                        <p className="font-medium">{room.name}</p>
                        <p className="text-xs text-neutral-600">{room.property_address}</p>
                      </td>
                      <td className="px-lg py-md text-sm text-neutral-600">{formatDate(room.available_date)}</td>
                      <td className="px-lg py-md text-sm font-medium text-neutral-900">
                        £{room.current_asking_rent?.toLocaleString() || '-'}
                      </td>
                      <td className="px-lg py-md text-sm text-center text-neutral-600">
                        {room.days_on_market || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Send Offer Form */}
        <div className="mt-3xl">
          <SendOfferForm />
        </div>
      </main>
    </div>
  )
}
