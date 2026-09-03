'use client'

import { useEffect, useState } from 'react'
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading'
import { useRouter, useParams } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import Link from 'next/link'

interface Room {
  id: string
  name: string
  property_id: string
  status: 'occupied' | 'available' | 'on_notice'
  current_asking_rent?: number
  previous_rent?: number
  created_at?: string
  properties: { id: string; name: string; address: string }
}

interface Viewing {
  id: string
  visitor_name: string
  visitor_email: string
  viewing_date: string
  viewing_slot: string
  feedback?: string
}

interface Tenancy {
  id: string
  person_id: string
  start_date: string
  rent_amount?: number
  people: { name: string; email: string }
}

export default function RoomDetailPage() {
  const router = useRouter()
  const params = useParams()
  const roomId = params.roomId as string

  const [room, setRoom] = useState<Room | null>(null)
  const [viewings, setViewings] = useState<Viewing[]>([])
  const [tenancy, setTenancy] = useState<Tenancy | null>(null)
  const [loading, setLoading] = useState(true)
  const [newAskingRent, setNewAskingRent] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      if (!data || data.assignment?.role !== 'agent') {
        router.push('/login')
        return
      }

      const supabase = createClient()

      // Fetch room
      const { data: roomData } = await supabase
        .from('rooms')
        .select('*, properties(id, name, address)')
        .eq('id', roomId)
        .single()

      if (roomData) {
        setRoom(roomData)
        setNewAskingRent(String(roomData.current_asking_rent || ''))

        // Fetch viewings
        const { data: viewingsData } = await supabase
          .from('viewings')
          .select('*')
          .eq('room_id', roomId)
          .order('viewing_date', { ascending: false })

        setViewings(viewingsData || [])

        // Fetch current tenancy
        if (roomData.status === 'occupied') {
          const { data: tenancyData } = await supabase
            .from('tenancies')
            .select('*, people(full_name, first_name, last_name, email)')
            .eq('room_id', roomId)
            .is('end_date', null)
            .single()

          if (tenancyData) {
            setTenancy(tenancyData)
          }
        }
      }

      setLoading(false)
    }
    init()
  }, [roomId, router])

  async function handleUpdateRent() {
    if (!room || !newAskingRent) return
    setSaving(true)

    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('rooms')
        .update({ current_asking_rent: parseFloat(newAskingRent) })
        .eq('id', roomId)

      if (error) throw error

      setRoom({ ...room, current_asking_rent: parseFloat(newAskingRent) })
      alert('✅ Rent updated')
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <GenericPageSkeleton />;

  if (!room) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar left={<BackButton href="/agent" />} />
        <p className="p-xl text-sm text-neutral-400">Room not found</p>
      </div>
    )
  }

  const daysOnMarket = room.created_at
    ? Math.floor((new Date().getTime() - new Date(room.created_at).getTime()) / (1000 * 60 * 60 * 24))
    : 0

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar right={<Link href="/agent" className="min-w-0 truncate text-sm font-semibold text-white hover:text-white/80">Back</Link>} />

      <main className="mx-auto max-w-4xl px-lg py-lg">
        <Link href="/agent">
          <button className="text-sm font-bold text-neutral-600 hover:text-neutral-900 mb-lg">
            ← Back
          </button>
        </Link>

        {/* Header */}
        <div className="rounded-3xl bg-gradient-to-br from-neutral-900 to-neutral-800 text-white p-lg mb-lg">
          <div className="flex items-start justify-between gap-lg">
            <div>
              <h1 className="text-3xl font-bold mb-md">{room.name}</h1>
              <p className="text-lg text-white/80 mb-lg">{room.properties.name}</p>
              <p className="text-base text-white/80">{room.properties.address}</p>

              <div className="mt-lg flex gap-md flex-wrap">
                <span
                  className={`text-sm font-bold px-lg py-md rounded-lg ${
                    room.status === 'available'
                      ? 'bg-green-100 text-green-700'
                      : room.status === 'on_notice'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-neutral-100 text-neutral-700'
                  }`}
                >
                  {room.status === 'on_notice' ? 'On Notice' : room.status}
                </span>
                <span className="text-sm font-bold px-lg py-md rounded-lg bg-white/20 text-white">
                  {daysOnMarket} days on market
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-lg md:grid-cols-3">
          {/* Main */}
          <div className="md:col-span-2 space-y-lg">
            {/* Rent */}
            <div className="rounded-2xl border-2 border-neutral-200 bg-white p-lg">
              <h3 className="font-bold text-neutral-900 mb-md">Current Asking Rent</h3>
              <div className="flex gap-md items-end">
                <div className="flex-1">
                  <p className="text-xs text-neutral-600 uppercase mb-md">Per week</p>
                  <input
                    type="number"
                    value={newAskingRent}
                    onChange={(e) => setNewAskingRent(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 px-lg py-md text-lg font-bold focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  />
                </div>
                <button
                  onClick={handleUpdateRent}
                  disabled={saving || newAskingRent === String(room.current_asking_rent)}
                  className="px-lg py-md rounded-lg bg-neutral-900 text-white font-bold hover:bg-neutral-800 disabled:opacity-50 text-sm"
                >
                  {saving ? 'Saving…' : 'Update'}
                </button>
              </div>
              {room.previous_rent && (
                <p className="text-xs text-neutral-600 mt-md">
                  Previous: £{room.previous_rent}/week
                </p>
              )}
            </div>

            {/* Tenancy */}
            {tenancy && (
              <div className="rounded-2xl border-2 border-neutral-200 bg-white p-lg">
                <h3 className="font-bold text-neutral-900 mb-md">Current Tenant</h3>
                <div className="space-y-md">
                  <div>
                    <p className="text-xs text-neutral-600 uppercase">Name</p>
                    <p className="font-bold text-neutral-900 mt-xs">{tenancy.people.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-600 uppercase">Email</p>
                    <p className="text-sm text-neutral-600 mt-xs">{tenancy.people.email}</p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-600 uppercase">Tenancy Start</p>
                    <p className="text-sm text-neutral-900 mt-xs font-bold">
                      {new Date(tenancy.start_date).toLocaleDateString('en-GB', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </p>
                  </div>
                  {tenancy.rent_amount && (
                    <div>
                      <p className="text-xs text-neutral-600 uppercase">Rent</p>
                      <p className="text-sm text-neutral-900 mt-xs font-bold">£{tenancy.rent_amount}/week</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Viewings */}
            <div className="rounded-2xl border-2 border-neutral-200 bg-white p-lg">
              <h3 className="font-bold text-neutral-900 mb-md">Viewing History</h3>
              {viewings.length === 0 ? (
                <p className="text-sm text-neutral-400">No viewings yet</p>
              ) : (
                <div className="space-y-md">
                  {viewings.map((viewing) => (
                    <div
                      key={viewing.id}
                      className="rounded-lg border border-neutral-200 p-md"
                    >
                      <div className="flex items-start justify-between gap-md">
                        <div>
                          <p className="font-bold text-neutral-900">{viewing.visitor_name}</p>
                          <p className="text-sm text-neutral-600 mt-xs">{viewing.visitor_email}</p>
                          <p className="text-xs text-neutral-500 mt-md">
                            {new Date(viewing.viewing_date).toLocaleDateString('en-GB')} at{' '}
                            {viewing.viewing_slot}
                          </p>
                        </div>
                        {viewing.feedback && (
                          <span className="px-md py-xs rounded-lg bg-green-100 text-green-700 text-xs font-bold">
                            Feedback
                          </span>
                        )}
                      </div>
                      {viewing.feedback && (
                        <p className="text-xs text-neutral-600 mt-md italic">
                          "{viewing.feedback}"
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div>
            <div className="rounded-2xl border-2 border-neutral-200 bg-white p-lg sticky top-lg">
              <h3 className="font-bold text-neutral-900 mb-md">Summary</h3>

              <div className="space-y-md">
                <div>
                  <p className="text-xs text-neutral-600 uppercase">Status</p>
                  <p className="font-bold text-neutral-900 mt-xs capitalize">{room.status}</p>
                </div>

                <div>
                  <p className="text-xs text-neutral-600 uppercase">Viewings</p>
                  <p className="font-bold text-neutral-900 mt-xs">{viewings.length}</p>
                </div>

                <div className="border-t border-neutral-200 pt-md">
                  <p className="text-xs text-neutral-600 uppercase">Room ID</p>
                  <p className="text-xs text-neutral-500 mt-xs font-mono">{roomId.slice(0, 12)}...</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
