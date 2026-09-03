'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { useRouter, useParams } from 'next/navigation'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading'
import LetOnlyContactsSection from '@/app/components/LetOnlyContactsSection'
import RoomDetailTags from '@/app/components/RoomDetailTags'

export default function LetOnlyDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [listing, setListing] = useState<any>(null)
  const [rooms, setRooms] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)
  // Advert copy editing: roomId → draft text
  const [advertDrafts, setAdvertDrafts] = useState<Record<string, string>>({})
  const [generating, setGenerating] = useState<string | null>(null) // "roomId:format" being generated
  const [savingAdvert, setSavingAdvert] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      if (!data || !['administrator', 'admin', 'lettings'].includes(data.assignment?.role)) {
        router.push('/login')
        return
      }
      await loadData()
      setLoading(false)
    }
    init()
  }, [id])

  async function loadData() {
    const { data: l } = await supabase
      .from('let_only_listings')
      .select('*')
      .eq('id', id)
      .single()
    setListing(l)

    const { data: r } = await supabase
      .from('let_only_rooms')
      .select('*')
      .eq('listing_id', id)
      .order('created_at')
    setRooms(r || [])
    // Seed advert drafts from existing descriptions
    const drafts: Record<string, string> = {}
    for (const room of r || []) drafts[room.id] = room.description || ''
    setAdvertDrafts(drafts)
  }

  async function generateAdvert(room: any, format: 'listing' | 'group') {
    const key = `${room.id}:${format}`
    setGenerating(key)
    try {
      const res = await fetch('/api/let-only/generate-advert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format,
          // Let-only rooms don't have managed property photos, but pass IDs for future
          room_name: room.room_name,
          monthly_rent: room.monthly_rent,
          floor_area_sqm: room.floor_area_sqm,
          available_date: room.available_date,
          has_ensuite: room.has_ensuite,
          has_shared_bathroom: room.has_shared_bathroom,
          has_lounge: room.has_lounge,
          has_washing_machine: listing?.has_washing_machine,
          has_tumble_dryer: listing?.has_tumble_dryer,
          notes: room.description || '',
          address: listing?.address || '',
          postcode: listing?.postcode || '',
        }),
      })
      const data = await res.json()
      if (data.advert) {
        setAdvertDrafts(prev => ({ ...prev, [room.id]: data.advert }))
      }
    } finally {
      setGenerating(null)
    }
  }

  async function saveAdvert(roomId: string) {
    setSavingAdvert(roomId)
    await supabase
      .from('let_only_rooms')
      .update({ description: advertDrafts[roomId] || null })
      .eq('id', roomId)
    setRooms(prev => prev.map(r => r.id === roomId ? { ...r, description: advertDrafts[roomId] } : r))
    setSavingAdvert(null)
    setBanner('Advert copy saved')
    setTimeout(() => setBanner(null), 2500)
  }

  async function toggleActive() {
    if (!listing) return
    setSaving(true)
    await supabase
      .from('let_only_listings')
      .update({ is_active: !listing.is_active })
      .eq('id', id)
    setListing((prev: any) => ({ ...prev, is_active: !prev.is_active }))
    setSaving(false)
  }

  async function updateRoomStatus(roomId: string, status: string) {
    await supabase.from('let_only_rooms').update({ status }).eq('id', roomId)
    setRooms(prev => prev.map(r => r.id === roomId ? { ...r, status } : r))
    setBanner(`Room marked as ${status}`)
    setTimeout(() => setBanner(null), 3000)
  }

  const formatDate = (d: string | null) => d
    ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—'

  if (loading) return <GenericPageSkeleton />
  if (!listing) return (
    <div className="min-h-screen bg-neutral-100 flex items-center justify-center">
      <p className="text-neutral-500">Listing not found</p>
    </div>
  )

  const backHref = typeof window !== 'undefined' && document.referrer.includes('/lettings')
    ? '/lettings'
    : '/admin/available-and-lettings'

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href={backHref} />} />

      <main className="mx-auto max-w-3xl px-lg py-2xl space-y-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-lg">
          <div>
            <div className="flex items-center gap-sm mb-xs">
              <span className="rounded-full bg-purple-100 px-md py-xs text-xs font-semibold text-purple-700">
                🔑 Let-only
              </span>
              {listing.is_active ? (
                <span className="rounded-full bg-emerald-100 px-md py-xs text-xs font-semibold text-emerald-700">Active</span>
              ) : (
                <span className="rounded-full bg-neutral-200 px-md py-xs text-xs font-semibold text-neutral-500">Inactive</span>
              )}
            </div>
            <h1 className="text-2xl font-bold text-neutral-900">{listing.address}</h1>
            {listing.postcode && <p className="text-sm text-neutral-500 mt-xs">{listing.postcode}</p>}
          </div>
          <button
            onClick={toggleActive}
            disabled={saving}
            className={`rounded-xl px-md py-sm text-sm font-semibold transition-colors shrink-0 ${
              listing.is_active
                ? 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
            }`}
          >
            {saving ? '…' : listing.is_active ? 'Mark inactive' : 'Mark active'}
          </button>
        </div>

        {banner && (
          <div className="rounded-xl bg-blue-50 border border-blue-200 px-lg py-sm text-sm text-blue-800">
            {banner}
          </div>
        )}

        {/* Landlord contact */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-lg">
          <h2 className="text-base font-bold text-neutral-900 mb-md">Landlord contact</h2>
          {listing.landlord_name || listing.landlord_phone || listing.landlord_email ? (
            <div className="space-y-xs text-sm text-neutral-700">
              {listing.landlord_name && <p className="font-semibold">{listing.landlord_name}</p>}
              {listing.landlord_phone && (
                <p><a href={`tel:${listing.landlord_phone}`} className="text-blue-600 hover:underline">{listing.landlord_phone}</a></p>
              )}
              {listing.landlord_email && (
                <p><a href={`mailto:${listing.landlord_email}`} className="text-blue-600 hover:underline">{listing.landlord_email}</a></p>
              )}
            </div>
          ) : (
            <p className="text-sm text-neutral-400 italic">No landlord contact details recorded</p>
          )}
          {/* Shared appliances */}
          {(listing.has_washing_machine !== null || listing.has_tumble_dryer !== null) && (
            <div className="mt-md pt-md border-t border-neutral-100">
              <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-xs">Shared appliances</p>
              <div className="flex flex-wrap gap-xs">
                {listing.has_washing_machine === true && (
                  <span className="rounded-full bg-emerald-100 border border-emerald-300 px-sm py-0.5 text-xs text-emerald-800">✓ Washing machine</span>
                )}
                {listing.has_washing_machine === false && (
                  <span className="rounded-full bg-neutral-100 border border-neutral-300 px-sm py-0.5 text-xs text-neutral-500">✗ No washing machine</span>
                )}
                {listing.has_tumble_dryer === true && (
                  <span className="rounded-full bg-emerald-100 border border-emerald-300 px-sm py-0.5 text-xs text-emerald-800">✓ Tumble dryer</span>
                )}
                {listing.has_tumble_dryer === false && (
                  <span className="rounded-full bg-neutral-100 border border-neutral-300 px-sm py-0.5 text-xs text-neutral-500">✗ No tumble dryer</span>
                )}
              </div>
            </div>
          )}
          {listing.notes && (
            <div className="mt-md pt-md border-t border-neutral-100">
              <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-xs">Internal notes</p>
              <p className="text-sm text-neutral-700 whitespace-pre-wrap">{listing.notes}</p>
            </div>
          )}
        </section>

        {/* Rooms */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-lg">
          <h2 className="text-base font-bold text-neutral-900 mb-md">
            Rooms ({rooms.length})
          </h2>
          {rooms.length === 0 ? (
            <p className="text-sm text-neutral-400 italic">No rooms recorded</p>
          ) : (
            <div className="space-y-md">
              {rooms.map(room => (
                <div key={room.id} className="rounded-xl border border-neutral-200 p-md">
                  <div className="flex items-start justify-between gap-md">
                    <div className="flex-1">
                      <p className="font-semibold text-neutral-900">{room.room_name}</p>
                      <div className="flex flex-wrap items-center gap-md mt-xs text-sm text-neutral-500">
                        {room.monthly_rent && <span className="font-medium text-neutral-900">£{Number(room.monthly_rent).toLocaleString()} pcm</span>}
                        {room.floor_area_sqm && <span>{room.floor_area_sqm} m²</span>}
                        {room.available_date && <span>Available {formatDate(room.available_date)}</span>}
                      </div>
                      <div className="mt-sm">
                        <RoomDetailTags
                          has_ensuite={room.has_ensuite}
                          has_shared_bathroom={room.has_shared_bathroom}
                          has_lounge={room.has_lounge}
                        />
                      </div>
                      {/* Advert copy */}
                      <div className="mt-md pt-sm border-t border-neutral-100">
                        <div className="flex items-start justify-between gap-sm mb-xs">
                          <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Advert / post copy</p>
                          <div className="flex gap-xs shrink-0">
                            <button
                              onClick={() => generateAdvert(room, 'listing')}
                              disabled={!!generating}
                              className="text-xs text-purple-600 hover:text-purple-800 font-semibold disabled:opacity-50"
                            >
                              {generating === `${room.id}:listing` ? '✨ Drafting…' : '✨ Advert'}
                            </button>
                            <span className="text-neutral-300 text-xs">|</span>
                            <button
                              onClick={() => generateAdvert(room, 'group')}
                              disabled={!!generating}
                              className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold disabled:opacity-50"
                            >
                              {generating === `${room.id}:group` ? '✨ Drafting…' : '✨ Group post'}
                            </button>
                          </div>
                        </div>
                        <textarea
                          value={advertDrafts[room.id] || ''}
                          onChange={e => setAdvertDrafts(prev => ({ ...prev, [room.id]: e.target.value }))}
                          rows={5}
                          placeholder="Generate an advert listing or a quick group post with the buttons above — then edit and save…"
                          className="w-full rounded-lg border border-neutral-200 px-sm py-xs text-sm text-neutral-900 resize-y focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none"
                        />
                        {(advertDrafts[room.id] || '') !== (room.description || '') && (
                          <button
                            onClick={() => saveAdvert(room.id)}
                            disabled={savingAdvert === room.id}
                            className="mt-xs text-xs text-blue-600 hover:text-blue-800 font-semibold disabled:opacity-50"
                          >
                            {savingAdvert === room.id ? 'Saving…' : 'Save copy'}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0">
                      <span className={`inline-block rounded-full px-sm py-xs text-xs font-semibold ${
                        room.status === 'available' ? 'bg-emerald-100 text-emerald-700'
                        : room.status === 'let' ? 'bg-neutral-200 text-neutral-600'
                        : 'bg-amber-100 text-amber-700'
                      }`}>
                        {room.status === 'available' ? 'Available' : room.status === 'let' ? 'Let' : 'Withdrawn'}
                      </span>
                    </div>
                  </div>
                  {/* Status actions */}
                  {room.status === 'available' && (
                    <div className="flex gap-sm mt-md pt-sm border-t border-neutral-100">
                      <button
                        onClick={() => updateRoomStatus(room.id, 'let')}
                        className="rounded-lg bg-neutral-900 px-md py-xs text-xs font-semibold text-white hover:bg-neutral-700 transition-colors"
                      >
                        Mark as let
                      </button>
                      <button
                        onClick={() => updateRoomStatus(room.id, 'withdrawn')}
                        className="rounded-lg border border-neutral-200 px-md py-xs text-xs font-medium text-neutral-600 hover:bg-neutral-50 transition-colors"
                      >
                        Withdraw
                      </button>
                    </div>
                  )}
                  {room.status !== 'available' && (
                    <div className="mt-sm pt-sm border-t border-neutral-100">
                      <button
                        onClick={() => updateRoomStatus(room.id, 'available')}
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        Re-list as available
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Remaining tenant contacts */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-lg">
          <h2 className="text-base font-bold text-neutral-900 mb-md">Remaining tenant contacts</h2>
          <p className="text-xs text-neutral-500 mb-md">
            These contacts are notified by email when a viewing is booked, rescheduled, or cancelled at this property. They are not CROS users — contact details only.
          </p>
          <LetOnlyContactsSection listingId={id} />
        </section>
      </main>
    </div>
  )
}
