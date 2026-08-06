'use client'

import { useEffect, useState } from 'react'
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading'
import { useRouter } from 'next/navigation'
import { getCurrentUser, signOut } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import Link from 'next/link'

interface Room {
  id: string
  name: string
  property_id: string
  status: 'occupied' | 'available' | 'on_notice'
  properties: { name: string; address: string }
  current_asking_rent?: number
  previous_rent?: number
  created_at?: string
}

interface Viewing {
  id: string
  room_id: string
  visitor_name: string
  visitor_email: string
  viewing_date: string
  viewing_slot: string
  feedback?: string
  rooms: { name: string; property_id: string }
}

export default function AgentDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [rooms, setRooms] = useState<Room[]>([])
  const [viewings, setViewings] = useState<Viewing[]>([])
  const [filter, setFilter] = useState<'all' | 'available' | 'on_notice'>('available')

  useEffect(() => {
    async function checkAuth() {
      const data = await getCurrentUser()
      if (!data || data.assignment?.role !== 'agent') {
        router.push('/login')
        return
      }
      setUser(data.user)

      const supabase = createClient()

      // Fetch rooms
      const { data: roomsData } = await supabase
        .from('rooms')
        .select('*, properties(name, address)')
        .order('created_at', { ascending: false })

      setRooms(roomsData || [])

      // Fetch upcoming viewings
      const { data: viewingsData } = await supabase
        .from('viewings')
        .select('*, rooms(name, property_id)')
        .gte('viewing_date', new Date().toISOString().split('T')[0])
        .order('viewing_date', { ascending: true })

      setViewings(viewingsData || [])
      setLoading(false)
    }

    checkAuth()
  }, [router])

  async function handleSignOut() {
    await signOut()
    router.push('/login')
  }

  if (loading) { return <GenericPageSkeleton /> }
  }

  const available = rooms.filter((r) => r.status === 'available')
  const onNotice = rooms.filter((r) => r.status === 'on_notice')
  const occupied = rooms.filter((r) => r.status === 'occupied')
  const filtered = filter === 'all' ? rooms : filter === 'available' ? available : onNotice

  const upcomingViewings = viewings.slice(0, 5)
  const totalAvailable = available.length
  const daysOnMarket = (roomData: Room) => {
    if (!roomData.created_at) return '—'
    const created = new Date(roomData.created_at)
    const today = new Date()
    const days = Math.floor((today.getTime() - created.getTime()) / (1000 * 60 * 60 * 24))
    return `${days}d`
  }

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar
        right={
          <button
            onClick={handleSignOut}
            className="shrink-0 transition-colors hover:opacity-80 flex items-center gap-sm"
          >
            <span>👋</span> Sign out
          </button>
        }
      />

      <main className="mx-auto max-w-6xl px-lg py-2xl">
        {/* Header */}
        <div className="mb-3xl">
          <h1 className="text-3xl font-bold text-neutral-900">Lettings</h1>
          <p className="mt-sm text-sm text-neutral-600">
            Manage availability, track viewings, and monitor marketing performance
          </p>
        </div>

        {/* Key Stats */}
        <div className="mb-3xl grid gap-lg md:grid-cols-4">
          <StatCard
            label="Available"
            value={totalAvailable}
            subtext="rooms ready to let"
            color="bg-green-50 border-green-200"
          />
          <StatCard
            label="On Notice"
            value={onNotice.length}
            subtext="upcoming availability"
            color="bg-blue-50 border-blue-200"
          />
          <StatCard
            label="Occupied"
            value={occupied.length}
            subtext="currently let"
            color="bg-neutral-50 border-neutral-200"
          />
          <StatCard
            label="Viewings"
            value={upcomingViewings.length}
            subtext="this month"
            color="bg-purple-50 border-purple-200"
          />
        </div>

        <div className="grid gap-lg lg:grid-cols-3">
          {/* Available Rooms */}
          <div className="lg:col-span-2">
            <div className="rounded-2xl border-2 border-neutral-200 bg-white p-lg">
              <div className="mb-md flex items-center justify-between">
                <h2 className="text-xl font-bold text-neutral-900">Rooms</h2>
                <div className="flex gap-sm">
                  <button
                    onClick={() => setFilter('all')}
                    className={`rounded-lg px-md py-sm text-xs font-bold ${
                      filter === 'all'
                        ? 'bg-neutral-900 text-white'
                        : 'bg-neutral-100 text-neutral-700'
                    }`}
                  >
                    All ({rooms.length})
                  </button>
                  <button
                    onClick={() => setFilter('available')}
                    className={`rounded-lg px-md py-sm text-xs font-bold ${
                      filter === 'available'
                        ? 'bg-green-600 text-white'
                        : 'bg-neutral-100 text-neutral-700'
                    }`}
                  >
                    Available ({available.length})
                  </button>
                  <button
                    onClick={() => setFilter('on_notice')}
                    className={`rounded-lg px-md py-sm text-xs font-bold ${
                      filter === 'on_notice'
                        ? 'bg-blue-600 text-white'
                        : 'bg-neutral-100 text-neutral-700'
                    }`}
                  >
                    On Notice ({onNotice.length})
                  </button>
                </div>
              </div>

              {filtered.length === 0 ? (
                <p className="text-sm text-neutral-400">No rooms matching this filter</p>
              ) : (
                <div className="space-y-md">
                  {filtered.map((room) => (
                    <div
                      key={room.id}
                      className="rounded-lg border border-neutral-200 p-md hover:border-neutral-300"
                    >
                      <div className="flex items-start justify-between gap-md">
                        <div className="flex-1">
                          <div className="flex items-center gap-md mb-xs">
                            <h3 className="font-bold text-neutral-900">{room.name}</h3>
                            <span
                              className={`text-xs font-bold px-md py-xs rounded ${
                                room.status === 'available'
                                  ? 'bg-green-100 text-green-700'
                                  : room.status === 'on_notice'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-neutral-100 text-neutral-600'
                              }`}
                            >
                              {room.status === 'on_notice' ? 'On Notice' : room.status}
                            </span>
                          </div>
                          <p className="text-sm text-neutral-600">{room.properties?.name}</p>
                          <div className="mt-md grid grid-cols-3 gap-md text-xs">
                            <div>
                              <p className="text-neutral-500">Current asking</p>
                              <p className="font-bold text-neutral-900">
                                £{room.current_asking_rent || '—'}/week
                              </p>
                            </div>
                            <div>
                              <p className="text-neutral-500">Previous</p>
                              <p className="font-bold text-neutral-900">
                                £{room.previous_rent || '—'}/week
                              </p>
                            </div>
                            <div>
                              <p className="text-neutral-500">Days on market</p>
                              <p className="font-bold text-neutral-900">{daysOnMarket(room)}</p>
                            </div>
                          </div>
                        </div>
                        <Link href={`/agent/room/${room.id}`}>
                          <button className="shrink-0 rounded-lg bg-neutral-900 px-md py-sm text-xs font-bold text-white hover:bg-neutral-800">
                            View →
                          </button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Upcoming Viewings */}
          <div>
            <div className="rounded-2xl border-2 border-neutral-200 bg-white p-lg">
              <h3 className="font-bold text-neutral-900 mb-md">Upcoming Viewings</h3>
              {upcomingViewings.length === 0 ? (
                <p className="text-sm text-neutral-400">No viewings scheduled</p>
              ) : (
                <div className="space-y-sm">
                  {upcomingViewings.map((viewing) => (
                    <div
                      key={viewing.id}
                      className="rounded-lg bg-neutral-50 p-md border border-neutral-200"
                    >
                      <p className="text-xs font-bold text-neutral-500 uppercase">
                        {new Date(viewing.viewing_date).toLocaleDateString('en-GB', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </p>
                      <p className="mt-xs font-bold text-neutral-900 text-sm">
                        {viewing.viewing_slot}
                      </p>
                      <p className="text-xs text-neutral-600 mt-xs">
                        {(viewing.rooms as any)?.name}
                      </p>
                      <p className="text-xs text-neutral-500 mt-xs truncate">
                        {viewing.visitor_name}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <Link href="/agent/viewings">
                <button className="mt-md w-full rounded-lg border border-neutral-300 py-sm text-xs font-bold text-neutral-900 hover:bg-neutral-50">
                  View all viewings →
                </button>
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

function StatCard({
  label,
  value,
  subtext,
  color,
}: {
  label: string
  value: number
  subtext: string
  color: string
}) {
  return (
    <div className={`rounded-2xl border-2 ${color} p-lg`}>
      <p className="text-xs font-bold uppercase tracking-wide text-neutral-600">{label}</p>
      <p className="mt-xs text-3xl font-bold text-neutral-900">{value}</p>
      <p className="text-xs text-neutral-600 mt-xs">{subtext}</p>
    </div>
  )
}
