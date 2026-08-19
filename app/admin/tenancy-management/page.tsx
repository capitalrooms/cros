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
  person_id: string
  room_id: string
  property_id: string
  start_date: string
  end_date: string | null
  rent_amount: number
  status: 'active' | 'on_notice'
  person?: {
    id: string
    full_name: string
    email: string
    phone: string
  }
  room?: {
    id: string
    name: string
  }
  property?: {
    id: string
    name: string
    address: string
  }
}

interface Cleaner {
  id: string
  full_name: string
  email?: string
  phone?: string
}

export default function TenancyManagementPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [activeTenancies, setActiveTenancies] = useState<Tenancy[]>([])
  const [onNoticeTenancies, setOnNoticeTenancies] = useState<Tenancy[]>([])
  const [cleaners, setCleaners] = useState<Cleaner[]>([])
  const [selectedTenancy, setSelectedTenancy] = useState<Tenancy | null>(null)
  const [showNoticeModal, setShowNoticeModal] = useState(false)
  const [savingNotice, setSavingNotice] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

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
    // Fetch tenancies
    const { data: tenanciesData } = await supabase
      .from('tenancies')
      .select('*, people(id, full_name, email, phone), rooms(id, name), properties(id, name, address)')
      .order('start_date', { ascending: false })

    const active = (tenanciesData || []).filter((t: any) => t.status === 'active')
    const onNotice = (tenanciesData || []).filter((t: any) => t.status === 'on_notice')

    setActiveTenancies(active as any)
    setOnNoticeTenancies(onNotice as any)

    // Fetch cleaners
    const { data: cleanersData } = await supabase
      .from('people')
      .select('id, full_name, email, phone')
      .eq('role', 'cleaner')
      .order('full_name')

    setCleaners(cleanersData as any)
  }

  const handleSetOnNotice = async (tenancy: Tenancy) => {
    setSelectedTenancy(tenancy)
    setShowNoticeModal(true)
  }

  const handleConfirmOnNotice = async (noticeData: OnNoticeData) => {
    if (!selectedTenancy) return

    setSavingNotice(true)

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

      setMessage({
        type: 'success',
        text: `Tenancy marked as on notice. Emails sent: ${result.emailsSent.tenant ? 'Tenant ✓' : ''} ${result.emailsSent.cleaner ? 'Cleaner ✓' : ''}`.trim(),
      })

      await loadData()
      setShowNoticeModal(false)
      setSelectedTenancy(null)
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'An error occurred',
      })
    } finally {
      setSavingNotice(false)
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

  const daysUntilMoveOut = (endDate: string) => {
    const today = new Date()
    const moveOut = new Date(endDate)
    const days = Math.ceil((moveOut.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    return days
  }

  if (loading) return <GenericPageSkeleton />

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar right={<Link href="/admin" className="min-w-0 truncate font-semibold text-white hover:text-white/80">Dashboard</Link>} />

      <main className="mx-auto max-w-6xl px-lg py-2xl">
        <div className="mb-2xl">
          <h1 className="text-3xl font-bold text-neutral-900">👥 Tenancy Management</h1>
          <p className="mt-sm text-sm text-neutral-600 mb-lg">View active tenancies and mark move-outs</p>
        </div>

        {message && (
          <div
            className={`mb-lg p-md rounded-lg border ${
              message.type === 'success'
                ? 'bg-green-50 border-green-300 text-green-900'
                : 'bg-red-50 border-red-300 text-red-900'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Active Tenancies */}
        <div className="mb-3xl">
          <h2 className="text-xl font-bold text-neutral-900 mb-lg">
            🏠 Active Tenancies ({activeTenancies.length})
          </h2>

          {activeTenancies.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center">
              <p className="text-sm text-neutral-500">No active tenancies</p>
            </div>
          ) : (
            <div className="space-y-md">
              {activeTenancies.map((tenancy) => (
                <div key={tenancy.id} className="rounded-lg border border-neutral-200 bg-white p-md">
                  <div className="flex items-start justify-between gap-md">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-neutral-900">{tenancy.person?.full_name}</p>
                      <p className="text-sm text-neutral-600">
                        {tenancy.room?.name}, {tenancy.property?.name}
                      </p>
                      <p className="text-sm text-neutral-600">{tenancy.property?.address}</p>
                      <p className="text-xs text-neutral-500 mt-xs">
                        £{tenancy.rent_amount}/month • Since {formatDate(tenancy.start_date)}
                      </p>
                      {tenancy.person?.email && (
                        <p className="text-xs text-neutral-500">{tenancy.person.email}</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleSetOnNotice(tenancy)}
                      className="shrink-0 rounded-lg bg-blue-600 px-lg py-md text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      Set Notice
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* On Notice Tenancies */}
        <div>
          <h2 className="text-xl font-bold text-neutral-900 mb-lg">
            ⏰ On Notice ({onNoticeTenancies.length})
          </h2>

          {onNoticeTenancies.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center">
              <p className="text-sm text-neutral-500">No tenancies on notice</p>
            </div>
          ) : (
            <div className="space-y-md">
              {onNoticeTenancies.map((tenancy) => {
                const daysLeft = daysUntilMoveOut(tenancy.end_date!)
                const urgency = daysLeft <= 7 ? 'urgent' : daysLeft <= 14 ? 'soon' : 'normal'

                return (
                  <div
                    key={tenancy.id}
                    className={`rounded-lg border p-md ${
                      urgency === 'urgent'
                        ? 'border-red-300 bg-red-50'
                        : urgency === 'soon'
                          ? 'border-yellow-300 bg-yellow-50'
                          : 'border-neutral-200 bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-md">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-neutral-900">{tenancy.person?.full_name}</p>
                        <p className="text-sm text-neutral-600">
                          {tenancy.room?.name}, {tenancy.property?.name}
                        </p>
                        <p className="text-sm font-semibold text-orange-700 mt-xs">
                          Moving out: {formatDate(tenancy.end_date)} ({daysLeft} days)
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>

      {/* Set On Notice Modal */}
      {showNoticeModal && (
        <SetOnNoticeModal
          tenancy={selectedTenancy}
          cleaners={cleaners}
          onClose={() => {
            setShowNoticeModal(false)
            setSelectedTenancy(null)
          }}
          onConfirm={handleConfirmOnNotice}
        />
      )}
    </div>
  )
}
