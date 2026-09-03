'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'

interface Photo {
  id: string
  property_id: string
  room_id: string | null
  file_path: string
  file_url: string | null
  caption: string | null
  is_featured: boolean
  room?: { name: string } | null
}

interface PhotosTabProps {
  propertyId: string
}

const BUCKET = 'property-photos'

// Communal areas aren't rooms in the DB, so they're stored on the photo's
// caption (room_id stays null → still counts as a "whole property" photo).
const COMMUNAL_AREAS = ['Kitchen', 'Lounge / Living room', 'Bathroom', 'Hallway / Landing', 'Exterior / Front', 'Garden', 'Communal area']

/** A file selected but not yet uploaded — held until the user labels it. */
interface Pending {
  file: File
  previewUrl: string
  // Target scheme: '' = whole property, 'room:<id>', 'area:<label>'
  target: string
}

export default function PhotosTab({ propertyId }: PhotosTabProps) {
  const supabase = createClient()
  const fileInput = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(true)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [rooms, setRooms] = useState<Array<{ id: string; name: string }>>([])
  const [me, setMe] = useState<any>(null)
  const [pending, setPending] = useState<Pending[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('all') // 'all' | 'communal' | room_id
  const [savingFeatured, setSavingFeatured] = useState<string | null>(null)

  // AI photo scan state
  const [scanResult, setScanResult] = useState<{
    roomId: string
    roomName: string
    features: Record<string, any>
    accepted: Record<string, boolean>
  } | null>(null)
  const [savingFeatures, setSavingFeatures] = useState(false)

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      setMe(data?.assignment || null)
      await Promise.all([loadPhotos(), loadRooms()])
      setLoading(false)
    }
    init()
  }, [propertyId])

  async function loadPhotos() {
    // room_id has no FK, so no PostgREST embed — resolve room names from `rooms`.
    const { data, error: err } = await supabase
      .from('property_photos')
      .select('*')
      .eq('property_id', propertyId)
      .order('created_at', { ascending: false })
    if (err) setError('Could not load photos — has the property_photos table been created?')
    else { setPhotos(data || []); setError(null) }
  }

  async function loadRooms() {
    const { data } = await supabase.from('rooms').select('id, name').eq('property_id', propertyId).order('name')
    setRooms(data || [])
  }

  /** Stage the picked files for classification — no upload happens yet. */
  function stageFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    const staged: Pending[] = Array.from(files).map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      target: '',
    }))
    setPending((prev) => [...prev, ...staged])
    setError(null)
    if (fileInput.current) fileInput.current.value = ''
  }

  function setPendingTarget(index: number, target: string) {
    setPending((prev) => prev.map((p, i) => (i === index ? { ...p, target } : p)))
  }

  /** Apply one target to every staged photo at once. */
  function applyToAll(target: string) {
    setPending((prev) => prev.map((p) => ({ ...p, target })))
  }

  function removePending(index: number) {
    setPending((prev) => {
      const gone = prev[index]
      if (gone) URL.revokeObjectURL(gone.previewUrl)
      return prev.filter((_, i) => i !== index)
    })
  }

  function cancelStaged() {
    pending.forEach((p) => URL.revokeObjectURL(p.previewUrl))
    setPending([])
  }

  /** Resolve the dropdown target into the columns we store. */
  function resolveTarget(target: string): { room_id: string | null; caption: string | null } {
    if (target.startsWith('room:')) return { room_id: target.slice(5), caption: null }
    if (target.startsWith('area:')) return { room_id: null, caption: target.slice(5) }
    return { room_id: null, caption: null }
  }

  /** Upload every staged file with the room/area it was labelled with. */
  async function uploadStaged() {
    if (pending.length === 0) return
    setUploading(true)
    setError(null)
    let done = 0
    const total = pending.length
    try {
      for (const item of pending) {
        setUploadMsg(`Uploading ${done + 1} of ${total}…`)
        const safe = item.file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = `${propertyId}/${Date.now()}-${safe}`
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, item.file, {
          cacheControl: '3600',
          upsert: false,
          contentType: item.file.type || 'image/jpeg',
        })
        if (upErr) throw new Error(upErr.message)
        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
        const { room_id, caption } = resolveTarget(item.target)
        const { error: insErr } = await supabase.from('property_photos').insert({
          property_id: propertyId,
          room_id,
          caption,
          file_name: item.file.name,
          file_path: path,
          file_url: urlData?.publicUrl || null,
          created_by: me?.id || null,
        })
        if (insErr) throw new Error(insErr.message)
        done++
      }
      setUploadMsg(`✓ ${done} photo${done === 1 ? '' : 's'} uploaded.`)
      pending.forEach((p) => URL.revokeObjectURL(p.previewUrl))

      // After uploading, check if any were tagged to a room — if so, trigger photo scan
      // on the first room photo uploaded this batch (don't spam if multiple uploaded).
      const firstRoomItem = pending.find(item => item.target.startsWith('room:'))
      if (firstRoomItem && process.env.NEXT_PUBLIC_ANTHROPIC_ENABLED !== 'false') {
        const roomId = firstRoomItem.target.replace('room:', '')
        const roomName = rooms.find(r => r.id === roomId)?.name || 'Room'
        // Get the public URL we just uploaded
        const safe = firstRoomItem.file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        // Find the uploaded photo URL by re-querying
        const { data: newPhoto } = await supabase
          .from('property_photos')
          .select('file_url')
          .eq('property_id', propertyId)
          .eq('room_id', roomId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (newPhoto?.file_url) {
          setUploadMsg('✨ Scanning room photo for features…')
          try {
            const res = await fetch('/api/rooms/scan-photo', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ photo_url: newPhoto.file_url }),
            })
            const { features } = await res.json()
            if (features) {
              // Build accepted map — only include non-null features
              const accepted: Record<string, boolean> = {}
              for (const key of Object.keys(features)) {
                const val = features[key]
                if (val !== null && val !== undefined && !(Array.isArray(val) && val.length === 0)) {
                  accepted[key] = true
                }
              }
              setScanResult({ roomId, roomName, features, accepted })
            }
          } catch {
            // Scan failed silently — don't block the upload flow
          }
        }
      }

      setPending([])
      await loadPhotos()
      setTimeout(() => setUploadMsg(null), 5000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
      setUploadMsg(null)
    } finally {
      setUploading(false)
    }
  }

  async function saveDetectedFeatures() {
    if (!scanResult) return
    setSavingFeatures(true)
    // Build the features object with only accepted items
    const toSave: Record<string, any> = {}
    for (const [key, val] of Object.entries(scanResult.features)) {
      if (scanResult.accepted[key]) toSave[key] = val
    }
    await supabase
      .from('rooms')
      .update({ detected_features: toSave })
      .eq('id', scanResult.roomId)
    setSavingFeatures(false)
    setScanResult(null)
    setUploadMsg(`✓ Room features saved for ${scanResult.roomName}`)
    setTimeout(() => setUploadMsg(null), 4000)
  }

  /** The current label of an already-uploaded photo, in TargetSelect's scheme. */
  function photoTargetValue(p: Photo): string {
    if (p.room_id) return `room:${p.room_id}`
    if (p.caption) return `area:${p.caption}`
    return ''
  }

  /** Re-clarify an already-uploaded photo — correct a wrong room or switch area. */
  async function reclassify(photoId: string, target: string) {
    const { room_id, caption } = resolveTarget(target)
    const { error: err } = await supabase
      .from('property_photos')
      .update({ room_id, caption })
      .eq('id', photoId)
    if (!err) {
      setPhotos((prev) =>
        prev.map((p) =>
          p.id === photoId
            ? { ...p, room_id, caption, room: room_id ? { name: rooms.find((r) => r.id === room_id)?.name || '' } : null }
            : p
        )
      )
    }
  }

  async function handleSetFeatured(photoId: string) {
    setSavingFeatured(photoId)
    try {
      // Clear is_featured on all photos for this property, then set it on the chosen one
      await supabase.from('property_photos').update({ is_featured: false }).eq('property_id', propertyId)
      await supabase.from('property_photos').update({ is_featured: true }).eq('id', photoId)
      // Stamp featured_photo_id on the property itself (drives the header display)
      await supabase.from('properties').update({ featured_photo_id: photoId }).eq('id', propertyId)
      // Update local state so the UI reflects immediately without a reload
      setPhotos((prev) => prev.map((p) => ({ ...p, is_featured: p.id === photoId })))
    } catch {
      setError('Failed to set featured photo — please try again')
    } finally {
      setSavingFeatured(null)
    }
  }

  async function handleDelete(photo: Photo) {
    if (!confirm('Delete this photo?')) return
    await supabase.storage.from(BUCKET).remove([photo.file_path])
    const { error: err } = await supabase.from('property_photos').delete().eq('id', photo.id)
    if (!err) setPhotos((prev) => prev.filter((p) => p.id !== photo.id))
  }

  const filtered = photos.filter((p) =>
    filter === 'all' ? true : filter === 'communal' ? !p.room_id : p.room_id === filter
  )
  const communalCount = photos.filter((p) => !p.room_id).length
  const unlabelledPending = pending.filter((p) => !p.target).length

  if (loading) return <div className="p-xl text-sm text-neutral-400">Loading photos…</div>

  return (
    <div className="space-y-xl">
      <div className="flex items-start justify-between gap-md">
        <div>
          <h2 className="text-xl font-semibold text-neutral-900">Photos</h2>
          <p className="text-sm text-neutral-400 mt-xs">
            Choose photos, tell us which room or area each one shows, then upload. Room photos also show on that room&apos;s dashboard.
          </p>
        </div>
        <div className="shrink-0">
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => stageFiles(e.target.files)}
          />
          <button
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            className="px-lg py-md bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 transition disabled:opacity-50"
          >
            {pending.length ? '+ Add more' : '+ Choose photos'}
          </button>
        </div>
      </div>

      {uploadMsg && <div className="p-md rounded-lg bg-blue-950 border border-blue-800 text-sm text-blue-200">{uploadMsg}</div>}
      {error && <div className="p-md rounded-lg bg-red-950 border border-red-800 text-sm text-red-300">{error}</div>}

      {/* AI scan result — feature confirmation */}
      {scanResult && (
        <div className="rounded-xl border border-purple-700 bg-purple-950/60 p-lg">
          <div className="flex items-start justify-between gap-md mb-md">
            <div>
              <p className="text-sm font-bold text-purple-200">✨ Features detected in {scanResult.roomName}</p>
              <p className="text-xs text-purple-400 mt-xs">Uncheck anything that doesn't look right, then save.</p>
            </div>
            <button onClick={() => setScanResult(null)} className="text-purple-400 hover:text-purple-200 text-xs">Dismiss</button>
          </div>
          <div className="space-y-xs">
            {Object.entries(scanResult.features).map(([key, val]) => {
              if (val === null || val === undefined) return null
              if (Array.isArray(val) && val.length === 0) return null
              const label = Array.isArray(val) ? val.join(', ') : String(val)
              const fieldLabel: Record<string, string> = {
                flooring: 'Flooring',
                natural_light: 'Natural light',
                window_treatment: 'Window treatment',
                wardrobe: 'Wardrobe',
                window_type: 'Windows',
                extras: 'Other features',
              }
              return (
                <label key={key} className="flex items-center gap-sm cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={!!scanResult.accepted[key]}
                    onChange={e => setScanResult(prev => prev ? {
                      ...prev,
                      accepted: { ...prev.accepted, [key]: e.target.checked },
                    } : null)}
                    className="h-4 w-4 rounded accent-purple-500"
                  />
                  <span className="text-xs text-purple-300">
                    <span className="text-purple-500 font-semibold">{fieldLabel[key] || key}:</span>{' '}
                    {label}
                  </span>
                </label>
              )
            })}
          </div>
          <div className="flex gap-sm mt-md">
            <button
              onClick={() => setScanResult(null)}
              className="flex-1 rounded-lg border border-purple-700 py-sm text-xs font-semibold text-purple-300 hover:bg-purple-900/40"
            >
              Skip
            </button>
            <button
              onClick={saveDetectedFeatures}
              disabled={savingFeatures}
              className="flex-1 rounded-lg bg-purple-700 py-sm text-xs font-bold text-white hover:bg-purple-600 disabled:opacity-50"
            >
              {savingFeatures ? 'Saving…' : 'Save to room'}
            </button>
          </div>
        </div>
      )}

      {/* Classify-before-upload panel */}
      {pending.length > 0 && (
        <div className="rounded-xl border border-blue-800 bg-neutral-900 p-lg space-y-md">
          <div className="flex flex-wrap items-center justify-between gap-md">
            <div>
              <h3 className="text-sm font-bold text-white">
                Label {pending.length} photo{pending.length === 1 ? '' : 's'} before uploading
              </h3>
              <p className="text-xs text-neutral-400 mt-xs">
                Pick the room or area each shows. {unlabelledPending > 0 ? `${unlabelledPending} still set to “Whole property”.` : 'All labelled.'}
              </p>
            </div>
            <label className="flex items-center gap-sm text-xs text-neutral-300">
              Apply to all:
              <TargetSelect rooms={rooms} value="" onChange={(v) => applyToAll(v)} />
            </label>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-md">
            {pending.map((item, i) => (
              <div key={i} className="rounded-lg border border-neutral-800 bg-neutral-950 overflow-hidden">
                <div className="aspect-square bg-neutral-800">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.previewUrl} alt="To upload" className="w-full h-full object-cover" />
                </div>
                <div className="p-sm space-y-xs">
                  <TargetSelect rooms={rooms} value={item.target} onChange={(v) => setPendingTarget(i, v)} />
                  <button onClick={() => removePending(i)} className="text-xs text-neutral-500 hover:text-red-400">Remove</button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-md pt-sm">
            <button
              onClick={uploadStaged}
              disabled={uploading}
              className="px-lg py-md bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 transition disabled:opacity-50"
            >
              {uploading ? 'Uploading…' : `Upload ${pending.length} photo${pending.length === 1 ? '' : 's'}`}
            </button>
            <button
              onClick={cancelStaged}
              disabled={uploading}
              className="px-lg py-md border border-neutral-700 text-neutral-300 rounded-lg font-semibold text-sm hover:border-neutral-500 transition disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filter */}
      {photos.length > 0 && (
        <div className="flex flex-wrap gap-sm">
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} label="All" count={photos.length} />
          <FilterChip active={filter === 'communal'} onClick={() => setFilter('communal')} label="Whole property" count={communalCount} />
          {rooms.map((r) => {
            const n = photos.filter((p) => p.room_id === r.id).length
            return <FilterChip key={r.id} active={filter === r.id} onClick={() => setFilter(r.id)} label={r.name} count={n} />
          })}
        </div>
      )}

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-700 bg-neutral-900 p-xl text-center">
          <p className="text-sm text-neutral-500">
            {photos.length === 0 ? 'No photos yet. Choose a batch to get started.' : 'Nothing in this view.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-md">
          {filtered.map((p) => (
            <div key={p.id} className="rounded-lg border border-neutral-800 bg-neutral-900 overflow-hidden">
              <div className="aspect-square bg-neutral-800 relative">
                {p.file_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.file_url} alt={p.caption || 'Property photo'} className="w-full h-full object-cover" />
                )}
                {p.caption && !p.room_id && (
                  <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">{p.caption}</span>
                )}
              </div>
              <div className="p-sm space-y-xs">
                <label className="block text-[10px] font-bold uppercase tracking-wide text-neutral-500">Room / area</label>
                <TargetSelect rooms={rooms} value={photoTargetValue(p)} onChange={(v) => reclassify(p.id, v)} />
                <div className="flex items-center justify-between pt-xs">
                  <button
                    onClick={() => { if (!p.is_featured) handleSetFeatured(p.id) }}
                    disabled={savingFeatured === p.id}
                    title={p.is_featured ? 'This is the featured photo' : 'Set as featured photo'}
                    className={`text-xs font-semibold transition-colors ${
                      p.is_featured
                        ? 'text-amber-500 cursor-default'
                        : savingFeatured === p.id
                        ? 'text-neutral-400 animate-pulse cursor-wait'
                        : 'text-neutral-400 hover:text-amber-500 cursor-pointer'
                    }`}
                  >
                    {savingFeatured === p.id ? '⏳ Saving…' : p.is_featured ? '⭐ Featured' : '⭐ Set featured'}
                  </button>
                  <button onClick={() => handleDelete(p)} className="text-xs text-neutral-500 hover:text-red-400">Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Room / communal-area picker used both while staging and when re-assigning. */
function TargetSelect({
  rooms,
  value,
  onChange,
}: {
  rooms: Array<{ id: string; name: string }>
  value: string
  onChange: (v: string) => void
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full min-w-0 rounded border border-neutral-600 bg-neutral-800 px-sm py-xs text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
    >
      <option value="">Whole property</option>
      <optgroup label="Communal area">
        {COMMUNAL_AREAS.map((a) => <option key={a} value={`area:${a}`}>{a}</option>)}
      </optgroup>
      {rooms.length > 0 && (
        <optgroup label="Rooms">
          {rooms.map((r) => <option key={r.id} value={`room:${r.id}`}>{r.name}</option>)}
        </optgroup>
      )}
    </select>
  )
}

function FilterChip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={`px-md py-xs rounded-full text-xs font-semibold border ${
        active ? 'bg-white text-neutral-900 border-white' : 'border-neutral-700 text-neutral-300 hover:border-neutral-500'
      }`}
    >
      {label}<span className="ml-xs text-neutral-500">{count}</span>
    </button>
  )
}
