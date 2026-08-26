'use client'

import { useState, useEffect, use } from 'react'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'

interface Room {
  id: string
  name: string
  property_id: string
  description: string | null
  created_at: string
  room_type: string | null
  room_size: number | null
  location_in_house: string | null
  features: string | null
  furnishings_description: string | null
  has_ensuite: boolean | null
}

interface Property {
  name: string
  address: string
  bedrooms: number
}

interface Tenancy {
  id: string
  tenant_id: string
  start_date: string
  end_date: string | null
  rent_monthly: number | null
  status: string
  people: {
    id: string
    email: string
    full_name: string | null
  }
}

interface MaintenanceIssue {
  id: string
  title: string
  description: string
  status: string
  priority: string
  created_at: string
  created_by: string | null
  people: {
    full_name: string | null
  } | null
}

interface RoomImage {
  id: string
  image_type: string
  file_name: string
  file_url: string
  display_order: number
}

interface MaintenanceAggregate {
  title: string
  description: string | null
  icon: string
  report_count: number
  latest_reported: string
  priority: string
}

export default function RoomDashboardPage({
  params,
}: {
  params: Promise<{ id: string; roomId: string }>
}) {
  const router = useRouter()
  const { id: propertyId, roomId } = use(params)
  const searchParams = useSearchParams()
  const cameFromAllUnits = searchParams.get('from') === 'all-units'
  const [room, setRoom] = useState<Room | null>(null)
  const [property, setProperty] = useState<Property | null>(null)
  const [currentTenancy, setCurrentTenancy] = useState<Tenancy | null>(null)
  const [previousTenancies, setPreviousTenancies] = useState<Tenancy[]>([])
  const [maintenanceHistory, setMaintenanceHistory] = useState<MaintenanceIssue[]>([])
  const [roomImages, setRoomImages] = useState<RoomImage[]>([])
  const [purchases, setPurchases] = useState<any[]>([])
  const [maintenanceByTitle, setMaintenanceByTitle] = useState<Map<string, MaintenanceAggregate>>(new Map())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      if (!data || (data.assignment?.role !== 'administrator' && data.assignment?.role !== 'admin')) {
        router.push('/login')
        return
      }

      const supabase = createClient()

      // Fetch room data
      const { data: roomData, error: roomError } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', roomId)
        .single()

      if (roomError || !roomData) {
        console.error('Failed to load room:', roomError)
        router.push(`/admin/properties/${propertyId}`)
        return
      }
      setRoom(roomData)

      // Fetch property data
      const { data: propData, error: propError } = await supabase
        .from('properties')
        .select('name, address, bedrooms')
        .eq('id', propertyId)
        .single()

      if (propError) console.error('Failed to load property:', propError)
      else setProperty(propData)

      // Fetch current tenancy
      const { data: currentTenancyData, error: tenancyError } = await supabase
        .from('tenancies')
        .select(`
          id,
          person_id,
          start_date,
          end_date,
          rent_amount,
          people(id, email, full_name)
        `)
        .eq('room_id', roomId)
        .is('end_date', null)
        .single()

      if (!tenancyError && currentTenancyData) {
        setCurrentTenancy({
          id: currentTenancyData.id,
          tenant_id: currentTenancyData.person_id,
          start_date: currentTenancyData.start_date,
          end_date: currentTenancyData.end_date,
          rent_monthly: currentTenancyData.rent_amount,
          status: 'active',
          people: currentTenancyData.people
        } as Tenancy)
      }

      // Fetch previous tenancies
      const { data: prevTenancies, error: prevError } = await supabase
        .from('tenancies')
        .select(`
          id,
          person_id,
          start_date,
          end_date,
          rent_amount,
          people(id, email, full_name)
        `)
        .eq('room_id', roomId)
        .not('end_date', 'is', null)
        .order('end_date', { ascending: false })
        .limit(10)

      if (!prevError && prevTenancies) {
        const formattedPrev = prevTenancies.map(t => ({
          id: t.id,
          tenant_id: t.person_id,
          start_date: t.start_date,
          end_date: t.end_date,
          rent_monthly: t.rent_amount,
          status: 'completed',
          people: t.people
        })) as Tenancy[]
        setPreviousTenancies(formattedPrev)
      }

      // Fetch maintenance history
      const { data: maintenance, error: maintError } = await supabase
        .from('maintenance_tickets')
        .select(`
          id,
          title,
          description,
          status,
          priority,
          created_at,
          created_by,
          people(full_name)
        `)
        .eq('room_id', roomId)
        .order('created_at', { ascending: false })

      if (!maintError) {
        setMaintenanceHistory(maintenance || [])

        // Aggregate maintenance by title
        const aggregated = new Map<string, MaintenanceAggregate>()
        ;(maintenance || []).forEach((issue) => {
          if (!aggregated.has(issue.title)) {
            aggregated.set(issue.title, {
              title: issue.title,
              description: issue.description,
              icon: getIconForIssue(issue.title),
              report_count: 0,
              latest_reported: issue.created_at,
              priority: issue.priority,
            })
          }
          const agg = aggregated.get(issue.title)!
          agg.report_count += 1
          if (new Date(issue.created_at) > new Date(agg.latest_reported)) {
            agg.latest_reported = issue.created_at
          }
        })
        setMaintenanceByTitle(aggregated)
      }

      // Fetch this room's photos (property_photos tagged to this room)
      const { data: images, error: imagesError } = await supabase
        .from('property_photos')
        .select('*')
        .eq('room_id', roomId)
        .order('display_order', { ascending: true })

      if (!imagesError) setRoomImages(images || [])

      // Fetch purchases logged against this specific room
      const { data: purchasesData } = await supabase
        .from('purchases')
        .select('*')
        .eq('room_id', roomId)
        .order('purchased_date', { ascending: false, nullsFirst: false })
      if (purchasesData) setPurchases(purchasesData)

      setLoading(false)
    }

    init()
  }, [propertyId, roomId, router])

  function getIconForIssue(title: string): string {
    const lower = title.toLowerCase()
    if (lower.includes('heat')) return '🔥'
    if (lower.includes('water') || lower.includes('tap') || lower.includes('drip')) return '💧'
    if (lower.includes('door') || lower.includes('lock')) return '🚪'
    if (lower.includes('electric') || lower.includes('light')) return '⚡'
    if (lower.includes('window')) return '🪟'
    return '⚙️'
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50">
        <AppBar right={<BackButton href={cameFromAllUnits ? '/admin/active-rooms' : `/admin/properties/${propertyId}`} />} />
        <div className="mx-auto max-w-6xl px-lg py-2xl flex items-center justify-center">
          <div className="text-sm text-neutral-500">Loading room...</div>
        </div>
      </div>
    )
  }

  if (!room || !property) {
    return (
      <div className="min-h-screen bg-neutral-50">
        <AppBar right={<BackButton href={cameFromAllUnits ? '/admin/active-rooms' : `/admin/properties/${propertyId}`} />} />
        <div className="mx-auto max-w-6xl px-lg py-2xl">
          <div className="p-lg rounded-lg border border-red-300 bg-red-50">
            <p className="text-sm font-semibold text-red-700">Room not found</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <AppBar right={<BackButton href={cameFromAllUnits ? '/admin/active-rooms' : `/admin/properties/${propertyId}`} />} />

      <main className="mx-auto max-w-6xl px-lg py-2xl">
        {/* Comprehensive Room Details Card - Black background */}
        <div className="bg-neutral-900 text-white rounded-2xl p-lg mb-lg overflow-hidden">
          {/* Header */}
          <div className="mb-lg">
            <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-sm">DASHBOARD</p>
            <h1 className="text-3xl font-bold mb-xs">{room.name}, {property.name}</h1>
            <p className="text-sm text-neutral-300">{property.address}</p>
          </div>

          {/* Room Details Grid */}
          <div className="border-t border-neutral-700 pt-lg mb-lg">
            <div className="grid gap-lg md:grid-cols-4">
              {room.room_type && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-xs">TYPE</p>
                  <p className="font-semibold text-white text-lg">{room.room_type}</p>
                </div>
              )}
              {room.room_size && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-xs">SIZE</p>
                  <p className="font-semibold text-white text-lg">{room.room_size} m²</p>
                </div>
              )}
              {room.has_ensuite && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-xs">ENSUITE</p>
                  <p className="font-semibold text-white text-lg">Yes 🚿</p>
                </div>
              )}
              {room.location_in_house && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-xs">LOCATION</p>
                  <p className="font-semibold text-white text-lg">{room.location_in_house}</p>
                </div>
              )}
              {room.features && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-xs">FEATURES</p>
                  <p className="font-semibold text-white text-lg">{room.features}</p>
                </div>
              )}
            </div>
          </div>

          {/* Current Tenant Section (in header) */}
          {currentTenancy ? (
            <div className="border-t border-neutral-700 pt-lg mb-lg">
              <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-md">CURRENT TENANT</p>
              <div className="grid gap-lg md:grid-cols-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-xs">TENANT NAME</p>
                  <Link href={`/admin/properties/${propertyId}/rooms/${roomId}/tenancy/${currentTenancy.id}`}>
                    <p className="font-semibold text-blue-400 hover:text-blue-300 text-lg">
                      {currentTenancy.people?.full_name || currentTenancy.people?.email || 'Unknown'}
                    </p>
                  </Link>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-xs">MONTHLY RENT</p>
                  <p className="font-bold text-white text-lg">£{currentTenancy.rent_monthly || '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-xs">START DATE</p>
                  <p className="font-semibold text-white">{new Date(currentTenancy.start_date).toLocaleDateString('en-GB')}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-xs">STATUS</p>
                  <p className="font-semibold text-white">{currentTenancy.status}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="border-t border-neutral-700 pt-lg mb-lg">
              <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-xs">CURRENT TENANT</p>
              <p className="text-neutral-400 italic">Available - No current tenant</p>
            </div>
          )}

          {/* Room Images & Floor Plan Section (inside black card) */}
          {roomImages.length > 0 && (
            <div className="border-t border-neutral-700 pt-lg mb-lg">
              <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-md">PHOTOS</h3>
              <div className="grid gap-md md:grid-cols-3">
                {roomImages.map((image) => (
                  <div
                    key={image.id}
                    className="rounded-lg bg-neutral-800 overflow-hidden aspect-square flex items-center justify-center border border-neutral-700"
                  >
                    {image.file_url ? (
                      <img
                        src={image.file_url}
                        alt={image.file_name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="text-center">
                        <p className="text-2xl mb-xs">📷</p>
                        <p className="text-xs text-neutral-500">{image.image_type}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Furnishings Section (inside black card) */}
          {room.furnishings_description && (
            <div className="border-t border-neutral-700 pt-lg">
              <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-md">FURNISHINGS</h3>
              <p className="text-neutral-200">{room.furnishings_description}</p>
            </div>
          )}

          {/* Back button at bottom */}
          <div className="border-t border-neutral-700 pt-lg mt-lg flex flex-wrap gap-lg">
            {cameFromAllUnits && (
              <Link href="/admin/active-rooms">
                <button className="text-sm text-neutral-400 hover:text-white font-semibold transition">
                  ← Back to All Units
                </button>
              </Link>
            )}
            <Link href={`/admin/properties/${propertyId}`}>
              <button className="text-sm text-neutral-400 hover:text-white font-semibold transition">
                ← Back to property
              </button>
            </Link>
          </div>
        </div>

        {/* Content Area */}
        <div className="bg-white px-lg pt-lg pb-2xl">

        {/* Current Tenancy Section */}
        <div className="mb-3xl">
          <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-600 mb-md">CURRENT TENANCY</h3>
          {currentTenancy ? (
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-lg">
              <div className="grid gap-lg md:grid-cols-2 mb-lg">
                <div>
                  <p className="text-xs uppercase tracking-wider text-neutral-600 font-semibold mb-xs">TENANT</p>
                  <Link href={`/admin/properties/${propertyId}/rooms/${roomId}/tenancy/${currentTenancy.id}`}>
                    <p className="font-semibold text-blue-600 hover:text-blue-700 text-lg mb-md">
                      {currentTenancy.people?.full_name || currentTenancy.people?.email || 'Unknown'}
                    </p>
                  </Link>
                  <p className="text-xs uppercase tracking-wider text-neutral-600 font-semibold mb-xs">START DATE</p>
                  <p className="font-semibold text-neutral-900">
                    {new Date(currentTenancy.start_date).toLocaleDateString('en-GB')}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-neutral-600 font-semibold mb-xs">MONTHLY RENT</p>
                  <p className="font-bold text-neutral-900 text-lg mb-md">£{currentTenancy.rent_monthly || '—'}</p>
                  <p className="text-xs uppercase tracking-wider text-neutral-600 font-semibold mb-xs">STATUS</p>
                  <p className="font-semibold text-neutral-900">{String(currentTenancy.status).replace(/_/g, ' ')}</p>
                </div>
              </div>
              {currentTenancy.end_date && (
                <div className="pt-lg border-t border-neutral-200">
                  <p className="text-xs uppercase tracking-wider text-neutral-600 font-semibold mb-xs">END DATE</p>
                  <p className="font-semibold text-neutral-900">
                    {new Date(currentTenancy.end_date).toLocaleDateString('en-GB')}
                  </p>
                </div>
              )}
              <div className="pt-lg border-t border-neutral-200 mt-lg">
                <Link href={`/admin/properties/${propertyId}/rooms/${roomId}/tenancy/${currentTenancy.id}`}>
                  <button className="px-lg py-md bg-neutral-900 text-white rounded-lg font-semibold text-sm hover:bg-neutral-800 transition">
                    View Full Tenancy Details
                  </button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-lg">
              <p className="text-neutral-600 text-sm">No current tenancy - Room is available</p>
            </div>
          )}
        </div>

        {/* Maintenance History Section - Black Card */}
        <div className="bg-neutral-900 text-white rounded-2xl p-lg mb-lg overflow-hidden">
          <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-xs">
            MAINTENANCE HISTORY (THIS ROOM, ALL TIME)
          </h3>
          <p className="text-sm text-neutral-300 mb-lg">Issues reported by any tenant living in this room over the years</p>

          {maintenanceByTitle.size > 0 ? (
            <div className="space-y-sm">
              {Array.from(maintenanceByTitle.values()).map((issue) => (
                <div
                  key={issue.title}
                  className="rounded-lg border border-neutral-700 bg-neutral-800 p-lg hover:bg-neutral-700 transition"
                >
                  <div className="flex items-start justify-between gap-md">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white text-lg">
                        <span className="mr-md text-2xl">{issue.icon}</span>
                        {issue.title}
                      </p>
                      {issue.description && (
                        <p className="text-sm text-neutral-400 mt-xs">{issue.description}</p>
                      )}
                      <p className="text-sm text-neutral-400 mt-md">
                        Last reported: {new Date(issue.latest_reported).toLocaleDateString('en-GB')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-white">{issue.report_count}</p>
                      <p className="text-xs text-neutral-500 mt-xs">
                        {issue.report_count === 1 ? 'report' : 'reports'}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-neutral-700 bg-neutral-800 p-lg">
              <p className="text-neutral-400 text-sm">No maintenance history</p>
            </div>
          )}
        </div>

        {/* Purchases for this room */}
        <div className="mb-lg">
          <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-600 mb-md">PURCHASES (THIS ROOM)</h3>
          {purchases.length > 0 ? (
            <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-600">
                    <th className="px-md py-sm">Item</th>
                    <th className="px-md py-sm">Category</th>
                    <th className="px-md py-sm">Date</th>
                    <th className="px-md py-sm text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((p) => (
                    <tr key={p.id} className="border-b border-neutral-100 last:border-0">
                      <td className="px-md py-sm">
                        <p className="font-medium text-neutral-900">{p.name || '—'}</p>
                        {p.make_model && <p className="text-xs text-neutral-500">{p.make_model}</p>}
                      </td>
                      <td className="px-md py-sm text-neutral-700 capitalize">{(p.category || '').replace('_', ' ')}</td>
                      <td className="px-md py-sm text-neutral-500 text-xs">
                        {p.purchased_date ? new Date(p.purchased_date).toLocaleDateString('en-GB') : '—'}
                      </td>
                      <td className="px-md py-sm text-right text-neutral-700">
                        {p.cost != null ? `£${Number(p.cost).toLocaleString()}` : <span className="text-neutral-400">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-lg">
              <p className="text-sm text-neutral-500">
                Nothing logged for this room yet. Add purchases from the property&apos;s Purchases tab and record them for this room.
              </p>
            </div>
          )}
        </div>

        {/* Previous Tenancies */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-600 mb-md">PREVIOUS TENANCIES</h3>
          {previousTenancies.length > 0 ? (
            <div className="space-y-sm">
              {previousTenancies.map((tenancy) => (
                <div
                  key={tenancy.id}
                  className="rounded-lg border border-neutral-200 bg-neutral-50 p-lg"
                >
                  <div className="flex items-start justify-between gap-md">
                    <div className="flex-1">
                      <p className="font-semibold text-neutral-900">
                        {tenancy.people?.full_name || tenancy.people?.email || 'Unknown'}
                      </p>
                      <p className="text-sm text-neutral-600 mt-xs">
                        {new Date(tenancy.start_date).toLocaleDateString('en-GB')} →{' '}
                        {tenancy.end_date
                          ? new Date(tenancy.end_date).toLocaleDateString('en-GB')
                          : 'Present'}
                      </p>
                      {tenancy.rent_monthly && (
                        <p className="text-sm font-semibold text-neutral-900 mt-xs">£{tenancy.rent_monthly}/month</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-lg">
              <p className="text-neutral-600 text-sm">No previous tenancies</p>
            </div>
          )}
        </div>

        {/* Compliance Section */}
        <div className="mt-3xl">
          <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-600 mb-md">COMPLIANCE</h3>
          <div className="bg-neutral-900 text-white rounded-2xl p-lg">
            <p className="text-sm text-neutral-300 mb-lg">Fire safety, gas checks, and certifications for this room</p>

            <div className="space-y-md">
              {/* Fire Door Checks */}
              <div className="rounded-lg border border-neutral-700 bg-neutral-800 p-lg">
                <div className="flex items-start justify-between gap-md mb-md">
                  <div>
                    <p className="font-semibold text-white">🚪 Fire Door Checks</p>
                    <p className="text-xs text-neutral-400 mt-xs">Monthly inspections</p>
                  </div>
                </div>
                <div className="bg-neutral-900 rounded p-md">
                  <p className="text-sm text-neutral-400">No compliance logs yet</p>
                </div>
              </div>

              {/* Smoke Alarm Tests */}
              <div className="rounded-lg border border-neutral-700 bg-neutral-800 p-lg">
                <div className="flex items-start justify-between gap-md mb-md">
                  <div>
                    <p className="font-semibold text-white">🔔 Smoke Alarm Tests</p>
                    <p className="text-xs text-neutral-400 mt-xs">Quarterly function tests</p>
                  </div>
                </div>
                <div className="bg-neutral-900 rounded p-md">
                  <p className="text-sm text-neutral-400">No compliance logs yet</p>
                </div>
              </div>

              {/* Gas Safety */}
              <div className="rounded-lg border border-neutral-700 bg-neutral-800 p-lg">
                <div className="flex items-start justify-between gap-md mb-md">
                  <div>
                    <p className="font-semibold text-white">⚙️ Gas Safety Certificate</p>
                    <p className="text-xs text-neutral-400 mt-xs">Annual requirement</p>
                  </div>
                </div>
                <div className="bg-neutral-900 rounded p-md">
                  <p className="text-sm text-neutral-400">No certificates on file</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        </div>
      </main>
    </div>
  )
}
