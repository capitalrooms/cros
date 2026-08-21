'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import RoomCommunicationsModal from './RoomCommunicationsModal'

interface Notification {
  id: string
  title: string
  message: string
  notification_type: string
  recipient_type: string
  status: string
  created_at: string
  property_id: string
}

interface GroupedComms {
  compliance: Notification[]
  cleaning: Notification[]
  contractor: Notification[]
  lettings: Notification[]
  tenant: Notification[]
}

interface Room {
  id: string
  name: string
  bedrooms?: number
}

interface CommunicationsTabProps {
  propertyId: string
}

export default function CommunicationsTab({ propertyId }: CommunicationsTabProps) {
  const [grouped, setGrouped] = useState<GroupedComms>({
    compliance: [],
    cleaning: [],
    contractor: [],
    lettings: [],
    tenant: []
  })
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMessage, setSelectedMessage] = useState<Notification | null>(null)
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null)

  const supabase = createClient()

  useEffect(() => {
    loadAndGroupMessages()
  }, [propertyId])

  async function loadAndGroupMessages() {
    setLoading(true)

    // Load rooms
    const { data: roomData } = await supabase
      .from('rooms')
      .select('id, name')
      .eq('property_id', propertyId)
      .order('name')

    setRooms(roomData || [])

    // Load communications
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('property_id', propertyId)
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) {
      console.error(error)
      setLoading(false)
      return
    }

    // Group by notification type and get 5 most recent of each
    const typeGroups: GroupedComms = {
      compliance: [],
      cleaning: [],
      contractor: [],
      lettings: [],
      tenant: []
    }

    for (const notif of data || []) {
      const type = (notif.notification_type || 'tenant').toLowerCase()

      if (type.includes('compliance') || type.includes('safety') || type.includes('fire')) {
        if (typeGroups.compliance.length < 5) typeGroups.compliance.push(notif)
      } else if (type.includes('clean') || type.includes('cleaner')) {
        if (typeGroups.cleaning.length < 5) typeGroups.cleaning.push(notif)
      } else if (type.includes('contract') || type.includes('maintenance') || type.includes('repair')) {
        if (typeGroups.contractor.length < 5) typeGroups.contractor.push(notif)
      } else if (type.includes('letting') || type.includes('viewing') || type.includes('applicant')) {
        if (typeGroups.lettings.length < 5) typeGroups.lettings.push(notif)
      } else {
        if (typeGroups.tenant.length < 5) typeGroups.tenant.push(notif)
      }
    }

    setGrouped(typeGroups)
    setLoading(false)
  }

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'compliance': return '✅'
      case 'cleaning': return '🧹'
      case 'contractor': return '🔧'
      case 'lettings': return '🔑'
      case 'tenant': return '👥'
      default: return '📬'
    }
  }

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'compliance': return 'Compliance'
      case 'cleaning': return 'Cleaning'
      case 'contractor': return 'Contractor'
      case 'lettings': return 'Lettings'
      case 'tenant': return 'Tenant Communications'
      default: return 'Messages'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'sent': return 'bg-neutral-900 text-neutral-300'
      case 'delivered': return 'bg-green-900 text-green-300'
      case 'read': return 'bg-green-800 text-green-200'
      case 'failed': return 'bg-red-900 text-red-300'
      default: return 'bg-neutral-900 text-neutral-400'
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60))

    if (diffHours < 1) return 'Just now'
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffHours < 168) return `${Math.floor(diffHours / 24)}d ago`

    return date.toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const categories: Array<keyof GroupedComms> = ['compliance', 'cleaning', 'contractor', 'lettings', 'tenant']

  const MessageGroup = ({ category, messages }: { category: keyof GroupedComms; messages: Notification[] }) => {
    const isComplianceCategory = category === 'compliance'

    return (
      <div className="rounded-lg border border-neutral-700 bg-neutral-900 overflow-hidden">
        {/* Category Header */}
        <div className="bg-neutral-900 p-lg flex items-center justify-between">
          <div className="flex items-center gap-md">
            <span className="text-2xl">{getCategoryIcon(category)}</span>
            <div>
              <h3 className="font-semibold text-white">{getCategoryLabel(category)}</h3>
              <p className="text-xs text-neutral-400 mt-xs">{messages.length} message{messages.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          {isComplianceCategory && messages.length > 0 && (
            <Link
              href={`/admin/properties/${propertyId}?tab=compliance`}
              className="text-xs font-semibold text-blue-400 hover:text-blue-300 underline"
            >
              View Log →
            </Link>
          )}
        </div>

        {/* Messages */}
        {messages.length === 0 ? (
          <div className="p-lg text-center text-sm text-neutral-500">
            No {getCategoryLabel(category).toLowerCase()} yet
          </div>
        ) : (
          <div className="divide-y divide-neutral-800">
            {messages.map((msg) => (
              <button
                key={msg.id}
                onClick={() => setSelectedMessage(msg)}
                className="w-full text-left p-lg hover:bg-neutral-900 transition"
              >
                <div className="flex items-start justify-between gap-lg">
                  <div className="flex-1">
                    <p className="font-semibold text-white text-sm">{msg.title}</p>
                    <p className="text-xs text-neutral-400 mt-xs line-clamp-2">{msg.message}</p>
                  </div>
                  <span className={`text-xs font-semibold px-md py-sm rounded whitespace-nowrap ${getStatusColor(msg.status)}`}>
                    {msg.status}
                  </span>
                </div>
                <p className="text-xs text-neutral-500 mt-md">{formatDate(msg.created_at)}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-xl">
        <div className="text-sm text-neutral-400">Loading communications...</div>
      </div>
    )
  }

  return (
    <div className="space-y-xl">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-white">Communications</h2>
        <p className="text-sm text-neutral-400 mt-xs">5 most recent messages by type, plus room drill-down</p>
      </div>

      {/* Room Drill-Down Section */}
      {rooms.length > 0 && (
        <div className="rounded-lg border border-neutral-700 bg-neutral-900 overflow-hidden">
          <div className="bg-neutral-900 p-lg border-b border-neutral-700">
            <h3 className="font-semibold text-white">Room Communications</h3>
            <p className="text-xs text-neutral-400 mt-xs">Click a room to view tenant-level messages</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-md p-lg">
            {rooms.map((room) => (
              <button
                key={room.id}
                onClick={() => setSelectedRoom(room)}
                className="p-lg rounded-lg bg-neutral-900 border border-neutral-700 hover:border-blue-600 hover:bg-neutral-850 transition text-left"
              >
                <p className="font-semibold text-white text-sm">{room.name}</p>
                <p className="text-xs text-neutral-400 mt-xs">View communications</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Message Groups */}
      <div className="space-y-lg">
        {categories.map((category) => (
          <MessageGroup
            key={category}
            category={category}
            messages={grouped[category]}
          />
        ))}
      </div>

      {/* Message Detail Modal */}
      {selectedMessage && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-lg">
          <div className="bg-neutral-900 rounded-xl shadow-lg p-lg max-w-md w-full border border-neutral-700 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-lg mb-lg">
              <div>
                <h3 className="text-lg font-semibold text-white">{selectedMessage.title}</h3>
                <p className="text-xs text-neutral-400 mt-xs">{formatDate(selectedMessage.created_at)}</p>
              </div>
              <button
                onClick={() => setSelectedMessage(null)}
                className="text-2xl text-neutral-400 hover:text-white"
              >
                ×
              </button>
            </div>

            <div className="rounded-lg bg-neutral-900 p-lg mb-lg">
              <p className="text-sm text-white whitespace-pre-wrap">{selectedMessage.message}</p>
            </div>

            <div className="space-y-sm text-sm mb-lg">
              <div className="flex justify-between">
                <span className="text-neutral-400">Type:</span>
                <span className="font-semibold text-white">{selectedMessage.notification_type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Recipients:</span>
                <span className="font-semibold text-white">{selectedMessage.recipient_type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Status:</span>
                <span className={`font-semibold ${getStatusColor(selectedMessage.status)}`}>
                  {selectedMessage.status}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Sent:</span>
                <span className="font-semibold text-white">
                  {new Date(selectedMessage.created_at).toLocaleString('en-GB')}
                </span>
              </div>
            </div>

            <button
              onClick={() => setSelectedMessage(null)}
              className="w-full px-lg py-md bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 transition"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Room Communications Modal */}
      {selectedRoom && (
        <RoomCommunicationsModal
          roomId={selectedRoom.id}
          propertyId={propertyId}
          roomName={selectedRoom.name}
          onClose={() => setSelectedRoom(null)}
        />
      )}
    </div>
  )
}
