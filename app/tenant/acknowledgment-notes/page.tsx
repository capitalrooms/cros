'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import Link from 'next/link'

interface AcknowledgmentNote {
  id: string
  title: string
  content: string
  created_at: string
  photo_required: boolean
  photo_attachment_id: string | null
  status: 'active' | 'acknowledged' | 'filed'
  acknowledged_at: string | null
  expires_at: string
}

export default function AcknowledgmentNotesPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [notes, setNotes] = useState<AcknowledgmentNote[]>([])
  const [loading, setLoading] = useState(true)
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      if (!data || data.assignment?.role !== 'tenant') {
        router.push('/login')
        return
      }
      // Store the people row (not the auth user): tenancies.person_id and the
      // acknowledged_by FK both reference people(id), which is NOT the auth id.
      setUser(data.assignment)

      const supabase = createClient()

      // Get tenancy for this tenant
      const { data: tenancies } = await supabase
        .from('tenancies')
        .select('room_id')
        .eq('person_id', data.assignment.id)
        .single()

      if (tenancies) {
        // Fetch active acknowledgment notes for this room
        const { data: notesData } = await supabase
          .from('tenant_acknowledgment_notes')
          .select('*')
          .eq('room_id', tenancies.room_id)
          .in('status', ['active', 'acknowledged'])
          .order('created_at', { ascending: false })

        setNotes(notesData || [])
      }

      setLoading(false)
    }
    init()
  }, [router])

  async function handleAcknowledge(noteId: string) {
    const note = notes.find((n) => n.id === noteId)
    if (!note) return

    if (note.photo_required && !photoFile) {
      alert('Please upload a photo')
      return
    }

    setSubmitting(true)
    try {
      const supabase = createClient()
      let photoAttachmentId = note.photo_attachment_id

      // Upload photo if provided
      if (photoFile) {
        const fileName = `${noteId}-${Date.now()}.jpg`
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('acknowledgments')
          .upload(fileName, photoFile)

        if (uploadError) throw uploadError
        photoAttachmentId = uploadData.path
      }

      // Update note
      const { error: updateError } = await supabase
        .from('tenant_acknowledgment_notes')
        .update({
          status: 'acknowledged',
          acknowledged_by: user.id,
          acknowledged_at: new Date().toISOString(),
          photo_attachment_id: photoAttachmentId,
        })
        .eq('id', noteId)

      if (updateError) throw updateError

      alert('✅ Acknowledged. Thank you!')
      setAcknowledgingId(null)
      setPhotoFile(null)

      // Refresh notes
      const { data: tenancies } = await supabase
        .from('tenancies')
        .select('room_id')
        .eq('person_id', user.id)
        .single()

      if (tenancies) {
        const { data: notesData } = await supabase
          .from('tenant_acknowledgment_notes')
          .select('*')
          .eq('room_id', tenancies.room_id)
          .in('status', ['active', 'acknowledged'])
          .order('created_at', { ascending: false })

        setNotes(notesData || [])
      }
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="flex items-center justify-center min-h-screen">Loading...</div>

  const activeNotes = notes.filter((n) => n.status === 'active')
  const acknowledgedNotes = notes.filter((n) => n.status === 'acknowledged')

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar right={<BackButton href="/tenant" />} />

      <main className="mx-auto max-w-2xl px-lg py-2xl">
        <h1 className="text-3xl font-bold text-neutral-900 mb-lg">📝 Important Notes</h1>

        {/* Active Notes */}
        {activeNotes.length > 0 && (
          <section className="mb-3xl">
            <h2 className="text-xl font-bold text-neutral-900 mb-md">⏰ Awaiting Your Acknowledgment</h2>
            <div className="space-y-md">
              {activeNotes.map((note) => (
                <div
                  key={note.id}
                  className="rounded-2xl border-2 border-blue-300 bg-blue-50 p-lg"
                >
                  <h3 className="font-bold text-neutral-900 text-lg mb-md">{note.title}</h3>
                  <p className="text-neutral-700 mb-md leading-relaxed whitespace-pre-wrap">{note.content}</p>

                  <p className="text-xs text-neutral-600 mb-md">
                    Expires: {new Date(note.expires_at).toLocaleDateString('en-GB')}
                  </p>

                  {acknowledgingId === note.id ? (
                    <div className="space-y-md">
                      {note.photo_required && (
                        <div>
                          <label className="block text-sm font-semibold text-neutral-900 mb-sm">
                            📸 Upload Photo Evidence
                          </label>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
                            className="block w-full text-sm text-neutral-600 file:px-md file:py-sm file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-100 file:text-blue-600 hover:file:bg-blue-200"
                          />
                          {photoFile && (
                            <p className="text-xs text-green-600 mt-xs">✅ {photoFile.name} selected</p>
                          )}
                        </div>
                      )}

                      <div className="flex gap-md pt-md">
                        <button
                          onClick={() => handleAcknowledge(note.id)}
                          disabled={submitting || (note.photo_required && !photoFile)}
                          className="flex-1 rounded-xl bg-blue-600 px-md py-sm text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          {submitting ? 'Saving...' : '✓ I Acknowledge'}
                        </button>
                        <button
                          onClick={() => {
                            setAcknowledgingId(null)
                            setPhotoFile(null)
                          }}
                          className="flex-1 rounded-xl border border-neutral-300 px-md py-sm text-sm font-semibold hover:bg-neutral-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAcknowledgingId(note.id)}
                      className="w-full rounded-xl bg-blue-600 px-md py-sm text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      {note.photo_required ? '📸 Acknowledge with Photo' : '✓ Acknowledge'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Acknowledged Notes */}
        {acknowledgedNotes.length > 0 && (
          <section>
            <h2 className="text-xl font-bold text-neutral-900 mb-md">✅ Acknowledged</h2>
            <div className="space-y-sm">
              {acknowledgedNotes.map((note) => (
                <div
                  key={note.id}
                  className="rounded-lg border border-neutral-200 bg-white p-md"
                >
                  <p className="font-semibold text-neutral-900">{note.title}</p>
                  <p className="text-xs text-neutral-600 mt-xs">
                    Acknowledged {new Date(note.acknowledged_at!).toLocaleDateString('en-GB')}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {activeNotes.length === 0 && acknowledgedNotes.length === 0 && (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center">
            <p className="text-sm text-neutral-600">No notes at the moment</p>
          </div>
        )}
      </main>
    </div>
  )
}
