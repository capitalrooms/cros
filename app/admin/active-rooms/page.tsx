'use client'

import { useState, useEffect, Fragment } from 'react'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import Link from 'next/link'
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading'

interface Room {
  id: string
  name: string
  unit_code: string | null
  room_type: string | null
  status: string | null
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
    const [{ data: propsData }, { data: roomsData }] = await Promise.all([
      supabase.from('properties').select('id, name, address, property_code, property_type'),
      supabase.from('rooms').select('id, name, unit_code, room_type, status, property_id'),
    ])

    const roomsByProperty: Record<string, Room[]> = {}
    for (const r of roomsData || []) {
      ;(roomsByProperty[r.property_id] ||= []).push({
        id: r.id,
        name: r.name,
        unit_code: r.unit_code,
        room_type: r.room_type,
        status: r.status,
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

    // Sort by property code when set (the intended ordering), else fall back to
    // natural address order. Coded properties come first, in numeric code order.
    merged.sort((a, b) => {
      if (a.property_code && b.property_code) {
        return a.property_code.localeCompare(b.property_code, undefined, { numeric: true })
      }
      if (a.property_code) return -1
      if (b.property_code) return 1
      const [an, as] = addressSortKey(a.address)
      const [bn, bs] = addressSortKey(b.address)
      return an - bn || as.localeCompare(bs)
    })

    setProperties(merged)
  }

  function openRoom(propertyId: string, roomId: string) {
    router.push(`/admin/properties/${propertyId}/rooms/${roomId}?from=all-units`)
  }

  if (loading) return <GenericPageSkeleton />

  const totalRooms = properties.reduce((n, p) => n + p.rooms.length, 0)

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar right={<BackButton href="/admin" />} />

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
                  <th className="px-md py-sm w-[140px]">Unit code</th>
                  <th className="px-md py-sm">Room</th>
                  <th className="px-md py-sm">Type</th>
                </tr>
              </thead>
              <tbody>
                {properties.map((property) => {
                  const isHmo = (property.property_type || 'hmo') === 'hmo'
                  const singleRoom = property.rooms[0]
                  return (
                    <Fragment key={property.id}>
                      {/* Property header row */}
                      <tr
                        className="cursor-pointer bg-neutral-900 text-white hover:bg-neutral-800"
                        onClick={() => router.push(`/admin/properties/${property.id}`)}
                      >
                        <td colSpan={4} className="px-lg py-sm">
                          <div className="flex items-center justify-between gap-md">
                            <div className="min-w-0">
                              {property.property_code && (
                                <span className="mr-sm font-mono text-xs font-bold text-neutral-400">{property.property_code}</span>
                              )}
                              <span className="font-bold text-white">{property.address || property.name}</span>
                              {property.name && property.name !== property.address && (
                                <span className="ml-sm text-xs text-neutral-400">{property.name}</span>
                              )}
                            </div>
                            <span className={`shrink-0 rounded px-md py-xs text-xs font-semibold ${isHmo ? 'bg-purple-600 text-white' : 'bg-teal-600 text-white'}`}>
                              {isHmo ? `HMO · ${property.rooms.length} room${property.rooms.length === 1 ? '' : 's'}` : 'Single let'}
                            </span>
                          </div>
                        </td>
                      </tr>

                      {/* Rooms beneath an HMO */}
                      {isHmo && property.rooms.length === 0 && (
                        <tr key={`empty-${property.id}`}>
                          <td colSpan={4} className="px-md py-sm pl-xl text-xs italic text-neutral-400">
                            No rooms configured yet
                          </td>
                        </tr>
                      )}
                      {isHmo &&
                        property.rooms.map((room) => (
                          <tr
                            key={room.id}
                            className="cursor-pointer border-t border-neutral-200 bg-white hover:bg-neutral-50"
                            onClick={() => openRoom(property.id, room.id)}
                          >
                            <td className="px-md py-sm pl-xl font-mono text-xs text-neutral-700">
                              {room.unit_code || '—'}
                            </td>
                            <td className="px-md py-sm font-medium text-neutral-900">{room.name}, {property.address}</td>
                            <td className="px-md py-sm text-neutral-500">{room.room_type || '—'}</td>
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
