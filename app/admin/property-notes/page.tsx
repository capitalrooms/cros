'use client'

import { useEffect, useState } from 'react'
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading'
import { useRouter } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'

interface Property {
  id: string
  name: string
  address: string
}

interface PropertyNote {
  id: string
  title: string
  content: string
  note_type: 'cleaner' | 'agent' | 'admin'
  created_at: string
  people?: { full_name: string }
}

export default function PropertyNotesPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [properties, setProperties] = useState<Property[]>([])
  const [selectedProperty, setSelectedProperty] = useState<string>('')
  const [notes, setNotes] = useState<PropertyNote[]>([])
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      if (!data || data.assignment?.role !== 'administrator') {
        router.push('/login')
        return
      }

      const supabase = createClient()
      const { data: props } = await supabase
        .from('properties')
        .select('id, name, address')
        .order('name')

      setProperties(props || [])
      if (props?.[0]) {
        setSelectedProperty(props[0].id)
        await loadNotes(props[0].id)
      }
      setLoading(false)
    }
    init()
  }, [router])

  async function loadNotes(propertyId: string) {
    try {
      const res = await fetch(`/api/property-notes?propertyId=${propertyId}`)
      if (res.ok) {
        const { notes: fetchedNotes } = await res.json()
        setNotes(fetchedNotes || [])
      }
    } catch (err) {
      console.error('Failed to load notes:', err)
    }
  }

  async function handlePostNote(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedProperty || !title || !content) {
      alert('Please fill in all fields')
      return
    }

    try {
      const res = await fetch('/api/property-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId: selectedProperty,
          title,
          content,
          noteType: 'admin',
        }),
      })

      if (!res.ok) throw new Error('Failed to post note')

      setTitle('')
      setContent('')
      await loadNotes(selectedProperty)
      alert('✅ Note posted')
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown error'))
    }
  }

  async function handleDeleteNote(noteId: string) {
    if (!confirm('Delete this note?')) return

    try {
      const res = await fetch('/api/property-notes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteId }),
      })

      if (!res.ok) throw new Error('Failed to delete note')

      await loadNotes(selectedProperty)
      alert('✅ Note deleted')
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown error'))
    }
  }

  if (loading) { return <GenericPageSkeleton /> }
  }

  const currentProperty = properties.find((p) => p.id === selectedProperty)

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar />

      <main className="mx-auto max-w-4xl px-lg py-lg">
        <div className="mb-3xl">
          <h1 className="text-3xl font-bold text-neutral-900">Property Notes</h1>
          <p className="mt-sm text-sm text-neutral-600">
            Post updates visible on tenant dashboards. Cleaners and agents can also post notes here.
          </p>
        </div>

        <div className="grid gap-lg md:grid-cols-3">
          {/* Left: Property selector + form */}
          <div className="md:col-span-2">
            <div className="rounded-2xl border-2 border-neutral-200 bg-white p-lg space-y-lg">
              {/* Property Selector */}
              <div>
                <label className="block text-sm font-bold text-neutral-900 mb-md">
                  Select Property
                </label>
                <select
                  value={selectedProperty}
                  onChange={(e) => {
                    setSelectedProperty(e.target.value)
                    loadNotes(e.target.value)
                  }}
                  className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
                >
                  {properties.map((prop) => (
                    <option key={prop.id} value={prop.id}>
                      {prop.name} — {prop.address}
                    </option>
                  ))}
                </select>
              </div>

              {/* Post Note Form */}
              <form onSubmit={handlePostNote} className="space-y-lg border-t border-neutral-200 pt-lg">
                <div>
                  <label className="block text-sm font-bold text-neutral-900 mb-md">Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., Recent cleaning, Agent visit, Upcoming maintenance"
                    className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-neutral-900 mb-md">Message</label>
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Share any updates, instructions, or information for tenants..."
                    rows={6}
                    className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full rounded-lg bg-neutral-900 py-sm font-bold text-white hover:bg-neutral-800 transition-colors"
                >
                  Post Update
                </button>
              </form>
            </div>
          </div>

          {/* Right: Recent Notes */}
          <div>
            <div className="rounded-2xl border-2 border-neutral-200 bg-white p-lg">
              <h3 className="font-bold text-neutral-900 mb-md">Recent Notes</h3>
              {notes.length === 0 ? (
                <p className="text-sm text-neutral-400">No notes yet for this property</p>
              ) : (
                <div className="space-y-sm max-h-[600px] overflow-y-auto">
                  {notes.map((note) => {
                    const createdDate = new Date(note.created_at).toLocaleDateString('en-GB', {
                      month: 'short',
                      day: 'numeric',
                    })
                    return (
                      <div
                        key={note.id}
                        className="rounded-lg bg-neutral-50 p-md text-xs border border-neutral-200"
                      >
                        <div className="flex items-start justify-between gap-sm mb-xs">
                          <div className="flex-1">
                            <p className="font-bold text-neutral-900 line-clamp-2">{note.title}</p>
                            <p className="text-neutral-500 text-xs mt-xs">
                              {note.people?.full_name} • {createdDate}
                            </p>
                          </div>
                        </div>
                        <p className="text-neutral-600 line-clamp-3 text-xs">{note.content}</p>
                        {note.note_type === 'admin' && (
                          <button
                            onClick={() => handleDeleteNote(note.id)}
                            className="mt-md text-red-600 text-xs font-semibold hover:text-red-700"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
