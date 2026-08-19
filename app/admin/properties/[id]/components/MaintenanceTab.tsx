'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

interface Ticket {
  id: string
  title: string
  description: string
  category: string
  priority: string
  status: string
  location: string | null
  booked_date: string | null
  booked_slot: string | null
  created_at: string
  contractor_id?: string
  rooms: { name: string } | null
}

interface MaintenanceTabProps {
  propertyId: string
  tickets: Ticket[]
}

export default function MaintenanceTab({ propertyId, tickets: initialTickets }: MaintenanceTabProps) {
  const [tickets, setTickets] = useState(initialTickets)
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [priorityFilter, setPriorityFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const supabase = createClient()

  const statuses = [
    { value: 'all', label: 'All Statuses', color: 'neutral' },
    { value: 'reported', label: 'Reported', color: 'blue' },
    { value: 'booked', label: 'Booked', color: 'amber' },
    { value: 'in_progress', label: 'In Progress', color: 'orange' },
    { value: 'completed', label: 'Completed', color: 'green' },
  ]

  const priorities = [
    { value: 'all', label: 'All Priorities' },
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
  ]

  const filtered = tickets.filter(ticket => {
    const matchesStatus = statusFilter === 'all' || ticket.status === statusFilter
    const matchesPriority = priorityFilter === 'all' || ticket.priority === priorityFilter
    const matchesSearch = searchQuery === '' ||
      ticket.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.description?.toLowerCase().includes(searchQuery.toLowerCase())

    return matchesStatus && matchesPriority && matchesSearch
  })

  const stats = {
    total: tickets.length,
    reported: tickets.filter(t => t.status === 'reported').length,
    booked: tickets.filter(t => t.status === 'booked').length,
    inProgress: tickets.filter(t => t.status === 'in_progress').length,
    completed: tickets.filter(t => t.status === 'completed').length,
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'reported': return 'bg-blue-100 text-blue-700'
      case 'booked': return 'bg-amber-100 text-amber-700'
      case 'in_progress': return 'bg-orange-100 text-orange-700'
      case 'completed': return 'bg-green-100 text-green-700'
      default: return 'bg-neutral-100 text-neutral-700'
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-700'
      case 'medium': return 'bg-amber-100 text-amber-700'
      case 'low': return 'bg-green-100 text-green-700'
      default: return 'bg-neutral-100 text-neutral-700'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'reported': return 'Reported'
      case 'booked': return 'Booked'
      case 'in_progress': return 'In Progress'
      case 'completed': return 'Completed'
      default: return status
    }
  }

  return (
    <div className="space-y-xl">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-neutral-900">Maintenance Jobs</h2>
        <p className="text-sm text-neutral-600 mt-xs">Track and manage all maintenance tickets for this property</p>
      </div>

      {/* Statistics Bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-md">
        <div className="rounded-lg border border-neutral-200 bg-white p-lg text-center">
          <p className="text-2xl font-bold text-neutral-900">{stats.total}</p>
          <p className="text-xs text-neutral-600 mt-sm uppercase tracking-wider font-semibold">Total</p>
        </div>
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-lg text-center">
          <p className="text-2xl font-bold text-blue-900">{stats.reported}</p>
          <p className="text-xs text-blue-700 mt-sm uppercase tracking-wider font-semibold">Reported</p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-lg text-center">
          <p className="text-2xl font-bold text-amber-900">{stats.booked}</p>
          <p className="text-xs text-amber-700 mt-sm uppercase tracking-wider font-semibold">Booked</p>
        </div>
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-lg text-center">
          <p className="text-2xl font-bold text-orange-900">{stats.inProgress}</p>
          <p className="text-xs text-orange-700 mt-sm uppercase tracking-wider font-semibold">In Progress</p>
        </div>
        <div className="rounded-lg border border-green-200 bg-green-50 p-lg text-center">
          <p className="text-2xl font-bold text-green-900">{stats.completed}</p>
          <p className="text-xs text-green-700 mt-sm uppercase tracking-wider font-semibold">Done</p>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-md">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-neutral-600 mb-sm block">
            Search Jobs
          </label>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title or description..."
            className="w-full px-md py-sm border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-md">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-neutral-600 mb-sm block">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-md py-sm border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {statuses.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-neutral-600 mb-sm block">
              Priority
            </label>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="w-full px-md py-sm border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {priorities.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Jobs List */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-xl text-center">
          <p className="text-sm text-neutral-600">No maintenance jobs match your filters</p>
          {(searchQuery || statusFilter !== 'all' || priorityFilter !== 'all') && (
            <button
              onClick={() => {
                setSearchQuery('')
                setStatusFilter('all')
                setPriorityFilter('all')
              }}
              className="text-xs text-blue-600 hover:text-blue-900 underline mt-md"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-md">
          {filtered.map((ticket) => (
            <div key={ticket.id} className="rounded-lg border border-neutral-200 bg-white p-lg hover:shadow-md transition">
              <div className="flex items-start justify-between gap-lg mb-md">
                <div className="flex-1">
                  <p className="font-semibold text-neutral-900">{ticket.title}</p>
                  {ticket.description && (
                    <p className="text-xs text-neutral-600 mt-xs line-clamp-2">{ticket.description}</p>
                  )}
                  <div className="flex items-center gap-sm mt-md">
                    <span className={`text-xs font-semibold px-md py-sm rounded-full ${getStatusColor(ticket.status)}`}>
                      {getStatusLabel(ticket.status)}
                    </span>
                    <span className={`text-xs font-semibold px-md py-sm rounded-full ${getPriorityColor(ticket.priority)}`}>
                      {ticket.priority}
                    </span>
                    {ticket.rooms && (
                      <span className="text-xs text-neutral-500 font-semibold">
                        📍 {ticket.rooms.name}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {ticket.booked_date && (
                <p className="text-xs text-neutral-600 mb-md">
                  📅 Booked for {new Date(ticket.booked_date).toLocaleDateString('en-GB')}
                  {ticket.booked_slot && ` at ${ticket.booked_slot}`}
                </p>
              )}

              <div className="flex gap-sm">
                <button className="text-xs font-semibold text-blue-600 hover:text-blue-900">
                  View Details
                </button>
                <button className="text-xs font-semibold text-blue-600 hover:text-blue-900">
                  Update Status
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
