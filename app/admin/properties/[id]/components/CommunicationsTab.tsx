'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

interface Message {
  id: string
  type: string
  recipient: string
  subject?: string
  preview?: string
  status: string
  sent_at: string
  created_at: string
}

interface CommunicationsTabProps {
  propertyId: string
}

export default function CommunicationsTab({ propertyId }: CommunicationsTabProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null)

  const supabase = createClient()

  useEffect(() => {
    loadMessages()
  }, [propertyId])

  async function loadMessages() {
    setLoading(true)
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('property_id', propertyId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error(error)
    } else {
      // Transform notification data to message format
      const msgs = (data || []).map(n => ({
        id: n.id,
        type: n.notification_type || 'push',
        recipient: n.recipient_type || 'tenant',
        subject: n.title,
        preview: n.message || n.body,
        status: n.status || 'sent',
        sent_at: n.created_at,
        created_at: n.created_at
      }))
      setMessages(msgs)
    }
    setLoading(false)
  }

  const filtered = messages.filter(msg => {
    const matchesType = typeFilter === 'all' || msg.type === typeFilter
    const matchesStatus = statusFilter === 'all' || msg.status === statusFilter
    const matchesSearch = searchQuery === '' ||
      msg.subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      msg.preview?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      msg.recipient.toLowerCase().includes(searchQuery.toLowerCase())

    return matchesType && matchesStatus && matchesSearch
  })

  const messageTypes = [
    { value: 'all', label: 'All Types' },
    { value: 'email', label: '📧 Email' },
    { value: 'sms', label: '📱 SMS' },
    { value: 'push', label: '🔔 Push Notification' },
    { value: 'in_app', label: '💬 In-App' },
  ]

  const statuses = [
    { value: 'all', label: 'All Statuses' },
    { value: 'sent', label: 'Sent' },
    { value: 'delivered', label: 'Delivered' },
    { value: 'read', label: 'Read' },
    { value: 'failed', label: 'Failed' },
  ]

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'email': return '📧'
      case 'sms': return '📱'
      case 'push': return '🔔'
      case 'in_app': return '💬'
      default: return '📬'
    }
  }

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'email': return 'Email'
      case 'sms': return 'SMS'
      case 'push': return 'Push'
      case 'in_app': return 'In-App'
      default: return type
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'sent': return 'bg-blue-100 text-blue-700'
      case 'delivered': return 'bg-green-100 text-green-700'
      case 'read': return 'bg-green-200 text-green-800'
      case 'failed': return 'bg-red-100 text-red-700'
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
        <p className="text-sm text-neutral-400 mt-xs">Messages sent to tenants, contractors, and landlords</p>
      </div>

      {/* Filters */}
      <div className="space-y-md">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">
            Search Communications
          </label>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by subject, content, or recipient..."
            className="w-full px-md py-sm border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-md">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">
              Type
            </label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full px-md py-sm border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {messageTypes.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-sm block">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-md py-sm border border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {statuses.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Messages Timeline */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-neutral-700 bg-neutral-900 p-xl text-center">
          <p className="text-sm text-neutral-400">No communications match your filters</p>
          {(searchQuery || typeFilter !== 'all' || statusFilter !== 'all') && (
            <button
              onClick={() => {
                setSearchQuery('')
                setTypeFilter('all')
                setStatusFilter('all')
              }}
              className="text-xs text-blue-400 hover:text-blue-300 underline mt-md"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-md">
          {filtered.map((message) => (
            <div
              key={message.id}
              onClick={() => setSelectedMessage(message)}
              className="rounded-lg border border-neutral-700 bg-neutral-950 p-lg hover:shadow-md transition cursor-pointer"
            >
              <div className="flex items-start justify-between gap-lg mb-md">
                <div className="flex items-start gap-md flex-1">
                  <span className="text-2xl">{getTypeIcon(message.type)}</span>
                  <div className="flex-1">
                    <p className="font-semibold text-white">{message.subject || 'Untitled'}</p>
                    <p className="text-xs text-neutral-400 mt-xs line-clamp-2">
                      {message.preview || 'No content'}
                    </p>
                  </div>
                </div>
                <span className={`text-xs font-semibold px-md py-sm rounded-full whitespace-nowrap ${getStatusColor(message.status)}`}>
                  {message.status}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs text-neutral-400">
                <div className="flex items-center gap-md">
                  <span className="font-semibold">{getTypeLabel(message.type)}</span>
                  <span>•</span>
                  <span>To: {message.recipient}</span>
                </div>
                <span>{formatDate(message.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Message Detail Modal */}
      {selectedMessage && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-lg">
          <div className="bg-neutral-950 rounded-xl shadow-lg p-lg max-w-md w-full">
            <div className="flex items-start justify-between gap-lg mb-lg">
              <div>
                <h3 className="text-lg font-semibold text-white">{selectedMessage.subject || 'Message'}</h3>
                <p className="text-xs text-neutral-400 mt-xs">
                  {getTypeLabel(selectedMessage.type)} • {formatDate(selectedMessage.created_at)}
                </p>
              </div>
              <button
                onClick={() => setSelectedMessage(null)}
                className="text-2xl text-neutral-400 hover:text-white"
              >
                ×
              </button>
            </div>

            <div className="rounded-lg bg-neutral-900 p-lg mb-lg">
              <p className="text-sm text-white whitespace-pre-wrap">{selectedMessage.preview}</p>
            </div>

            <div className="space-y-sm text-sm mb-lg">
              <div className="flex justify-between">
                <span className="text-neutral-400">Type:</span>
                <span className="font-semibold text-white">{getTypeLabel(selectedMessage.type)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Recipient:</span>
                <span className="font-semibold text-white">{selectedMessage.recipient}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Status:</span>
                <span className={`font-semibold ${getStatusColor(selectedMessage.status).split(' ')[1]}`}>
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
    </div>
  )
}
