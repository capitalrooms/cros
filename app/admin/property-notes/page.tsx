'use client'

import { useEffect, useState } from 'react'
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading'
import { useRouter } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import Link from 'next/link'

interface Property {
  id: string
  name: string
  address: string
}

interface Room {
  id: string
  name: string
  property_id: string
}

interface PropertyNote {
  id: string
  title: string
  content: string
  note_type: 'cleaner' | 'agent' | 'admin'
  room_id: string | null
  created_at: string
  people?: { full_name: string }
}

export default function PropertyNotesPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [me, setMe] = useState<any>(null)
  const [properties, setProperties] = useState<Property[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [selectedProperty, setSelectedProperty] = useState<string>('')
  const [notes, setNotes] = useState<PropertyNote[]>([])
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [audience, setAudience] = useState<'tenants' | 'cleaner' | 'internal'>('tenants')
  const [roomId, setRoomId] = useState<string>('') // '' = whole house
  const [posting, setPosting] = useState(false)
  const [taskTemplates, setTaskTemplates] = useState<any[]>([])
  const [selectedTasks, setSelectedTasks] = useState<string[]>([])
  const [cleaningRoom, setCleaningRoom] = useState('')
  const [cleaningType, setCleaningType] = useState('')

  const cleaningTypes = [
    { value: 'deep_clean', label: '🧹 Deep Clean - Full property' },
    { value: 'spot_clean', label: '⚡ Spot Clean - Quick tidy' },
    { value: 'deep_kitchen', label: '🍽️ Kitchen Focus - Deep clean' },
    { value: 'deep_bathroom', label: '🚿 Bathroom Focus - Deep clean' },
    { value: 'deep_bedrooms', label: '🛏️ Bedrooms Focus - Deep clean' },
    { value: 'post_viewing', label: '👁️ Post-Viewing Clean - Between showings' },
    { value: 'move_out', label: '📦 Move-Out Clean - Full deep' },
    { value: 'post_maintenance', label: '🔧 Post-Maintenance - Dust & clean' },
  ]

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      if (!data || data.assignment?.role !== 'administrator' && data.assignment?.role !== 'admin') {
        router.push('/login')
        return
      }
      setMe(data.assignment)

      const supabase = createClient()
      const { data: props } = await supabase
        .from('properties')
        .select('id, name, address')
        .order('name')
      const { data: rms } = await supabase
        .from('rooms')
        .select('id, name, property_id')
        .order('name')
      const { data: tasks } = await supabase
        .from('cleaner_task_templates')
        .select('*')
        .eq('is_active', true)
        .order('sort_order')

      setProperties(props || [])
      setRooms(rms || [])
      setTaskTemplates(tasks || [])
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

  const propertyRooms = rooms.filter((r) => r.property_id === selectedProperty)

  async function handlePostNote(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedProperty) {
      alert('Please select a property')
      return
    }

    // For cleaner notes: require either task selection OR title+content
    if (audience === 'cleaner' && selectedTasks.length === 0 && (!title || !content)) {
      alert('Please either select tasks OR provide custom title and message')
      return
    }

    // For other audiences: require title+content
    if (audience !== 'cleaner' && (!title || !content)) {
      alert('Please fill in a title and message')
      return
    }
    setPosting(true)
    try {
      const supabase = createClient()

      if (audience === 'cleaner') {
        // Generate note from selected tasks, cleaning type, and custom content
        let noteTitle = cleaningType
          ? cleaningTypes.find(t => t.value === cleaningType)?.label || 'Cleaning needed'
          : title || 'Cleaning task'

        let noteContent = ''

        // Add room info if specified
        if (cleaningRoom) {
          const roomName = propertyRooms.find(r => r.id === cleaningRoom)?.name || 'Room'
          noteContent += `📍 Location: ${roomName}\n\n`
        }

        // Add cleaning type context
        if (cleaningType && !title) {
          const typeLabel = cleaningTypes.find(t => t.value === cleaningType)?.label || ''
          noteContent += `Type: ${typeLabel}\n\n`
        }

        // Add custom content if provided
        if (content) {
          noteContent += content
        }

        if (selectedTasks.length > 0 && !content) {
          // Generate note from selected tasks
          const taskNames = taskTemplates
            .filter(t => selectedTasks.includes(t.task_key))
            .map(t => `• ${t.display_name}`)
            .join('\n')
          if (noteContent) noteContent += '\n\n'
          noteContent += `Tasks to complete:\n\n${taskNames}`
        }

        // Attach the note to the property's NEXT upcoming clean so it greets the
        // cleaner when she opens that visit (cleans.admin_note).
        // If no clean is scheduled, save to pending_cleaner_notes for auto-attach later.
        const today = new Date().toISOString().split('T')[0]
        const { data: nextClean } = await supabase
          .from('cleans')
          .select('id, clean_date')
          .eq('property_id', selectedProperty)
          .neq('status', 'completed')
          .gte('clean_date', today)
          .order('clean_date', { ascending: true })
          .limit(1)
          .maybeSingle()

        if (nextClean) {
          // There's an upcoming clean — attach directly to it
          const { error } = await supabase
            .from('cleans')
            .update({ admin_note: `${noteTitle}\n\n${noteContent}` })
            .eq('id', nextClean.id)
          if (error) throw error
          setTitle('')
          setContent('')
          setSelectedTasks([])
          setCleaningRoom('')
          setCleaningType('')
          alert(
            `✅ Tasks added to the cleaner's next visit (${new Date(
              nextClean.clean_date
            ).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })})`
          )
          setPosting(false)
          return
        }

        // Save as property-level cleaning note (not tied to specific clean)
        // This way notes follow the cleaner's actual next visit, even if cleans are rescheduled
        const { error } = await supabase
          .from('property_cleaning_notes')
          .insert({
            property_id: selectedProperty,
            room_id: cleaningRoom || null,
            cleaning_type: cleaningType || null,
            note_title: noteTitle,
            note_content: noteContent,
            created_by: me?.id,
          })
        if (error) throw error
        setTitle('')
        setContent('')
        setSelectedTasks([])
        setCleaningRoom('')
        setCleaningType('')
        alert(
          '✅ Cleaning note saved. It will appear on the cleaner\'s next visit to this property.'
        )
        setPosting(false)
        return
      }

      // Tenants' notice board OR internal admin notes
      const { error } = await supabase.from('property_notes').insert({
        property_id: selectedProperty,
        room_id: roomId || null,
        created_by: me?.id,
        title,
        content,
        note_type: 'admin',
        is_internal: audience === 'internal',
      })
      if (error) throw error

      setTitle('')
      setContent('')
      await loadNotes(selectedProperty)
      alert(
        audience === 'internal'
          ? '✅ Internal note saved (only visible to admin)'
          : '✅ Note posted'
      )
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setPosting(false)
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
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown error'))
    }
  }

  if (loading) return <GenericPageSkeleton />

  const roomName = (id: string | null) =>
    id ? rooms.find((r) => r.id === id)?.name || 'Room' : 'Whole house'

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar right={<BackButton href="/admin" />} />

      <main className="mx-auto max-w-4xl px-lg py-lg">
        <div className="mb-3xl">
          <h1 className="text-3xl font-bold text-neutral-900">Property Notes</h1>
          <p className="mt-sm text-sm text-neutral-600">
            Post updates to tenants, leave notes for the cleaner, or save internal admin observations.
          </p>
        </div>

        <div className="grid gap-lg md:grid-cols-3">
          {/* Left: form */}
          <div className="md:col-span-2">
            <div className="rounded-2xl border-2 border-neutral-200 bg-white p-lg space-y-lg">
              <div>
                <label className="block text-sm font-bold text-neutral-900 mb-md">Property</label>
                <select
                  value={selectedProperty}
                  onChange={(e) => {
                    setSelectedProperty(e.target.value)
                    setRoomId('')
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

              <form onSubmit={handlePostNote} className="space-y-lg border-t border-neutral-200 pt-lg">
                {/* Audience */}
                <div>
                  <label className="block text-sm font-bold text-neutral-900 mb-md">Who is this for?</label>
                  <div className="grid grid-cols-3 gap-sm">
                    <button
                      type="button"
                      onClick={() => setAudience('tenants')}
                      className={`rounded-lg border px-md py-sm text-sm font-semibold ${
                        audience === 'tenants'
                          ? 'border-neutral-900 bg-neutral-900 text-white'
                          : 'border-neutral-300 text-neutral-700'
                      }`}
                    >
                      Tenants&apos; notice board
                    </button>
                    <button
                      type="button"
                      onClick={() => setAudience('cleaner')}
                      className={`rounded-lg border px-md py-sm text-sm font-semibold ${
                        audience === 'cleaner'
                          ? 'border-neutral-900 bg-neutral-900 text-white'
                          : 'border-neutral-300 text-neutral-700'
                      }`}
                    >
                      Cleaner&apos;s next visit
                    </button>
                    <button
                      type="button"
                      onClick={() => setAudience('internal')}
                      className={`rounded-lg border px-md py-sm text-sm font-semibold ${
                        audience === 'internal'
                          ? 'border-neutral-900 bg-neutral-900 text-white'
                          : 'border-neutral-300 text-neutral-700'
                      }`}
                    >
                      Internal admin notes 🔒
                    </button>
                  </div>
                </div>

                {/* Room (tenants & internal only) */}
                {(audience === 'tenants' || audience === 'internal') && propertyRooms.length > 0 && (
                  <div>
                    <label className="block text-sm font-bold text-neutral-900 mb-md">
                      {audience === 'internal' ? 'Applies to' : 'Show to'}
                    </label>
                    <select
                      value={roomId}
                      onChange={(e) => setRoomId(e.target.value)}
                      className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
                    >
                      <option value="">Whole house {audience === 'internal' ? '(internal only)' : '(all tenants)'}</option>
                      {propertyRooms.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} only
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Room selector (cleaner only) */}
                {audience === 'cleaner' && propertyRooms.length > 0 && (
                  <div>
                    <label className="block text-sm font-bold text-neutral-900 mb-md">Which area needs attention?</label>
                    <select
                      value={cleaningRoom}
                      onChange={(e) => setCleaningRoom(e.target.value)}
                      className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
                    >
                      <option value="">Whole house</option>
                      {propertyRooms.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Cleaning type selector (cleaner only) */}
                {audience === 'cleaner' && (
                  <div>
                    <label className="block text-sm font-bold text-neutral-900 mb-md">Type of cleaning needed</label>
                    <select
                      value={cleaningType}
                      onChange={(e) => setCleaningType(e.target.value)}
                      className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
                    >
                      <option value="">Select a cleaning type...</option>
                      {cleaningTypes.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Task picker (cleaner only) */}
                {audience === 'cleaner' && taskTemplates.length > 0 && (
                  <div>
                    <label className="block text-sm font-bold text-neutral-900 mb-md">Tasks to assign</label>
                    <div className="space-y-sm rounded-lg border border-neutral-200 bg-neutral-50 p-md">
                      {taskTemplates.map((task) => (
                        <div key={task.id} className="flex items-start gap-md">
                          <input
                            type="checkbox"
                            id={task.id}
                            checked={selectedTasks.includes(task.task_key)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedTasks([...selectedTasks, task.task_key])
                              } else {
                                setSelectedTasks(selectedTasks.filter(t => t !== task.task_key))
                              }
                            }}
                            className="mt-xs h-4 w-4 rounded border-neutral-300"
                          />
                          <label htmlFor={task.id} className="flex-1 cursor-pointer">
                            <p className="text-sm font-semibold text-neutral-900">{task.display_name}</p>
                            {task.description && (
                              <p className="text-xs text-neutral-600 mt-xs">{task.description}</p>
                            )}
                          </label>
                        </div>
                      ))}
                    </div>
                    {selectedTasks.length > 0 && (
                      <p className="text-xs text-neutral-500 mt-md">
                        📋 {selectedTasks.length} task{selectedTasks.length !== 1 ? 's' : ''} selected
                      </p>
                    )}
                  </div>
                )}

                {/* Title & Message (only show if not using task picker) */}
                {!(audience === 'cleaner' && selectedTasks.length > 0) && (
                  <>
                    <div>
                      <label className="block text-sm font-bold text-neutral-900 mb-md">
                        {audience === 'cleaner' ? 'Custom message (optional)' : 'Title'}
                      </label>
                      <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder={audience === 'cleaner' ? 'e.g., This is urgent' : 'e.g., Boiler service Tuesday'}
                        className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-neutral-900 mb-md">
                        {audience === 'cleaner' ? 'Additional notes (optional)' : 'Message'}
                      </label>
                      <textarea
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder={
                          audience === 'cleaner'
                            ? 'Any extra instructions beyond the tasks...'
                            : audience === 'internal'
                            ? 'Internal observations, coordination notes, issues to track (never shown to tenants or cleaners)...'
                            : 'Share any updates, instructions, or information...'
                        }
                        rows={audience === 'cleaner' ? 3 : 6}
                        className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
                      />
                    </div>
                  </>
                )}

                <button
                  type="submit"
                  disabled={posting}
                  className="w-full rounded-lg bg-neutral-900 py-sm font-bold text-white hover:bg-neutral-800 transition-colors disabled:opacity-50"
                >
                  {posting ? 'Saving…' : audience === 'cleaner' ? 'Add to next clean' : audience === 'internal' ? 'Save internal note' : 'Post update'}
                </button>
              </form>
            </div>
          </div>

          {/* Right: history */}
          <div>
            <div className="rounded-2xl border-2 border-neutral-200 bg-white p-lg">
              <h3 className="font-bold text-neutral-900 mb-md">Tenant notice history</h3>
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
                        <div className="mb-xs flex items-center gap-xs">
                          <span className="rounded-full bg-neutral-200 px-sm py-[2px] text-[10px] font-bold text-neutral-700">
                            {roomName(note.room_id)}
                          </span>
                        </div>
                        <p className="font-bold text-neutral-900 line-clamp-2">{note.title}</p>
                        <p className="text-neutral-500 text-xs mt-xs">
                          {note.people?.full_name ? `${note.people.full_name} • ` : ''}
                          {createdDate}
                        </p>
                        <p className="text-neutral-600 line-clamp-3 text-xs mt-xs">{note.content}</p>
                        <button
                          onClick={() => handleDeleteNote(note.id)}
                          className="mt-md text-red-600 text-xs font-semibold hover:text-red-700"
                        >
                          Delete
                        </button>
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
