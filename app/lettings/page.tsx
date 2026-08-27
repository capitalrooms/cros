'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { getCurrentUser, signOut } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import AppBar from '@/components/AppBar'
import RoleGreeting from '@/app/components/RoleGreeting'
import Link from 'next/link'
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading'
import SendOfferForm from '@/components/SendOfferForm'
import ThreeDayCalendar from '@/app/components/ThreeDayCalendar'

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

export default function LettingsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [availableRooms, setAvailableRooms] = useState<AvailableRoom[]>([])

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      if (!data) {
        router.push('/login')
        return
      }
      // Friendly greeting name, same source the cleaner dashboard uses.
      if (data.user?.email) {
        const { data: person } = await supabase
          .from('people')
          .select('full_name')
          .eq('email', data.user.email)
          .maybeSingle()
        setName(person?.full_name || data.user.email.split('@')[0] || '')
      }
      await loadData()
      setLoading(false)
    }
    init()
  }, [router])

  async function loadData() {
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
        days_on_market: room.days_on_market,
      }))
      setAvailableRooms(transformed)
    }
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
      <AppBar
        right={
          <button
            onClick={async () => {
              await signOut()
              router.push('/login')
            }}
            className="shrink-0 transition-colors hover:opacity-80 flex items-center gap-sm"
          >
            <span>👋</span> Sign out
          </button>
        }
      />

      <main className="mx-auto max-w-6xl px-lg py-lg">
        {/* Greeting — shared across every role dashboard */}
        <RoleGreeting role="Lettings Dashboard" name={name} subtitle="Ready to let some properties!" />

        {/* 3-Day Calendar */}
        <ThreeDayCalendar
          appointments={(viewings || []).map((v: any) => ({
            id: v.id,
            viewing_date: v.viewing_date,
          }))}
          role="lettings"
          onAppointmentClick={(viewing: any) => {
            router.push(`/lettings/viewings`)
          }}
        />

        {/* Primary action heroes — bold black cards, blue accent on the standout */}
        <div className="grid gap-md sm:grid-cols-2">
          <section className="rounded-2xl border-2 border-neutral-950 bg-neutral-900 p-lg text-white flex flex-col">
            <p className="text-xs font-bold uppercase tracking-widest text-white/50">Your schedule</p>
            <h2 className="mt-xs text-xl font-bold">📅 Diary</h2>
            <p className="mt-xs text-sm text-white/60 flex-1">
              See your viewings by day, book new ones, and check what&apos;s coming up.
            </p>
            <div className="mt-md flex flex-col gap-sm">
              <Link
                href="/lettings/viewings"
                className="rounded-xl bg-blue-600 px-lg py-md text-center text-sm font-bold text-white hover:bg-blue-700"
              >
                Open diary
              </Link>
              <Link
                href="/admin/agency-diary"
                className="rounded-xl border border-white/25 px-lg py-md text-center text-sm font-bold text-white hover:bg-white/10"
              >
                See all property visits
              </Link>
            </div>
          </section>

          <section className="rounded-2xl border-2 border-neutral-950 bg-neutral-900 p-lg text-white flex flex-col">
            <p className="text-xs font-bold uppercase tracking-widest text-white/50">Available now</p>
            <h2 className="mt-xs text-xl font-bold">🚪 {availableRooms.length} room{availableRooms.length === 1 ? '' : 's'} to let</h2>
            <p className="mt-xs text-sm text-white/60 flex-1">
              Rooms currently on the market across your properties. Send an offer to an applicant below.
            </p>
          </section>
        </div>

        {/* Available rooms — black table, matching the rest of the app */}
        <section className="mt-3xl">
          <h2 className="text-xl font-bold text-neutral-900 mb-lg">Available Rooms</h2>

          {availableRooms.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center">
              <p className="text-sm text-neutral-500">No available rooms right now.</p>
            </div>
          ) : (
            <div className="rounded-2xl border-2 border-neutral-950 bg-neutral-900 overflow-x-auto">
              <table className="w-full text-white">
                <thead>
                  <tr className="border-b border-neutral-700 text-left">
                    <th className="px-lg py-md text-xs font-bold uppercase tracking-wide text-white/60">Property &amp; Room</th>
                    <th className="px-lg py-md text-xs font-bold uppercase tracking-wide text-white/60">Available</th>
                    <th className="px-lg py-md text-xs font-bold uppercase tracking-wide text-white/60">Rent (£pcm)</th>
                    <th className="px-lg py-md text-center text-xs font-bold uppercase tracking-wide text-white/60">Days on market</th>
                  </tr>
                </thead>
                <tbody>
                  {availableRooms.map((room) => (
                    <tr key={room.id} className="border-b border-neutral-800 last:border-0 hover:bg-neutral-800/60">
                      <td className="px-lg py-md text-sm">
                        <p className="font-semibold">{room.name}</p>
                        <p className="text-xs text-white/50">{room.property_address || room.property_name}</p>
                      </td>
                      <td className="px-lg py-md text-sm text-white/70">{formatDate(room.available_date)}</td>
                      <td className="px-lg py-md text-sm font-semibold">
                        £{room.current_asking_rent?.toLocaleString() || '—'}
                      </td>
                      <td className="px-lg py-md text-sm text-center text-white/70">
                        {room.days_on_market ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Send Offer — dark hero form (restyled inside the component) */}
        <div id="send-offer" className="mt-3xl scroll-mt-lg">
          <SendOfferForm />
        </div>
      </main>
    </div>
  )
}
