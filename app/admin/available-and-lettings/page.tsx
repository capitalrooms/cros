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
  room_type?: string | null
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
  const [kind, setKind] = useState<'all' | 'managed' | 'let_only'>('all')   // Managed · Let Only · All
  const [personId, setPersonId] = useState<string | undefined>()

  // Cluster viewing tour notice
  const [showTourModal, setShowTourModal]       = useState(false)
  const [tourDate, setTourDate]                 = useState(new Date().toISOString().split('T')[0])
  const [tourFrom, setTourFrom]                 = useState('17:00')
  const [tourTo, setTourTo]                     = useState('19:00')
  const [tourRooms, setTourRooms]               = useState<Set<string>>(new Set())
  const [tourSending, setTourSending]           = useState(false)
  const [tourResult, setTourResult]             = useState<string | null>(null)

  function toggleTourRoom(id: string) {
    setTourRooms(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function sendTourNotice() {
    if (tourRooms.size === 0) return
    setTourSending(true)
    setTourResult(null)
    try {
      // Only managed rooms (not let-only) have CROS tenants to SMS
      const managedSelected = availableRooms
        .filter(r => !r.is_let_only && tourRooms.has(r.id))
        .map(r => r.id)

      const res  = await fetch('/api/sms/cluster-viewing-notice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_ids: managedSelected,
          viewing_date: tourDate,
          time_from: tourFrom,
          time_to: tourTo,
        }),
      })
      const json = await res.json()
      if (json.ok) {
        setTourResult(`✅ Sent to ${json.sent} tenant${json.sent !== 1 ? 's' : ''}${json.failed ? ` · ${json.failed} failed` : ''}`)
        setTimeout(() => { setShowTourModal(false); setTourResult(null); setTourRooms(new Set()) }, 3000)
      } else {
        setTourResult(`⚠️ ${json.error || 'Could not send'}`)
      }
    } catch {
      setTourResult('⚠️ Network error — please try again')
    } finally {
      setTourSending(false)
    }
  }

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
      .select('id, name, room_type, property_id, current_asking_rent, available_date, marketing_status, days_on_market, has_ensuite, has_shared_bathroom, has_lounge, is_let_only, properties(name, address, letting_type)')
      .eq('status', 'available')
      .order('available_date', { ascending: true })

    // On-notice rooms — query rooms directly (tenancies.status column not in prod DB)
    const { data: onNoticeData } = await supabase
      .from('rooms')
      .select('id, name, room_type, property_id, current_asking_rent, has_ensuite, has_shared_bathroom, has_lounge, properties(name, address), tenancies(id, end_date, notice_received_date)')
      .eq('status', 'on_notice')
      .order('id', { ascending: true })

    // Let-only rooms (active listings only)
    const { data: letOnlyData } = await supabase
      .from('let_only_rooms')
      .select('id, room_name, monthly_rent, available_date, has_ensuite, has_shared_bathroom, has_lounge, let_only_listings(id, address, postcode, is_active)')
      .eq('status', 'available')
      .order('available_date', { ascending: true })

    const availableTransformed = (availableData || []).map((room: any) => ({
      id: room.id,
      name: room.name,
      room_type: room.room_type,
      property_id: room.property_id,
      property_name: room.properties?.name || 'Unknown',
      property_address: room.properties?.address || '',
      current_asking_rent: room.current_asking_rent,
      available_date: room.available_date,
      marketing_status: room.marketing_status,
      days_on_market: room.days_on_market,
      status: 'available' as const,
      // let-only rooms now live under a let-only property like any other room
      is_let_only: !!room.is_let_only || room.properties?.letting_type === 'let_only',
      has_ensuite: room.has_ensuite,
      has_shared_bathroom: room.has_shared_bathroom,
      has_lounge: room.has_lounge,
    }))

    const onNoticeTransformed = (onNoticeData || [])
      .map((room: any) => {
        // Pick the most recent active tenancy for the move-out date
        const tenancies: any[] = Array.isArray(room.tenancies) ? room.tenancies : (room.tenancies ? [room.tenancies] : [])
        const latestTenancy = tenancies.sort((a: any, b: any) => (b.end_date || '').localeCompare(a.end_date || ''))[0]
        return {
          id: room.id,
          name: room.name,
          room_type: room.room_type,
          property_id: room.property_id,
          property_name: room.properties?.name || 'Unknown',
          property_address: room.properties?.address || '',
          current_asking_rent: room.current_asking_rent,
          available_date: latestTenancy?.end_date ?? null,
          marketing_status: 'on_notice',
          days_on_market: null,
          status: 'on_notice' as const,
          has_ensuite: room.has_ensuite,
          has_shared_bathroom: room.has_shared_bathroom,
          has_lounge: room.has_lounge,
        }
      })

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
          let_only_listing_id: listing.id,   // older listing, entered before let-only rooms moved under properties
          has_ensuite: r.has_ensuite,
          has_shared_bathroom: r.has_shared_bathroom,
          has_lounge: r.has_lounge,
        }
      })

    const combined = [...availableTransformed, ...onNoticeTransformed, ...letOnlyTransformed]
    const deduped = combined.filter((item, idx, arr) => idx === arr.findIndex(t => t.id === item.id))
    deduped.sort((a, b) => {
      if (!a.available_date && !b.available_date) return 0
      if (!a.available_date) return 1
      if (!b.available_date) return -1
      return a.available_date.localeCompare(b.available_date)
    })

    setAvailableRooms(deduped)
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

      <main className="mx-auto max-w-6xl px-lg py-xl">
        <div className="mb-2xl">
          <h1 className="text-2xl font-bold text-neutral-900">🚪 Available Rooms</h1>
          <p className="mt-sm text-sm text-neutral-600">Send offers and manage available properties</p>
        </div>

        <div>
          {/* Section header + action buttons */}
          <div className="flex items-center justify-between mb-lg gap-md flex-wrap">
            <div className="flex items-center gap-md flex-wrap">
              <h2 className="text-xl font-bold text-neutral-900">Available Rooms</h2>
              <div className="inline-flex rounded-xl bg-white p-[3px] ring-1 ring-neutral-200">
                {([['all', 'All'], ['managed', 'Managed'], ['let_only', 'Let Only']] as const).map(([k, label]) => (
                  <button key={k} type="button" onClick={() => setKind(k)}
                    className={`rounded-lg px-md py-xs text-sm font-semibold ${kind === k ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:text-neutral-900'}`}>
                    {label} ({availableRooms.filter(r => k === 'all' || (k === 'let_only') === !!r.is_let_only).length})
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-sm flex-wrap">
              <button
                onClick={() => { setShowTourModal(true); setTourResult(null) }}
                className="rounded-xl border border-amber-500 bg-amber-50 px-md py-sm text-sm font-semibold text-amber-800 hover:bg-amber-100 transition-colors"
              >
                📍 Area viewing notice
              </button>
              <button
                onClick={() => setShowAddLetOnly(true)}
                className="rounded-xl bg-neutral-900 px-md py-sm text-sm font-semibold text-white hover:bg-neutral-700 transition-colors"
              >
                + Add let-only room
              </button>
            </div>
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
                    <th className="px-lg py-md text-left text-sm font-semibold text-neutral-900">Room Type</th>
                    <th className="px-lg py-md text-left text-sm font-semibold text-neutral-900">Available</th>
                    <th className="px-lg py-md text-left text-sm font-semibold text-neutral-900">Rent (£pcm)</th>
                    <th className="px-lg py-md text-center text-sm font-semibold text-neutral-900">Days on market</th>
                    <th className="px-lg py-md"></th>
                  </tr>
                </thead>
                <tbody>
                  {availableRooms.filter(r => kind === 'all' || (kind === 'let_only') === !!r.is_let_only).map((room, idx) => {
                    const href = room.let_only_listing_id
                      ? `/admin/let-only/${room.let_only_listing_id}`
                      : `/admin/properties/${room.property_id}?tab=units&room=${room.id}`
                    // Add viewing opens the property's own booking form with this room chosen
                    const viewingHref = room.let_only_listing_id ? '/lettings/viewings' : `/admin/properties/${room.property_id}?tab=lettings&book=${room.id}`
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
                      <td className="px-lg py-md text-sm text-neutral-700">
                        {room.room_type || <span className="text-neutral-400 italic">—</span>}
                      </td>
                      <td className="px-lg py-md text-sm text-neutral-600">{formatDate(room.available_date)}</td>
                      <td className="px-lg py-md text-sm font-medium text-neutral-900">
                        £{room.current_asking_rent?.toLocaleString() || '—'}
                      </td>
                      <td className="px-lg py-md text-sm text-center text-neutral-600">
                        {room.days_on_market ?? '—'}
                      </td>
                      <td className="px-lg py-md text-right">
                        <Link href={viewingHref} onClick={e => e.stopPropagation()}
                          className="inline-block whitespace-nowrap rounded-lg bg-neutral-900 px-md py-xs text-xs font-semibold text-white hover:bg-neutral-700">
                          + Add viewing
                        </Link>
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

      {/* ── Cluster viewing tour notice modal ── */}
      {showTourModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-lg" onClick={() => setShowTourModal(false)}>
          <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="border-b border-neutral-200 px-xl py-lg flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-neutral-900">📍 Area Viewing Notice</h2>
                <p className="text-xs text-neutral-500 mt-xs">SMS all current tenants in selected rooms with a heads-up</p>
              </div>
              <button onClick={() => setShowTourModal(false)} className="text-neutral-400 hover:text-neutral-700 text-xl leading-none">✕</button>
            </div>

            <div className="px-xl py-lg space-y-lg">
              {/* Date + time window */}
              <div className="grid grid-cols-3 gap-md">
                <div className="col-span-3 sm:col-span-1">
                  <label className="block text-xs font-semibold text-neutral-600 mb-xs">Viewing date</label>
                  <input
                    type="date"
                    value={tourDate}
                    onChange={e => setTourDate(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 bg-white px-md py-sm text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-600 mb-xs">From</label>
                  <input
                    type="time"
                    value={tourFrom}
                    onChange={e => setTourFrom(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 bg-white px-md py-sm text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-600 mb-xs">To</label>
                  <input
                    type="time"
                    value={tourTo}
                    onChange={e => setTourTo(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 bg-white px-md py-sm text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
              </div>

              {/* Room selector */}
              <div>
                <div className="flex items-center justify-between mb-sm">
                  <label className="text-xs font-semibold text-neutral-600">Select rooms to include</label>
                  <button
                    className="text-xs text-blue-600 hover:underline"
                    onClick={() => setTourRooms(new Set(availableRooms.filter(r => !r.is_let_only).map(r => r.id)))}
                  >
                    Select all managed
                  </button>
                </div>
                <div className="max-h-56 overflow-y-auto rounded-xl border border-neutral-200 divide-y divide-neutral-100">
                  {availableRooms.filter(r => !r.is_let_only).length === 0 && (
                    <p className="px-lg py-md text-sm text-neutral-400 italic">No managed rooms available</p>
                  )}
                  {availableRooms.filter(r => !r.is_let_only).map(room => (
                    <label key={room.id} className="flex items-center gap-md px-lg py-sm cursor-pointer hover:bg-neutral-50">
                      <input
                        type="checkbox"
                        checked={tourRooms.has(room.id)}
                        onChange={() => toggleTourRoom(room.id)}
                        className="rounded border-neutral-300 text-amber-500 focus:ring-amber-400"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-neutral-900 truncate">{room.name}</p>
                        <p className="text-xs text-neutral-500 truncate">{room.property_address || room.property_name}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Message preview */}
              {tourRooms.size > 0 && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 px-lg py-md">
                  <p className="text-xs font-semibold text-amber-700 mb-xs">Message preview</p>
                  <p className="text-xs text-amber-900 leading-relaxed">
                    Hi [Name], we're holding viewings in your area on{' '}
                    <strong>{new Date(tourDate).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</strong>{' '}
                    and may visit your property between <strong>{tourFrom}</strong> and <strong>{tourTo}</strong>. We will knock on the entry door and then on your bedroom door before entering. Please get in touch if this is inconvenient. -[Your name, Capital Rooms | your number]
                  </p>
                </div>
              )}

              {tourResult && (
                <p className={`text-sm font-semibold ${tourResult.startsWith('✅') ? 'text-green-600' : 'text-red-600'}`}>
                  {tourResult}
                </p>
              )}
            </div>

            <div className="border-t border-neutral-200 px-xl py-lg flex justify-end gap-md">
              <button
                onClick={() => setShowTourModal(false)}
                className="rounded-xl border border-neutral-300 px-lg py-sm text-sm font-semibold text-neutral-700 hover:bg-neutral-100"
              >
                Cancel
              </button>
              <button
                onClick={sendTourNotice}
                disabled={tourSending || tourRooms.size === 0}
                className="rounded-xl bg-amber-500 px-lg py-sm text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {tourSending ? 'Sending…' : `Send to ${tourRooms.size} room${tourRooms.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
