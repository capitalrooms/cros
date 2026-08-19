'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'

interface RoomNote {
  id: string
  content: string
  note_type: string
  created_by?: string
  created_at: string
}

interface RoomNotesSectionProps {
  roomId: string
  notes: RoomNote[]
  onNotesUpdated: () => void
  canEdit?: boolean
}

export default function RoomNotesSection({
  roomId,
  notes,
  onNotesUpdated,
  canEdit = false,
}: RoomNotesSectionProps) {
  const supabase = createClient()
  const [showAddNote, setShowAddNote] = useState(false)
  const [newNoteContent, setNewNoteContent] = useState('')
  const [saving, setSaving] = useState(false)

  const handleAddNote = async () => {
    if (!newNoteContent.trim()) return

    setSaving(true)
    try {
      const { error } = await supabase
        .from('room_notes')
        .insert([
          {
            room_id: roomId,
            content: newNoteContent,
            note_type: 'admin_notes',
          },
        ])

      if (error) throw error

      setNewNoteContent('')
      setShowAddNote(false)
      onNotesUpdated()
    } catch (err) {
      console.error('Error adding note:', err)
      alert('Failed to add note')
    } finally {
      setSaving(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="space-y-md">
      {notes.length > 0 && (
        <div className="space-y-sm">
          {notes.map((note) => (
            <div key={note.id} className="p-sm bg-yellow-50 border border-yellow-200 rounded text-sm">
              <p className="text-neutral-900">{note.content}</p>
              <p className="text-xs text-neutral-500 mt-xs">Added {formatDate(note.created_at)}</p>
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <>
          {!showAddNote ? (
            <button
              onClick={() => setShowAddNote(true)}
              className="text-xs text-blue-600 hover:text-blue-800 font-semibold"
            >
              + Add note
            </button>
          ) : (
            <div className="space-y-xs">
              <textarea
                value={newNoteContent}
                onChange={(e) => setNewNoteContent(e.target.value)}
                placeholder="Add a note about this room..."
                className="w-full px-sm py-xs text-xs border border-blue-300 rounded"
                rows={2}
              />
              <div className="flex gap-xs">
                <button
                  onClick={handleAddNote}
                  disabled={saving || !newNoteContent.trim()}
                  className="text-xs px-sm py-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => {
                    setShowAddNote(false)
                    setNewNoteContent('')
                  }}
                  className="text-xs px-sm py-xs border border-neutral-300 rounded hover:bg-neutral-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
