'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

interface Tenancy {
  id: string
  person_id: string
  start_date: string
  end_date: string | null
  person?: {
    id: string
    name: string
    email: string
  }
}

interface Notification {
  id: string
  title: string
  message: string
  notification_type: string
  status: string
  created_at: string
  recipient_id: string
}

interface RoomCommunicationsModalProps {
  roomId: string
  propertyId: string
  roomName: string
  onClose: () => void
}

export default function RoomCommunicationsModal({
  roomId,
  propertyId,
  roomName,
  onClose
}: RoomCommunicationsModalProps) {
  const router = useRouter()
  const [tenancies, setTenancies] = useState<Tenancy[]>([])
  const [communications, setCommunications] = useState<Notification[]>([])
  const [selectedTenant, setSelectedTenant] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedArchive, setExpandedArchive] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    loadRoomData()
  }, [roomId])

  async function loadRoomData() {
    setLoading(true)

    // Get all tenancies for this room
    const { data: tenancyData } = await supabase
      .from('tenancies')
      .select('*, person:people(id, name, email)')
      .eq('room_id', roomId)
      .order('start_date', { ascending: false })

    setTenancies(tenancyData || [])

    // Get all communications for this property related to this room
    const { data: commData } = await supabase
      .from('notifications')
      .select('*')
      .eq('property_id', propertyId)
      .order('created_at', { ascending: false })
      .limit(100)

    setCommunications(commData || [])
    setLoading(false)

    // Select first (current) tenant by default
    if (tenancyData && tenancyData.length > 0) {
      setSelectedTenant(tenancyData[0].person_id)
    }
  }

  const currentTenancy = tenancies.find(t => !t.end_date)
  const previousTenancies = tenancies.filter(t => t.end_date)

  const getTenantName = (personId: string) => {
    const tenancy = tenancies.find(t => t.person_id === personId)
    return tenancy?.person?.name || 'Unknown'
  }

  const getTenantCommunications = (personId: string) => {
    return communications.filter(c => c.recipient_id === personId)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const calculateTenancy = (tenancy: Tenancy) => {
    const start = new Date(tenancy.start_date)
    const end = tenancy.end_date ? new Date(tenancy.end_date) : null

    if (end) {
      const daysAgo = Math.floor((new Date().getTime() - end.getTime()) / (1000 * 60 * 60 * 24))
      if (daysAgo < 365) {
        return `Moved out ${daysAgo}d ago`
      } else {
        return `Moved out ${Math.floor(daysAgo / 365)}y ago`
      }
    }

    return `Since ${formatDate(tenancy.start_date)}`
  }

  const handleTenantClick = (tenantId: string) => {
    router.push(`/admin/tenant/${tenantId}`)
    onClose()
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-lg">
        <div className="bg-neutral-950 rounded-xl shadow-lg p-lg max-w-2xl w-full border border-neutral-700">
          <div className="text-center text-sm text-neutral-400">Loading room details...</div>
        </div>
      </div>
    )
  }

  const filteredComms = selectedTenant ? getTenantCommunications(selectedTenant) : []

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] p-lg">
      <div className="bg-neutral-950 rounded-xl shadow-lg max-w-2xl w-full border border-neutral-700 max-h-[90vh] overflow-y-auto z-[1001]">
        {/* Header */}
        <div className="bg-neutral-900 p-lg flex items-start justify-between sticky top-0 border-b border-neutral-700">
          <div>
            <h2 className="text-xl font-semibold text-white">🏠 {roomName}</h2>
            <p className="text-sm text-neutral-400 mt-xs">Communications by tenant</p>
          </div>
          <button
            onClick={onClose}
            className="text-2xl text-neutral-400 hover:text-white"
          >
            ×
          </button>
        </div>

        <div className="p-lg space-y-lg">
          {/* Current Tenant */}
          {currentTenancy && (
            <div className="rounded-lg border border-neutral-700 bg-neutral-900 overflow-hidden">
              <div className="p-lg bg-green-950 border-b border-neutral-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-md">
                    <span className="bg-green-600 text-white text-xs font-semibold px-md py-sm rounded">
                      [CURRENT]
                    </span>
                    <div>
                      <button
                        onClick={() => handleTenantClick(currentTenancy.person_id)}
                        className="font-semibold text-white hover:text-blue-400 underline text-left"
                      >
                        {currentTenancy.person?.name || 'Unknown'}
                      </button>
                      <p className="text-xs text-neutral-400">
                        {formatDate(currentTenancy.start_date)} - Present
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedTenant(currentTenancy.person_id)}
                    className={`px-lg py-md rounded-lg text-sm font-semibold transition ${
                      selectedTenant === currentTenancy.person_id
                        ? 'bg-green-600 text-white'
                        : 'border border-neutral-700 text-neutral-300 hover:text-white'
                    }`}
                  >
                    {getTenantCommunications(currentTenancy.person_id).length} messages
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Previous Tenants */}
          {previousTenancies.length > 0 && (
            <div className="rounded-lg border border-neutral-700 bg-neutral-900 overflow-hidden">
              <button
                onClick={() => setExpandedArchive(!expandedArchive)}
                className="w-full p-lg bg-neutral-800 border-b border-neutral-700 hover:bg-neutral-700 transition text-left flex items-center justify-between"
              >
                <div className="flex items-center gap-md">
                  <span>{expandedArchive ? '▼' : '▶'}</span>
                  <p className="font-semibold text-white text-sm">
                    Previous Residents ({previousTenancies.length})
                  </p>
                </div>
              </button>

              {expandedArchive && (
                <div className="divide-y divide-neutral-800">
                  {previousTenancies.map((tenancy) => (
                    <button
                      key={tenancy.id}
                      onClick={() => setSelectedTenant(tenancy.person_id)}
                      className={`w-full p-lg hover:bg-neutral-850 transition text-left ${
                        selectedTenant === tenancy.person_id ? 'bg-neutral-850' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-md mb-xs">
                            <span className="bg-neutral-700 text-neutral-300 text-xs font-semibold px-md py-sm rounded">
                              [PREVIOUS]
                            </span>
                            <button
                              onClick={() => handleTenantClick(tenancy.person_id)}
                              className="font-semibold text-white hover:text-blue-400 underline text-left"
                            >
                              {tenancy.person?.name || 'Unknown'}
                            </button>
                          </div>
                          <p className="text-xs text-neutral-400">
                            {formatDate(tenancy.start_date)} - {formatDate(tenancy.end_date!)}
                            {' '}({calculateTenancy(tenancy)})
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-neutral-400">
                          {getTenantCommunications(tenancy.person_id).length}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Communications for Selected Tenant */}
          {selectedTenant && (
            <div className="rounded-lg border border-neutral-700 bg-neutral-900 overflow-hidden">
              <div className="p-lg bg-neutral-800 border-b border-neutral-700">
                <h3 className="font-semibold text-white text-sm">
                  Messages to {getTenantName(selectedTenant)}
                </h3>
              </div>

              {filteredComms.length === 0 ? (
                <div className="p-lg text-center text-sm text-neutral-500">
                  No communications for this tenant
                </div>
              ) : (
                <div className="divide-y divide-neutral-800 max-h-[300px] overflow-y-auto">
                  {filteredComms.map((comm) => (
                    <div key={comm.id} className="p-lg hover:bg-neutral-850 transition">
                      <p className="font-semibold text-white text-sm">{comm.title}</p>
                      <p className="text-xs text-neutral-400 mt-xs line-clamp-2">{comm.message}</p>
                      <div className="flex items-center justify-between mt-md">
                        <span className="text-xs text-neutral-500">{comm.notification_type}</span>
                        <span className="text-xs px-md py-sm rounded bg-neutral-800 text-neutral-300">
                          {comm.status}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-600 mt-md">
                        {new Date(comm.created_at).toLocaleString('en-GB')}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Close Button */}
          <button
            onClick={onClose}
            className="w-full px-lg py-md bg-neutral-800 text-white rounded-lg font-semibold text-sm hover:bg-neutral-700 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
