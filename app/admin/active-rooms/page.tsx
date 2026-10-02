'use client'

import { useState, useEffect, Fragment, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { blockAddress } from '@/lib/formatAddress'
import { useRouter } from 'next/navigation'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import Link from 'next/link'
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading'
import { sortPropertiesNumerically } from '@/lib/sortProperties'

interface Room {
  id: string
  name: string
  unit_code: string | null
  room_type: string | null
  status: string | null
  tenant_name: string | null
  tenant_id: string | null
  tenancy_id: string | null                 // the current tenancy → its letting file
  incoming: { tenancy_id: string; name: string; start_date: string } | null   // let agreed, moving in later
  move_out_date: string | null
  has_push: boolean
  property_id: string
  property_name: string
  property_address: string
  property_code: string | null
  property_type: string | null
}

interface Property {
  id: string
  name: string
  address: string
  property_code: string | null
  property_type: string | null
  rooms: Room[]
}

function statusStyle(status: string | null) {
  switch (status) {
    case 'available':  return 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
    case 'on_notice':  return 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
    case 'occupied':   return 'bg-neutral-100 text-neutral-600'
    default:           return 'bg-neutral-100 text-neutral-400'
  }
}

function statusLabel(status: string | null) {
  if (!status) return '—'
  if (status === 'on_notice') return 'On notice'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function roomTypeBadge(roomType: string | null) {
  if (!roomType) return null
  const map: Record<string, { label: string; cls: string }> = {
    double:          { label: 'Double',    cls: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' },
    single:          { label: 'Single',    cls: 'bg-purple-50 text-purple-700 ring-1 ring-purple-200' },
    ensuite:         { label: 'En-suite',  cls: 'bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200' },
    studio:          { label: 'Studio',    cls: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200' },
    large_double:    { label: 'Lg Double', cls: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' },
    small_double:    { label: 'Sm Double', cls: 'bg-sky-50 text-sky-600 ring-1 ring-sky-200' },
  }
  const entry = map[roomType.toLowerCase()] || { label: roomType, cls: 'bg-neutral-100 text-neutral-500' }
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${entry.cls}`}>{entry.label}</span>
}

export default function AllUnitsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading]       = useState(true)
  const [properties, setProperties] = useState<Property[]>([])
  const [query, setQuery]           = useState('')

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      if (!data || !['administrator', 'admin', 'lettings'].includes(data.assignment?.role ?? '')) {
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
      supabase.from('tenancies')
        .select('id, room_id, person_id, start_date, end_date, notice_received_date, people!person_id(id, first_name, last_name, full_name, email)')
        .or(`end_date.is.null,end_date.gte.${new Date().toISOString().split('T')[0]}`),
      supabase.from('push_subscriptions').select('person_id').not('person_id', 'is', null),
    ])

    const pushSet = new Set((pushData || []).map((p: any) => p.person_id))

    // each room's current tenant, and anyone let agreed to move in later (start date still to come)
    const today = new Date().toISOString().split('T')[0]
    const tenancyByRoom: Record<string, { id: string; person_id: string; name: string; end_date: string | null }> = {}
    const incomingByRoom: Record<string, { tenancy_id: string; name: string; start_date: string }> = {}
    for (const t of tenanciesData || []) {
      const p = (t as any).people
      const name = p
        ? [p.first_name, p.last_name].filter(Boolean).join(' ') || p.full_name || p.email || '—'
        : '—'
      if ((t as any).start_date > today) {
        const cur = incomingByRoom[t.room_id]
        if (!cur || (t as any).start_date < cur.start_date) incomingByRoom[t.room_id] = { tenancy_id: (t as any).id, name, start_date: (t as any).start_date }
      // "Moves out" only once notice is recorded — a fixed-term end date alone doesn't mean they're leaving
      } else tenancyByRoom[t.room_id] = { id: (t as any).id, person_id: t.person_id, name, end_date: (t as any).notice_received_date ? (t as any).end_date ?? null : null }
    }

    const roomsByProperty: Record<string, Room[]> = {}
    for (const r of roomsData || []) {
      const tenancy = tenancyByRoom[r.id]
      ;(roomsByProperty[r.property_id] ||= []).push({
        id: r.id, name: r.name, unit_code: r.unit_code, room_type: r.room_type,
        status: r.status,
        tenant_name: tenancy?.name ?? null,
        tenant_id: tenancy?.person_id ?? null,
        tenancy_id: tenancy?.id ?? null,
        incoming: incomingByRoom[r.id] ?? null,
        move_out_date: tenancy?.end_date ?? null,
        has_push: tenancy ? pushSet.has(tenancy.person_id) : false,
        property_id: r.property_id,
        property_name: '', property_address: '', property_code: null, property_type: null,
      })
    }

    const merged: Property[] = (propsData || []).map((p: any) => ({
      id: p.id, name: p.name, address: p.address,
      property_code: p.property_code, property_type: p.property_type,
      rooms: (roomsByProperty[p.id] || [])
        .map(r => ({ ...r, property_name: p.name, property_address: p.address, property_code: p.property_code, property_type: p.property_type }))
        .sort((a, b) => (a.unit_code || a.name || '').localeCompare(b.unit_code || b.name || '', undefined, { numeric: true })),
    }))

    setProperties(sortPropertiesNumerically(merged))
  }

  // Flat list of all rooms for search
  const allRooms = useMemo(() => properties.flatMap(p => p.rooms), [properties])

  // Search filter
  const q = query.toLowerCase().trim()
  const isSearching = q.length > 0

  const filteredRooms = useMemo(() => {
    if (!q) return []
    return allRooms.filter(r =>
      (r.name || '').toLowerCase().includes(q) ||
      (r.unit_code || '').toLowerCase().includes(q) ||
      (r.tenant_name || '').toLowerCase().includes(q) ||
      (r.property_name || '').toLowerCase().includes(q) ||
      (r.property_address || '').toLowerCase().includes(q)
    )
  }, [allRooms, q])

  // When searching, show filtered flat list; otherwise show grouped by property
  const filteredProperties = useMemo(() => {
    if (!q) return properties
    const propertyIds = new Set(filteredRooms.map(r => r.property_id))
    return properties
      .filter(p => propertyIds.has(p.id))
      .map(p => ({ ...p, rooms: p.rooms.filter(r =>
        (r.name || '').toLowerCase().includes(q) ||
        (r.unit_code || '').toLowerCase().includes(q) ||
        (r.tenant_name || '').toLowerCase().includes(q) ||
        (r.property_name || '').toLowerCase().includes(q) ||
        (r.property_address || '').toLowerCase().includes(q)
      )}))
  }, [properties, filteredRooms, q])

  if (loading) return <GenericPageSkeleton />

  const totalProperties = properties.length
  const totalRooms = allRooms.length
  const occupied   = allRooms.filter(r => r.status === 'occupied').length
  const available  = allRooms.filter(r => r.status === 'available').length
  const onNotice   = allRooms.filter(r => r.status === 'on_notice').length

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin" />} />

      <main className="mx-auto max-w-6xl px-lg py-xl">

        {/* ── Header ── */}
        <div className="mb-xl">
          <h1 className="text-2xl font-bold text-neutral-900">All Units</h1>
          <p className="mt-xs text-sm text-neutral-500">
            {totalProperties} propert{totalProperties === 1 ? 'y' : 'ies'} · {totalRooms} room{totalRooms === 1 ? '' : 's'}
          </p>
        </div>

        {/* ── Stats strip ── */}
        <div className="grid grid-cols-3 gap-sm mb-xl">
          <div className="rounded-xl bg-white border border-neutral-200 px-md py-sm text-center">
            <p className="text-2xl font-bold text-neutral-900">{occupied}</p>
            <p className="text-xs text-neutral-500 mt-0.5">Occupied</p>
          </div>
          <div className="rounded-xl bg-white border border-emerald-200 px-md py-sm text-center">
            <p className="text-2xl font-bold text-emerald-600">{available}</p>
            <p className="text-xs text-neutral-500 mt-0.5">Available</p>
          </div>
          <div className="rounded-xl bg-white border border-amber-200 px-md py-sm text-center">
            <p className="text-2xl font-bold text-amber-600">{onNotice}</p>
            <p className="text-xs text-neutral-500 mt-0.5">On notice</p>
          </div>
        </div>

        {/* ── Search ── */}
        <div className="relative mb-lg">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">🔍</span>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by room, tenant name or address…"
            className="w-full rounded-xl border border-neutral-300 bg-white pl-9 pr-md py-sm text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
          />
          {query && (
            <button onClick={() => setQuery('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 text-base leading-none">
              ✕
            </button>
          )}
        </div>

        {/* ── Search result count ── */}
        {isSearching && (
          <p className="mb-sm text-xs text-neutral-500 px-xs">
            {filteredRooms.length} result{filteredRooms.length !== 1 ? 's' : ''} for "{query}"
          </p>
        )}

        {/* ── Table ── */}
        {filteredProperties.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center">
            <p className="text-neutral-400 text-sm">{isSearching ? `No rooms matched "${query}"` : 'No properties yet'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-neutral-100 text-left">
                  <th className="px-md py-sm w-[120px] text-[10px] font-semibold uppercase tracking-widest text-neutral-400 hidden sm:table-cell">Code</th>
                  <th className="px-md py-sm text-[10px] font-semibold uppercase tracking-widest text-neutral-400">Room</th>
                  <th className="px-md py-sm text-[10px] font-semibold uppercase tracking-widest text-neutral-400 hidden sm:table-cell">Type</th>
                  <th className="px-md py-sm w-[110px] text-[10px] font-semibold uppercase tracking-widest text-neutral-400">Status</th>
                  <th className="px-md py-sm text-[10px] font-semibold uppercase tracking-widest text-neutral-400">Tenant</th>
                  <th className="px-md py-sm w-[40px]"></th>
                </tr>
              </thead>
              <tbody>
                {filteredProperties.map((property) => {
                  const isHmo = (property.property_type || 'hmo') === 'hmo'
                  const occupiedCount = property.rooms.filter(r => r.status === 'occupied' || r.status === 'on_notice').length
                  return (
                    <Fragment key={property.id}>
                      {/* Property header */}
                      <tr className="bg-neutral-900">
                        <td colSpan={6} className="px-md py-sm">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-sm">
                              {property.property_code && (
                                <span className="font-mono text-[10px] font-bold text-neutral-400 tracking-wider">{property.property_code}</span>
                              )}
                              <Link
                                href={`/admin/properties/${property.id}`}
                                onClick={e => e.stopPropagation()}
                                className="font-semibold text-white text-sm hover:text-blue-300 transition-colors"
                              >
                                {property.name || property.address}
                              </Link>
                              {property.name && property.address && property.name !== property.address && (
                                <span className="text-neutral-500 text-xs hidden sm:inline">{property.address}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-xs">
                              <span className="text-[10px] text-neutral-400">{occupiedCount}/{property.rooms.length}</span>
                              <span className="rounded-full bg-white/10 px-sm py-0.5 text-[10px] font-semibold text-white uppercase tracking-wide">
                                {(property.property_type || 'hmo').replace('_', ' ')}
                              </span>
                            </div>
                          </div>
                        </td>
                      </tr>

                      {isHmo && property.rooms.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-md py-sm pl-xl text-xs italic text-neutral-400 border-b border-neutral-100">
                            No rooms configured yet
                          </td>
                        </tr>
                      )}

                      {property.rooms.map((room, i) => (
                        <tr
                          key={room.id}
                          className={`cursor-pointer border-b border-neutral-100 last:border-0 hover:bg-blue-50 transition-colors ${
                            isSearching && i === 0 ? '' : ''
                          }`}
                          onClick={() => router.push(`/admin/properties/${property.id}?tab=units&room=${room.id}`)}
                        >
                          <td className="px-md py-sm pl-lg font-mono text-[11px] text-neutral-400 hidden sm:table-cell">
                            {room.unit_code || '—'}
                          </td>
                          <td className="px-md py-sm">
                            <span className="font-medium text-neutral-900">{room.name}</span>
                          </td>
                          <td className="px-md py-sm hidden sm:table-cell">
                            {roomTypeBadge(room.room_type)}
                          </td>
                          <td className="px-md py-sm">
                            {/* empty now but let agreed: say so, rather than "Occupied" */}
                            {!room.tenant_name && room.incoming
                              ? <span className="inline-flex items-center rounded-full px-sm py-0.5 text-[11px] font-semibold bg-amber-100 text-amber-900">Let agreed</span>
                              : <span className={`inline-flex items-center rounded-full px-sm py-0.5 text-[11px] font-semibold ${statusStyle(room.status)}`}>
                                  {statusLabel(room.status)}
                                </span>}
                          </td>
                          <td className="px-md py-sm">
                            {room.tenant_name
                              ? (
                                <div>
                                  {room.tenancy_id
                                    ? <Link href={`/admin/lettings/${room.tenancy_id}?from=/admin/active-rooms`} onClick={e => e.stopPropagation()} className="text-neutral-800 font-medium hover:text-blue-700 hover:underline">{room.tenant_name}</Link>
                                    : <span className="text-neutral-800 font-medium">{room.tenant_name}</span>}
                                  {room.move_out_date && (
                                    <p className="text-[11px] text-amber-600 font-medium mt-0.5">
                                      Moves out {new Date(room.move_out_date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                    </p>
                                  )}
                                </div>
                              )
                              : !room.incoming && <span className="text-neutral-400 italic text-xs">Vacant</span>
                            }
                            {room.incoming && (
                              <Link href={`/admin/lettings/${room.incoming.tenancy_id}?from=/admin/active-rooms`} onClick={e => e.stopPropagation()}
                                className="mt-0.5 inline-flex items-center rounded-full bg-amber-100 px-sm py-0.5 text-[11px] font-semibold text-amber-900 hover:bg-amber-200">
                                Let agreed · {room.incoming.name.split(' ')[0]} from {new Date(room.incoming.start_date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                              </Link>
                            )}
                          </td>
                          <td className="px-md py-sm text-center">
                            {room.tenant_id && (
                              room.has_push
                                ? <span title="Push on" className="opacity-70">🔔</span>
                                : <span title="No push" className="opacity-20">🔕</span>
                            )}
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

        {/* ── Footer link to full property list ── */}
        <div className="mt-lg text-center">
          <Link href="/admin/active-rooms" className="text-xs text-neutral-400 hover:text-neutral-600 underline underline-offset-2">
            View property cards →
          </Link>
        </div>
      </main>
    </div>
  )
}
