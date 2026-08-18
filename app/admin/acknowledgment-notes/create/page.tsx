'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import Link from 'next/link'

export default function CreateAcknowledgmentNotePage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [properties, setProperties] = useState<any[]>([])
  const [rooms, setRooms] = useState<any[]>([])
  const [selectedProperty, setSelectedProperty] = useState('')
  const [selectedRoom, setSelectedRoom] = useState('')
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    internalNote: '',
    photoRequired: false,
  })
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      if (!data || !['administrator', 'landlord', 'admin'].includes(data.assignment?.role)) {
        router.push('/login')
        return
      }
      // Store the people row (not the auth user): created_by has an FK to
      // people(id), and people.id is NOT the same as the auth user id.
      setUser(data.assignment)

      const supabase = createClient()

      // Fetch properties
      const { data: propsData } = await supabase.from('properties').select('id, name').order('name')
      setProperties(propsData || [])

      setLoading(false)
    }
    init()
  }, [router])

  // Fetch rooms when property changes
  useEffect(() => {
    async function fetchRooms() {
      if (!selectedProperty) {
        setRooms([])
        return
      }

      const supabase = createClient()
      const { data } = await supabase
        .from('rooms')
        .select('id, name')
        .eq('property_id', selectedProperty)
        .order('name')

      setRooms(data || [])
      setSelectedRoom('')
    }

    fetchRooms()
  }, [selectedProperty])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!selectedProperty || !selectedRoom || !formData.title || !formData.content) {
      alert('Please fill in all required fields')
      return
    }

    setSubmitting(true)

    try {
      const supabase = createClient()

      const { error } = await supabase.from('tenant_acknowledgment_notes').insert({
        property_id: selectedProperty,
        room_id: selectedRoom,
        title: formData.title,
        content: formData.content,
        created_by: user.id,
        photo_required: formData.photoRequired,
        internal_note: formData.internalNote || null,
        status: 'active',
      })

      if (error) throw error

      alert('✅ Acknowledgment note created successfully!')
      router.push('/admin/acknowledgment-notes')
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="flex items-center justify-center min-h-screen">Loading...</div>

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar
        right={<Link href="/admin/acknowledgment-notes" className="text-sm font-bold text-white">← Back</Link>}
      />

      <main className="mx-auto max-w-2xl px-lg py-2xl">
        <h1 className="text-3xl font-bold text-neutral-900 mb-lg">📝 Create Acknowledgment Note</h1>

        <form onSubmit={handleSubmit} className="space-y-md">
          {/* Property Selection */}
          <div>
            <label className="block text-sm font-semibold text-neutral-900 mb-sm">
              Property *
            </label>
            <select
              value={selectedProperty}
              onChange={(e) => setSelectedProperty(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm"
              required
            >
              <option value="">Select a property...</option>
              {properties.map((prop) => (
                <option key={prop.id} value={prop.id}>
                  {prop.name}
                </option>
              ))}
            </select>
          </div>

          {/* Room Selection */}
          <div>
            <label className="block text-sm font-semibold text-neutral-900 mb-sm">
              Room *
            </label>
            <select
              value={selectedRoom}
              onChange={(e) => setSelectedRoom(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm"
              required
              disabled={!selectedProperty}
            >
              <option value="">Select a room...</option>
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </select>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-semibold text-neutral-900 mb-sm">
              Title *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm"
              placeholder="e.g., Door Lock Inspection"
              required
            />
          </div>

          {/* Content */}
          <div>
            <label className="block text-sm font-semibold text-neutral-900 mb-sm">
              Content *
            </label>
            <textarea
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm"
              rows={6}
              placeholder="Write the note that tenants will see..."
              required
            />
            <p className="text-xs text-neutral-500 mt-xs">
              This text will be shown to the tenant and they must acknowledge it.
            </p>
          </div>

          {/* Photo Required */}
          <div className="flex items-center gap-sm">
            <input
              type="checkbox"
              id="photoRequired"
              checked={formData.photoRequired}
              onChange={(e) => setFormData({ ...formData, photoRequired: e.target.checked })}
              className="h-4 w-4 cursor-pointer"
            />
            <label htmlFor="photoRequired" className="text-sm font-medium text-neutral-900 cursor-pointer">
              Require photo evidence from tenant
            </label>
          </div>

          {/* Internal Note */}
          <div>
            <label className="block text-sm font-semibold text-neutral-900 mb-sm">
              Internal Note (Admin Only)
            </label>
            <textarea
              value={formData.internalNote}
              onChange={(e) => setFormData({ ...formData, internalNote: e.target.value })}
              className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm"
              rows={3}
              placeholder="Notes for admin tracking only - never shown to tenant..."
            />
            <p className="text-xs text-neutral-500 mt-xs">
              This is private and will never be shown to the tenant.
            </p>
          </div>

          {/* Submit Buttons */}
          <div className="flex gap-md pt-lg">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-lg bg-blue-600 px-md py-sm text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'Creating...' : '✓ Create Note'}
            </button>
            <button
              type="button"
              onClick={() => router.push('/admin/acknowledgment-notes')}
              className="flex-1 rounded-lg border border-neutral-300 px-md py-sm text-sm font-semibold hover:bg-neutral-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}
