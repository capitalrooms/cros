'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading'
import SendOfferForm from '@/components/SendOfferForm'
import Link from 'next/link'
import AddLetOnlyModal from '@/app/components/AddLetOnlyModal'
import RoomDetailTags from '@/app/components/RoomDetailTags'

interface AvailableRoom {
  id: string
  name: string
  property_id: string
  property_name: string
  property_address: string
  current_asking_rent: number | null
  available_date: string | null
  marketing_status: string
  days_on_market: number | null
  status: 'available' | 'on_notice'
  // let-only extras
  is_let_only?: boolean
  let_only_listing_id?: string
  has_ensuite?: boolean | null
  has_shared_bathroom?: boolean | null
  has_lounge?: boolean | null
}

export default function LettingsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [availableRooms, setAvailableRooms] = useState<AvailableRoom[]>([])
  const [showAddLetOnly, setShowAddLetOnly] = useState(false)
  const [personId, setPersonId] = useState<string | undefined>()

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      if (!data || (data.assignment?.role !== 'administrator' && data.assignment?.role !== 'admin')) {
        router.push('/login')
        return
      }

      // Resolve person id for created_by
      if (data.user?.email) {
        const { data: person } = await supabase
          .from('people')
          .select('id')
          .eq('email', data.user.email)
          .maybeSingle()
        setPersonId(person?.id)
      }

      await loadData()
    }
    init()
  }, [router])

  async function loadData() {
    // Managed available rooms
    const { data: availableData } = await supabase
      .from('rooms')
      .select('id, name, property_id, current_asking_rent, available_date, marketing_status, days_on_market, has_ensuite, has_shared_bathroom, has_lounge, properties(name, address)')
      .eq('status', 'available')
      .order('available_date', { ascending: true })

    // On-notice tenancies
    const { data: onNoticeData } = await supabase
      .from('tenancies')
      .select('id, end_date, rooms(id, name, property_id, current_asking_rent, has_ensuite, has_shared_bathroom, has_lounge, properties(name, address))')
      .eq('status', 'on_notice')
      .order('end_date', { ascending: true })

    // Let-only rooms (active listings only)
    const { data: letOnlyData } = await supabase
      .from('let_only_rooms')
      .select('id, room_name, monthly_rent, available_date, has_ensuite, has_shared_bathroom, has_lounge, let_only_listings(id, address, postcode, is_active)')
      .eq('status', 'available')
      .order('available_date', { ascending: true })

    const availableTransformed = (availableData || []).map((room: any) => ({
      id: room.id,
      name: room.name,
      property_id: room.property_id,
      property_name: room.properties?.name || 'Unknown',
      property_address: room.properties?.address || '',
      current_asking_rent: room.current_asking_rent,
      available_date: room.available_date,
      marketing_status: room.marketing_status,
      days_on_market: room.days_on_market,
      status: 'available' as const,
      has_ensuite: room.has_ensuite,
      has_shared_bathroom: room.has_shared_bathroom,
      has_lounge: room.has_lounge,
    }))

    const onNoticeTransformed = (onNoticeData || [])
      .filter((t: any) => t.rooms)
      .map((t: any) => ({
        id: t.rooms.id,
        name: t.rooms.name,
        property_id: t.rooms.property_id,
        property_name: t.rooms.properties?.name || 'Unknown',
        property_address: t.rooms.properties?.address || '',
        current_asking_rent: t.rooms.current_asking_rent,
        available_date: t.end_date,
        marketing_status: 'on_notice',
        days_on_market: null,
        status: 'on_notice' as const,
        has_ensuite: t.rooms.has_ensuite,
        has_shared_bathroom: t.rooms.has_shared_bathroom,
        has_lounge: t.rooms.has_lounge,
      }))

    const letOnlyTransformed = (letOnlyData || [])
      .filter((r: any) => r.let_only_listings?.is_active)
      .map((r: any) => {
        const listing = r.let_only_listings
        const addr = listing.postcode ? `${listing.address}, ${listing.postcode}` : listing.address
        return {
          id: r.id,
          name: r.room_name,
          property_id: listing.id,
          property_name: listing.address,
          property_address: addr,
          current_asking_rent: r.monthly_rent,
          available_date: r.available_date,
          marketing_status: 'available',
          days_on_market: null,
          status: 'available' as const,
          is_let_only: true,
          let_only_listing_id: listing.id,
          has_ensuite: r.has_ensuite,
          has_shared_bathroom: r.has_shared_bathroom,
          has_lounge: r.has_lounge,
        }
      })

    const combined = [...availableTransformed, ...onNoticeTransformed]
    const deduped = combined.filter((item, idx, arr) => idx === arr.findIndex(t => t.id === item.id))

    setAvailableRooms([...deduped, ...letOnlyTransformed])
    setLoading(false)
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '—'
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  if (loading) return <GenericPageSkeleton />

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin" />} />

      <main className="mx-auto max-w-6xl px-lg py-2xl">
        <div className="mb-2xl">
          <h1 className="text-3xl font-bold text-neutral-900">🚪 Available Rooms</h1>
          <p className="mt-sm text-sm text-neutral-600">Send offers and manage available properties</p>
        </div>

        <div>
          {/* Section header + add button */}
          <div className="flex items-center justify-between mb-lg">
            <h2 className="text-xl font-bold text-neutral-900">Available Rooms</h2>
            <button
              onClick={() => setShowAddLetOnly(true)}
              className="rounded-xl bg-neutral-900 px-md py-sm text-sm font-semibold text-white hover:bg-neutral-700 transition-colors"
            >
              + Add let-only room
            </button>
          </div>

          {availableRooms.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center">
              <p className="text-sm text-neutral-500">No available rooms</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-neutral-200 bg-white overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-neutral-200 bg-neutral-50">
                    <th className="px-lg py-md text-left text-sm font-semibold text-neutral-900">Property &amp; Room</th>
                    <th className="px-lg py-md text-left text-sm font-semibold text-neutral-900">Features</th>
                    <th className="px-lg py-md text-left text-sm font-semibold text-neutral-900">Available</th>
                    <th className="px-lg py-md text-left text-sm font-semibold text-neutral-900">Rent (£pcm)</th>
                    <th className="px-lg py-md text-center text-sm font-semibold text-neutral-900">Days on market</th>
                  </tr>
                </thead>
                <tbody>
                  {availableRooms.map((room, idx) => {
                    const href = room.is_let_only
                      ? `/admin/let-only/${room.let_only_listing_id}`
                      : `/admin/properties/${room.property_id}`
                    return (
                    <tr
                      key={room.id}
                      onClick={() => router.push(href)}
                      className={`border-b border-neutral-100 last:border-0 cursor-pointer transition-colors ${
                        room.is_let_only
                          ? 'bg-neutral-50 hover:bg-purple-50'
                          : idx % 2 === 0
                          ? 'bg-white hover:bg-blue-50'
                          : 'bg-neutral-50 hover:bg-blue-50'
                      }`}
                    >
                      <td className="px-lg py-md text-sm text-neutral-900">
                        <div className="flex items-start gap-md">
                          <div>
                            <p className="font-medium">{room.name}</p>
                            <p className="text-xs text-neutral-500">
                              {room.property_address || room.property_name}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-xs">
                            {room.status === 'on_notice' && (
                              <span className="inline-block px-sm py-xs text-xs font-semibold bg-amber-100 text-amber-800 rounded">
                                📋 On Notice
                              </span>
                            )}
                            {room.is_let_only && (
                              <span className="inline-block px-sm py-xs text-xs font-semibold bg-purple-100 text-purple-700 rounded">
                                🔑 Let-only
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-lg py-md text-sm">
                        <RoomDetailTags
                          has_ensuite={room.has_ensuite}
                          has_shared_bathroom={room.has_shared_bathroom}
                          has_lounge={room.has_lounge}
                        />
                      </td>
                      <td className="px-lg py-md text-sm text-neutral-600">{formatDate(room.available_date)}</td>
                      <td className="px-lg py-md text-sm font-medium text-neutral-900">
                        £{room.current_asking_rent?.toLocaleString() || '—'}
                      </td>
                      <td className="px-lg py-md text-sm text-center text-neutral-600">
                        {room.days_on_market ?? '—'}
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Legend */}
          {availableRooms.some(r => r.is_let_only) && (
            <p className="mt-sm text-xs text-neutral-400">
              🔑 Let-only rooms are landlord-marketed — Capital Rooms runs viewings only, not full management.
            </p>
          )}
        </div>

        {/* Send Offer Form */}
        <div className="mt-3xl">
          <SendOfferForm />
        </div>
      </main>

      {showAddLetOnly && (
        <AddLetOnlyModal
          createdByPersonId={personId}
          onClose={() => setShowAddLetOnly(false)}
          onSave={async () => {
            setShowAddLetOnly(false)
            setLoading(true)
            await loadData()
          }}
        />
      )}
    </div>
  )
}
