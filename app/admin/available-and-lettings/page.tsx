'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import AppBar from '@/components/AppBar'
import Link from 'next/link'
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading'
import SendOfferForm from '@/components/SendOfferForm'


interface Property {
  id: string
  name: string
  address: string
}

interface Room {
  id: string
  name: string
  property_id: string
  status: 'occupied' | 'available' | 'on_notice'
}

interface Tenancy {
  id: string
  person_id: string
  room_id: string
  start_date: string
  end_date: string | null
  status: 'active' | 'on_notice' | 'available'
  rent_amount: number
  communication_preference: 'email' | 'text'
  opt_in_maintenance: boolean
  opt_in_viewings: boolean
  opt_in_appointments: boolean
  opt_in_cleaning: boolean
  person?: {
    id: string
    full_name: string
    email: string
    phone: string
  }
  room?: Room
  property?: Property
}

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
}

interface TenantPerson {
  full_name: string
  email: string
  phone: string
}

export default function LettingsPage() {
  const router = useRouter()
  const supabase = createClient()

  // Shared state
  const [loading, setLoading] = useState(true)
  const [properties, setProperties] = useState<Property[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [tenancies, setTenancies] = useState<Tenancy[]>([])
  const [availableRooms, setAvailableRooms] = useState<AvailableRoom[]>([])


  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      if (!data || (data.assignment?.role !== 'administrator' && data.assignment?.role !== 'admin')) {
        router.push('/login')
        return
      }

      await loadData()
    }
    init()
  }, [router])

  async function loadData() {
    // Fetch properties
    const { data: propsData } = await supabase.from('properties').select('id, name, address').order('name')

    // Fetch rooms
    const { data: roomsData } = await supabase.from('rooms').select('id, name, property_id, status').order('name')

    // Fetch tenancies
    const { data: tenanciesData } = await supabase
      .from('tenancies')
      .select('*, people(id, full_name, email, phone), rooms(id, name, property_id, status), properties(id, name, address)')
      .order('start_date', { ascending: false })

    // Fetch available rooms
    const { data: availableData } = await supabase
      .from('rooms')
      .select('id, name, property_id, current_asking_rent, available_date, marketing_status, days_on_market, properties(name, address)')
      .eq('status', 'available')
      .order('available_date', { ascending: true })

    // Fetch on-notice tenancies with their rooms
    const { data: onNoticeData } = await supabase
      .from('tenancies')
      .select('id, end_date, rooms(id, name, property_id, current_asking_rent, properties(name, address))')
      .eq('status', 'on_notice')
      .order('end_date', { ascending: true })

    setProperties(propsData || [])
    setRooms(roomsData || [])
    setTenancies((tenanciesData as any) || [])

    // Transform available rooms
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
    }))

    // Transform on-notice rooms
    const onNoticeTransformed = (onNoticeData || [])
      .filter((tenancy: any) => tenancy.rooms && tenancy.rooms.length > 0)
      .map((tenancy: any) => ({
        id: tenancy.rooms.id,
        name: tenancy.rooms.name,
        property_id: tenancy.rooms.property_id,
        property_name: tenancy.rooms.properties?.name || 'Unknown',
        property_address: tenancy.rooms.properties?.address || '',
        current_asking_rent: tenancy.rooms.current_asking_rent,
        available_date: tenancy.end_date,
        marketing_status: 'on_notice' as const,
        days_on_market: null,
        status: 'on_notice' as const,
      }))

    // Combine and deduplicate
    const combined = [...availableTransformed, ...onNoticeTransformed]
    const deduplicated = combined.filter((item, index, self) =>
      index === self.findIndex(t => t.id === item.id)
    )

    setAvailableRooms(deduplicated)

    setLoading(false)
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
      <AppBar right={<Link href="/admin" className="min-w-0 truncate font-semibold text-white hover:text-white/80">Dashboard</Link>} />

      <main className="mx-auto max-w-6xl px-lg py-2xl">
        <div className="mb-2xl">
          <h1 className="text-3xl font-bold text-neutral-900">🚪 Available Rooms</h1>
          <p className="mt-sm text-sm text-neutral-600 mb-lg">Send offers and manage available properties</p>
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
                          <div className="flex items-center gap-md">
                            <div>
                              <p className="font-medium">{room.name}</p>
                              <p className="text-xs text-neutral-600">{room.property_address}</p>
                            </div>
                            {room.status === 'on_notice' && (
                              <span className="inline-block px-sm py-xs text-xs font-semibold bg-amber-100 text-amber-800 rounded">
                                📋 On Notice
                              </span>
                            )}
                          </div>
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
