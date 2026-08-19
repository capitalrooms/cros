'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import AppBar from '@/components/AppBar'
import Link from 'next/link'
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading'
import SetOnNoticeModal, { OnNoticeData } from '@/app/components/SetOnNoticeModal'

interface Tenancy {
  id: string
  room_id: string
  person_id: string
  rent_amount: number
  start_date: string
  end_date?: string
  status: string
  room?: {
    id: string
    name: string
    property_id: string
    status: string
  }
  property?: {
    id: string
    name: string
    address: string
  }
  person?: {
    full_name: string
    email: string
    phone: string
  }
}

export default function AllUnitsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [allTenancies, setAllTenancies] = useState<Tenancy[]>([])
  const [selectedTenancy, setSelectedTenancy] = useState<Tenancy | null>(null)
  const [archivedTenancies, setArchivedTenancies] = useState<Tenancy[]>([])
  const [showMarkOnNoticeModal, setShowMarkOnNoticeModal] = useState(false)
  const [showConfirmOccupiedDialog, setShowConfirmOccupiedDialog] = useState(false)
  const [cleaners, setCleaners] = useState<any[]>([])

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
    // Fetch all tenancies with their related data
    const { data: tenanciesData, error: tenanciesError } = await supabase
      .from('tenancies')
      .select('*')
      .order('start_date', { ascending: false })

    if (tenanciesError) {
      console.error('Tenancies error:', tenanciesError)
      return
    }

    if (!tenanciesData || tenanciesData.length === 0) {
      setAllTenancies([])
      return
    }

    // Now fetch rooms and properties data
    const roomIds = [...new Set((tenanciesData as any).map((t: any) => t.room_id))]
    const personIds = [...new Set((tenanciesData as any).map((t: any) => t.person_id).filter((id: any) => id))]

    const [{ data: roomsData, error: roomsError }, { data: propertiesData }, { data: peopleData, error: peopleError }] = await Promise.all([
      supabase.from('rooms').select('*').in('id', roomIds),
      supabase.from('properties').select('*'),
      personIds.length > 0
        ? supabase.from('people').select('*').in('id', personIds)
        : Promise.resolve({ data: [], error: null }),
    ])

    if (roomsError) console.error('Rooms fetch error:', roomsError)
    if (peopleError) console.error('People fetch error:', peopleError)

    console.log('Tenancies loaded:', tenanciesData.length)
    console.log('People data:', peopleData?.length, 'Sample:', peopleData?.[0])
    console.log('Sample tenancy:', tenanciesData[0])
    console.log('PersonIds for lookup:', personIds)

    // Map the data together
    const currentTenancies = (tenanciesData as any).map((t: any) => {
      const room = roomsData?.find((r: any) => r.id === t.room_id)
      const property = propertiesData?.find((p: any) => p.id === room?.property_id)
      const person = peopleData?.find((p: any) => p.id === t.person_id)

      console.log(`Tenancy ${t.id}: Looking for person_id=${t.person_id}, found:`, person?.full_name || 'NOT FOUND')

      return {
        ...t,
        room,
        property,
        person,
        rent_amount: t.rent_monthly || 0,
        person_id: t.person_id,
      }
    })

    if (currentTenancies && currentTenancies.length > 0) {
      setAllTenancies(currentTenancies)
    }

    // Fetch cleaners for the modal
    const { data: cleanersData } = await supabase
      .from('people')
      .select('id, full_name, email, phone')
      .eq('role', 'cleaner')
      .order('full_name')

    setCleaners(cleanersData || [])
  }

  const handleMarkOnNotice = async (noticeData: OnNoticeData) => {
    if (!selectedTenancy) return

    try {
      const response = await fetch('/api/tenancies/set-on-notice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenancyId: selectedTenancy.id,
          roomId: selectedTenancy.room_id,
          moveOutDate: noticeData.moveOutDate,
          newAskingRent: noticeData.newAskingRent,
          emailTenant: noticeData.emailTenant,
          tenantEmail: selectedTenancy.person?.email,
          tenantName: selectedTenancy.person?.full_name,
          checkoutEmailHtml: noticeData.checkoutEmailHtml,
          emailCleaner: noticeData.emailCleaner,
          cleanerId: noticeData.cleanerId,
          cleanerEmail: cleaners.find((c) => c.id === noticeData.cleanerId)?.email,
          cleanerName: cleaners.find((c) => c.id === noticeData.cleanerId)?.full_name,
          notesForLettings: noticeData.notesForLettings,
          roomName: selectedTenancy.room?.name,
          propertyAddress: selectedTenancy.property?.address,
        }),
      })

      const result = await response.json()

      if (!response.ok) throw new Error(result.error || 'Failed to set on notice')

      // Reload data and close modals
      await loadData()
      setShowMarkOnNoticeModal(false)
      setSelectedTenancy(null)
    } catch (err) {
      console.error('Error marking on notice:', err)
    }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-'
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  const getStatusBadge = (status: string) => {
    if (status === 'on_notice') return '⏰ On Notice'
    return '✓ Active'
  }

  // Group tenancies by property for HMO hierarchy display
  const groupedByProperty = allTenancies.reduce((acc, tenancy) => {
    const propertyId = tenancy.property?.id || 'unknown'
    if (!acc[propertyId]) {
      acc[propertyId] = {
        property: tenancy.property,
        tenancies: []
      }
    }
    acc[propertyId].tenancies.push(tenancy)
    return acc
  }, {} as Record<string, { property?: any; tenancies: Tenancy[] }>)

  // Sort properties by name, and rooms within each property
  const sortedProperties = Object.values(groupedByProperty)
    .sort((a, b) => (a.property?.name || '').localeCompare(b.property?.name || ''))
    .map(group => ({
      ...group,
      tenancies: group.tenancies.sort((a, b) => {
        // Extract room numbers for proper numeric sorting
        const aNum = parseInt(a.room?.name?.match(/\d+/)?.[0] || '0')
        const bNum = parseInt(b.room?.name?.match(/\d+/)?.[0] || '0')
        return aNum - bNum
      })
    }))

  if (loading) return <GenericPageSkeleton />

  if (selectedTenancy) {
    return (
      <div className="min-h-screen bg-neutral-100 pb-3xl">
        <AppBar right={<Link href="/admin" className="min-w-0 truncate font-semibold text-white hover:text-white/80">Dashboard</Link>} />

        <main className="mx-auto max-w-4xl px-lg py-2xl">
          {/* Back Button + Status Action */}
          <div className="mb-2xl flex items-center justify-between">
            <button
              onClick={() => setSelectedTenancy(null)}
              className="text-sm font-semibold text-blue-600 hover:text-blue-700 hover:underline"
            >
              ← Back to all units
            </button>
            {selectedTenancy.status === 'on_notice' ? (
              <button
                onClick={() => setShowConfirmOccupiedDialog(true)}
                className="rounded-lg bg-green-600 px-lg py-md text-sm font-semibold text-white hover:bg-green-700 transition-colors"
              >
                Mark as Occupied
              </button>
            ) : (
              <button
                onClick={() => setShowMarkOnNoticeModal(true)}
                className="rounded-lg bg-amber-600 px-lg py-md text-sm font-semibold text-white hover:bg-amber-700 transition-colors"
              >
                Mark On Notice
              </button>
            )}
          </div>

          {/* Tenancy Summary */}
          <div className="rounded-lg border border-neutral-200 bg-white p-lg mb-2xl">
            <div className="grid grid-cols-2 gap-lg">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-600">Property</p>
                <p className="text-lg font-bold text-neutral-900 mt-xs">{selectedTenancy.property?.name}</p>
                <p className="text-sm text-neutral-600">{selectedTenancy.property?.address}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-600">Room</p>
                <p className="text-lg font-bold text-neutral-900 mt-xs">{selectedTenancy.room?.name}</p>
                <p className="text-sm text-neutral-600 mt-xs">
                  <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                    selectedTenancy.room?.status === 'on_notice'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-green-100 text-green-800'
                  }`}>
                    {getStatusBadge(selectedTenancy.room?.status || '')}
                  </span>
                </p>
              </div>
            </div>

            <div className="border-t border-neutral-200 mt-lg pt-lg grid grid-cols-3 gap-lg">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-600">Tenant</p>
                <p className="text-base font-bold text-neutral-900 mt-xs">{selectedTenancy.person?.full_name}</p>
                <p className="text-xs text-neutral-600">{selectedTenancy.person?.email}</p>
                <p className="text-xs text-neutral-600">{selectedTenancy.person?.phone}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-600">Rent</p>
                <p className="text-lg font-bold text-neutral-900 mt-xs">£{selectedTenancy.rent_amount?.toLocaleString()}/month</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-600">Dates</p>
                <p className="text-sm text-neutral-900 mt-xs">{formatDate(selectedTenancy.start_date)} to {formatDate(selectedTenancy.end_date)}</p>
              </div>
            </div>
          </div>

          {/* Closed/Expired Tenancies Grid */}
          <div>
            <h2 className="text-lg font-bold text-neutral-900 mb-lg">Previous Tenancies</h2>
            <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-lg text-center">
              <p className="text-sm text-neutral-600">No closed tenancies yet for this room</p>
            </div>
          </div>

          {/* Files Section */}
          <div className="mt-3xl">
            <h2 className="text-lg font-bold text-neutral-900 mb-lg">Files</h2>
            <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-lg text-center">
              <p className="text-sm text-neutral-600">No files uploaded for this tenancy</p>
            </div>
          </div>
        </main>

        {/* Mark On Notice Modal */}
        {showMarkOnNoticeModal && selectedTenancy && (
          <SetOnNoticeModal
            tenancy={{
              id: selectedTenancy.id,
              person: selectedTenancy.person as any,
              room: { name: selectedTenancy.room?.name || '' },
              property: selectedTenancy.property as any,
              rent_amount: selectedTenancy.rent_amount,
            }}
            cleaners={cleaners}
            onClose={() => setShowMarkOnNoticeModal(false)}
            onConfirm={handleMarkOnNotice}
          />
        )}

        {/* Confirm Mark as Occupied Dialog */}
        {showConfirmOccupiedDialog && selectedTenancy && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="rounded-2xl bg-white w-full max-w-md p-lg">
              <h2 className="text-2xl font-bold text-neutral-900 mb-md">Is this person now staying?</h2>
              <p className="text-sm text-neutral-600 mb-lg">
                You're about to mark <strong>{selectedTenancy.person?.full_name}</strong> in <strong>{selectedTenancy.room?.name}</strong> at <strong>{selectedTenancy.property?.name}</strong> as Occupied. Is this correct?
              </p>
              <div className="flex gap-md">
                <button
                  onClick={async () => {
                    try {
                      const response = await fetch('/api/tenancies/set-on-notice', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          tenancyId: selectedTenancy.id,
                          roomId: selectedTenancy.room_id,
                          markAsOccupied: true,
                        }),
                      })

                      const result = await response.json()
                      if (!response.ok) throw new Error(result.error || 'Failed to update')

                      await loadData()
                      setShowConfirmOccupiedDialog(false)
                      setSelectedTenancy(null)
                    } catch (err) {
                      console.error('Error updating tenancy:', err)
                      alert('Failed to update tenancy status')
                    }
                  }}
                  className="flex-1 rounded-lg bg-green-600 px-lg py-md text-sm font-bold text-white hover:bg-green-700"
                >
                  Yes, they're staying
                </button>
                <button
                  onClick={() => setShowConfirmOccupiedDialog(false)}
                  className="rounded-lg border border-neutral-300 px-lg py-md text-sm font-semibold hover:bg-neutral-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar right={<Link href="/admin" className="min-w-0 truncate font-semibold text-white hover:text-white/80">Dashboard</Link>} />

      <main className="mx-auto max-w-full px-lg py-2xl">
        <div className="mb-2xl">
          <h1 className="text-3xl font-bold text-neutral-900">🏢 All Units</h1>
          <p className="mt-sm text-sm text-neutral-600 mb-lg">All properties and units with current tenancies</p>
        </div>

        {allTenancies.length === 0 ? (
          <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-xl text-center">
            <p className="text-sm text-neutral-500">No units found</p>
          </div>
        ) : (
          <div className="rounded-lg border border-neutral-200 bg-white overflow-x-auto">
            {/* Spreadsheet-style grid header */}
            <div className="sticky top-0 grid grid-cols-[2fr_1.2fr_1.5fr_1fr_1.2fr_1fr] gap-0 bg-neutral-50 border-b border-neutral-200 text-xs font-semibold text-neutral-900 divide-x divide-neutral-200">
              <div className="px-md py-sm">Property / Room</div>
              <div className="px-md py-sm">Tenant</div>
              <div className="px-md py-sm">Rent</div>
              <div className="px-md py-sm">Start</div>
              <div className="px-md py-sm">End</div>
              <div className="px-md py-sm">Status</div>
            </div>

            {/* Property groups with HMO hierarchy */}
            <div className="divide-y divide-neutral-200">
              {sortedProperties.map((group) => (
                <div key={group.property?.id}>
                  {/* Property header row */}
                  <div className="grid grid-cols-[2fr_1.2fr_1.5fr_1fr_1.2fr_1fr] gap-0 bg-neutral-100 border-b border-neutral-200 divide-x divide-neutral-200">
                    <div className="px-md py-sm font-bold text-neutral-900 text-sm">
                      {group.property?.name || 'Unknown Property'}
                    </div>
                    <div className="px-md py-sm text-xs text-neutral-600 col-span-5">
                      {group.tenancies.length} {group.tenancies.length === 1 ? 'unit' : 'units'}
                    </div>
                  </div>

                  {/* Room rows under property */}
                  {group.tenancies.map((t) => (
                    <div
                      key={t.id}
                      className="grid grid-cols-[2fr_1.2fr_1.5fr_1fr_1.2fr_1fr] gap-0 border-b border-neutral-200 divide-x divide-neutral-200 hover:bg-blue-50 cursor-pointer transition-colors text-sm"
                      onClick={() => setSelectedTenancy(t)}
                    >
                      {/* Property / Room - indented room name */}
                      <div className="px-md py-sm text-neutral-900 flex items-center">
                        <span className="ml-lg font-medium">{t.room?.name || '-'}</span>
                      </div>

                      {/* Tenant name */}
                      <div className="px-md py-sm text-neutral-900">
                        {t.person?.full_name || '(No tenant)'}
                      </div>

                      {/* Rent */}
                      <div className="px-md py-sm text-neutral-900">
                        {t.rent_amount ? `£${t.rent_amount.toLocaleString()}` : '£-'}
                      </div>

                      {/* Start date */}
                      <div className="px-md py-sm text-neutral-600 text-xs">
                        {formatDate(t.start_date)}
                      </div>

                      {/* End date */}
                      <div className="px-md py-sm text-neutral-600 text-xs">
                        {formatDate(t.end_date)}
                      </div>

                      {/* Status badge */}
                      <div className="px-md py-sm flex items-center">
                        <span className={`inline-block px-2 py-1 rounded text-xs font-medium whitespace-nowrap ${
                          t.status === 'on_notice'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-green-100 text-green-800'
                        }`}>
                          {getStatusBadge(t.status)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
