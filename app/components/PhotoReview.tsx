'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { AIResult } from './DocReview'

const BUCKET = 'property-photos'

/**
 * Review step for an uploaded PHOTO (as opposed to a document). The AI can't
 * tell which property a photo belongs to, so the admin confirms the property
 * (required) and optionally a room. Saving uploads the file to the
 * property-photos bucket and records a property_photos row. Room can also be
 * assigned/changed later on the property's Photos tab.
 */
export default function PhotoReview({
  initial,
  file,
  properties,
  onApplied,
  onCancel,
}: {
  initial: AIResult
  file: File
  properties: Array<{ id: string; name: string; address?: string }>
  onApplied: (msg: string) => void
  onCancel: () => void
}) {
  const previewUrl = useMemo(() => URL.createObjectURL(file), [file])
  useEffect(() => () => URL.revokeObjectURL(previewUrl), [previewUrl])

  // Best-effort property guess from any address text the AI pulled out.
  const guessed = useMemo(() => {
    const addr = (initial.property_address || '').toLowerCase()
    if (!addr) return ''
    const m = properties.find(
      (p) =>
        (p.address && addr.includes(String(p.address).toLowerCase())) ||
        addr.includes(String(p.name).toLowerCase()) ||
        String(p.address || '').toLowerCase().includes(addr)
    )
    return m?.id || ''
  }, [initial.property_address, properties])

  const [propertyId, setPropertyId] = useState(guessed)
  const [roomId, setRoomId] = useState('')
  const [rooms, setRooms] = useState<Array<{ id: string; name: string }>>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadRooms() {
      if (!propertyId) { setRooms([]); return }
      const supabase = createClient()
      const { data } = await supabase.from('rooms').select('id, name').eq('property_id', propertyId).order('name')
      setRooms(data || [])
    }
    loadRooms()
    setRoomId('')
  }, [propertyId])

  async function handleSave() {
    if (!propertyId) { setError('Choose which property this photo is for'); return }
    setSaving(true)
    setError('')
    try {
      const supabase = createClient()
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${propertyId}/${Date.now()}-${safe}`
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || 'image/jpeg',
      })
      if (upErr) throw new Error(upErr.message)
      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
      const { error: insErr } = await supabase.from('property_photos').insert({
        property_id: propertyId,
        room_id: roomId || null,
        file_name: file.name,
        file_path: path,
        file_url: urlData?.publicUrl || null,
      })
      if (insErr) throw new Error(insErr.message)
      const where = roomId ? rooms.find((r) => r.id === roomId)?.name || 'room' : 'whole property'
      onApplied(`Photo saved to ${properties.find((p) => p.id === propertyId)?.name || 'property'} (${where})`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save photo')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl border-2 border-neutral-200 bg-white p-lg">
      <div className="flex items-start gap-lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={previewUrl} alt={file.name} className="h-24 w-24 shrink-0 rounded-lg border border-neutral-200 object-cover" />
        <div className="min-w-0 flex-1">
          <span className="inline-block rounded bg-teal-100 px-sm py-0.5 text-xs font-semibold text-teal-800">📷 Photo</span>
          <p className="mt-xs truncate text-sm font-semibold text-neutral-900">{file.name}</p>
          <p className="text-xs text-neutral-500">Confirm which property this belongs to. You can set the room now or later on the Photos tab.</p>
        </div>
      </div>

      <div className="mt-lg grid grid-cols-1 gap-md sm:grid-cols-2">
        <div>
          <label className="block text-xs font-bold text-neutral-700 mb-xs">Property *</label>
          <select
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
          >
            <option value="">Select a property…</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-neutral-700 mb-xs">Room (optional)</label>
          <select
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            disabled={!propertyId}
            className="w-full rounded-lg border border-neutral-300 px-md py-sm text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900 disabled:opacity-50"
          >
            <option value="">Whole property</option>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
      </div>

      {error && <p className="mt-md text-sm text-red-600">{error}</p>}

      <div className="mt-lg flex gap-md">
        <button
          onClick={onCancel}
          disabled={saving}
          className="flex-1 rounded-lg border border-neutral-300 px-lg py-sm text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
        >
          Skip
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 rounded-lg bg-neutral-900 px-lg py-sm text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save photo'}
        </button>
      </div>
    </div>
  )
}
