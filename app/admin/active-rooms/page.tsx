'use client'

import { useState, useEffect, Fragment } from 'react'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import Link from 'next/link'
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading'
import PropertyHeader from '@/app/components/PropertyHeader'

interface Room {
  id: string
  name: string
  unit_code: string | null
  room_type: string | null
  status: string | null
  tenant_name: string | null
  tenant_id: string | null
  has_push: boolean
}

interface Property {
  id: string
  name: string
  address: string
  property_code: string | null
  property_type: string | null
  rooms: Room[]
}

// Natural sort: order by the leading number in the address (4, 12, 71…),
// then alphabetically. Falls back to the end for addresses with no number.
function addressSortKey(address: string): [number, string] {
  const m = (address || '').match(/\d+/)
  return [m ? parseInt(m[0], 10) : Number.MAX_SAFE_INTEGER, (address || '').toLowerCase()]
}

function statusStyle(status: string | null) {
  switch (status) {
    case 'available':
      return 'bg-green-100 text-green-800'
    case 'on_notice':
      return 'bg-amber-100 text-amber-800'
    case 'occupied':
      return 'bg-neutral-200 text-neutral-700'
    default:
      return 'bg-neutral-100 text-neutral-500'
  }
}

function statusLabel(status: string | null) {
  if (!status) return '—'
  if (status === 'on_notice') return 'On notice'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

export default function AllUnitsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [properties, setProperties] = useState<Property[]>([])

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      if (!data || (data.assignment?.role !== 'administrator' && data.assignment?.role !== 'admin')) {
        router.push('/login')
        return
      }
      await loadData()
      setLoading(false)
    }
    init()
  }, [router])

  async function loadData() {
    const [{ data: propsData }, { data: roomsData }, { data: tenanciesData }, { data: pushData }] = await Promise.all([
      supabase.from('properties').select('id, name, address, property_code, property_type'),
      supabase.from('rooms').select('id, name, unit_code, room_type, status, property_id'),
      // Current tenancies: rolling (no end_date) OR on-notice (future end_date)
      supabase.from('tenancies').select('room_id, person_id, people!person_id(id, first_name, last_name, full_name, email)').or(`end_date.is.null,end_date.gte.${new Date().toISOString().split('T')[0]}`),
      // People with active push subscriptions
      supabase.from('push_subscriptions').select('person_id').not('person_id', 'is', null),
    ])

    // Build push lookup (person_id → true)
    const pushSet = new Set((pushData || []).map((p: any) => p.person_id))

    // Build tenancy lookup (room_id → { person_id, name })
    const tenancyByRoom: Record<string, { person_id: string; name: string }> = {}
    for (const t of tenanciesData || []) {
      const p = (t as any).people
      const name = p
        ? [p.first_name, p.last_name].filter(Boolean).join(' ') || p.full_name || p.email || '—'
        : '—'
      tenancyByRoom[t.room_id] = { person_id: t.person_id, name }
    }

    const roomsByProperty: Record<string, Room[]> = {}
    for (const r of roomsData || []) {
      const tenancy = tenancyByRoom[r.id]
      ;(roomsByProperty[r.property_id] ||= []).push({
        id: r.id,
        name: r.name,
        unit_code: r.unit_code,
        room_type: r.room_type,
        status: r.status,
        tenant_name: tenancy?.name ?? null,
        tenant_id: tenancy?.person_id ?? null,
        has_push: tenancy ? pushSet.has(tenancy.person_id) : false,
      })
    }

    const merged: Property[] = (propsData || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      address: p.address,
      property_code: p.property_code,
      property_type: p.property_type,
      rooms: (roomsByProperty[p.id] || []).sort((a, b) => {
        // Order rooms by unit_code when present, else by name.
        const ak = a.unit_code || a.name || ''
        const bk = b.unit_code || b.name || ''
        return ak.localeCompare(bk, undefined, { numeric: true })
      }),
    }))

    // Sort all properties by name alphabetically (numeric-aware so "4 Willis" < "12 Saltwell" < "71 Alloa").
    // Previously coded properties were forced first, which pushed uncoded properties to the bottom — regression.
    merged.sort((a, b) =>
      (a.name || a.address || '').localeCompare(b.name || b.address || '', undefined, { numeric: true, sensitivity: 'base' })
    )

    setProperties(merged)
  }

  function openRoom(propertyId: string, roomId: string) {
    router.push(`/admin/properties/${propertyId}?tab=units&room=${roomId}`)
  }

  if (loading) return <GenericPageSkeleton />

  const totalRooms = properties.reduce((n, p) => n + p.rooms.length, 0)

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin" />} />

      <main className="mx-auto max-w-5xl px-lg py-2xl">
        <div className="mb-xl">
          <h1 className="text-3xl font-bold text-neutral-900">🏢 All Units</h1>
          <p className="mt-sm text-sm text-neutral-600">
            Every property we manage — {properties.length} propert{properties.length === 1 ? 'y' : 'ies'}, {totalRooms} room{totalRooms === 1 ? '' : 's'}. Click a room to open its dashboard.
          </p>
        </div>

        {properties.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center">
            <p className="text-sm text-neutral-500">No properties yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-neutral-300 bg-white">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-neutral-100 text-left text-xs font-semibold uppercase tracking-wide text-neutral-600">
                  <th className="px-md py-sm w-[130px]">Unit code</th>
                  <th className="px-md py-sm">Room</th>
                  <th className="px-md py-sm hidden sm:table-cell w-[90px]">Status</th>
                  <th className="px-md py-sm">Tenant</th>
                  <th className="px-md py-sm w-[52px] text-center" title="Push notifications enabled">🔔</th>
                </tr>
              </thead>
              <tbody>
                {properties.map((property) => {
                  const isHmo = (property.property_type || 'hmo') === 'hmo'
                  return (
                    <Fragment key={property.id}>
                      {/* Property header row */}
                      <tr className="bg-neutral-900 text-white hover:bg-neutral-800">
                        <td colSpan={5} className="p-0">
                          <PropertyHeader
                            id={property.id}
                            name={property.name}
                            address={property.address}
                            propertyCode={property.property_code}
                            propertyType={property.property_type as 'hmo' | 'single_let' | undefined}
                            roomCount={property.rooms.length}
                            compact={true}
                          />
                        </td>
                      </tr>

                      {/* Rooms beneath an HMO */}
                      {isHmo && property.rooms.length === 0 && (
                        <tr key={`empty-${property.id}`}>
                          <td colSpan={5} className="px-md py-sm pl-xl text-xs italic text-neutral-400">
                            No rooms configured yet
                          </td>
                        </tr>
                      )}
                      {property.rooms.map((room) => (
                        <tr
                          key={room.id}
                          className="cursor-pointer border-t border-neutral-200 bg-white hover:bg-neutral-50"
                          onClick={() => openRoom(property.id, room.id)}
                        >
                          <td className="px-md py-sm pl-xl font-mono text-xs text-neutral-700">
                            {room.unit_code || '—'}
                          </td>
                          <td className="px-md py-sm font-medium text-neutral-900">{room.name}</td>
                          <td className="px-md py-sm hidden sm:table-cell">
                            <span className={`text-xs font-semibold px-sm py-xs rounded-full ${statusStyle(room.status)}`}>
                              {statusLabel(room.status)}
                            </span>
                          </td>
                          <td className="px-md py-sm text-sm text-neutral-700">
                            {room.tenant_name || <span className="text-neutral-400 italic">Vacant</span>}
                          </td>
                          <td className="px-md py-sm text-center">
                            {room.tenant_id
                              ? room.has_push
                                ? <span title="Push notifications on" className="text-base">🔔</span>
                                : <span title="No push notifications" className="text-base opacity-30">🔕</span>
                              : null
                            }
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
