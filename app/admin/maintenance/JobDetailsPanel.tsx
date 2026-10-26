'use client'

// A job's details in the job window, now editable (26 Oct 2026, Harry: "make existing jobs in the admin panel editable
// so more information or photos can be added once it is set up"): description, category, priority, where and room,
// the title, and its photos — the tenant's, the contractor's before/after and any the office adds.
// Route: /api/admin/maintenance/jobs/<id>.
import { useEffect, useRef, useState } from 'react'
import { adminFetch } from '@/lib/adminFetch'

type Photo = { id: string; url: string; name: string }
type Room = { id: string; name: string }
type Job = { id: string; title: string; description: string | null; category: string | null; priority: string; location: string | null; room_id: string | null }

const CATEGORIES = ['Appliances', 'Cleanliness & Pests', 'Decoration & Finishes', 'Electrical', 'Furniture', 'Heating & Cooling', 'Plumbing', 'Safety & Security', 'Structure & Building', 'Other']
const WHERE = ['My Room / Bedroom', 'Kitchen', 'Bathroom (ground floor)', 'Bathroom (first floor)', 'Living Room', 'Hallway (ground floor)', 'Hallway (first floor)', 'Stairs', 'Front entrance', 'Back / garden', 'Communal area', 'Outside / exterior', 'Other']
const PRIORITY: Record<string, string> = { low: 'Routine', medium: 'Urgent', high: 'High', emergency: 'Emergency' }
const PRIORITY_TONE: Record<string, string> = { low: 'text-neutral-600', medium: 'text-amber-700', high: 'text-orange-700', emergency: 'text-red-700' }

/** Phone photos are several MB: shrink to 1600px JPEG in the browser so the upload always fits. */
async function shrink(file: File): Promise<File> {
  if (!/^image\//.test(file.type) || file.size < 900_000) return file
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    const blob: Blob | null = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.82))
    return blob ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file
  } catch { return file }
}

export default function JobDetailsPanel({ ticketId, onSaved }: { ticketId: string; onSaved: (patch: Partial<Job>) => void }) {
  const [job, setJob] = useState<Job | null>(null)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Job | null>(null)
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const load = () => adminFetch(`/api/admin/maintenance/jobs/${ticketId}`).then(async r => {
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error ?? 'The job couldn’t be loaded'); return }
    setJob(d.job); setPhotos(d.photos ?? []); setRooms(d.rooms ?? [])
  }).catch(() => setError('The job couldn’t be loaded — check the connection.'))
  useEffect(() => { setEditing(false); setNote(''); load() }, [ticketId])   // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (!draft) return
    setBusy('save'); setError(''); setNote('')
    const body = { title: draft.title, description: draft.description ?? '', category: draft.category ?? '', priority: draft.priority, location: draft.location ?? '', room_id: draft.room_id }
    const r = await adminFetch(`/api/admin/maintenance/jobs/${ticketId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await r.json().catch(() => ({}))
    setBusy('')
    if (!r.ok) { setError(d.error ?? 'Not saved'); return }
    setJob(draft); setEditing(false); setNote('Saved.')
    onSaved({ title: draft.title, description: draft.description, category: draft.category, priority: draft.priority, location: draft.location, room_id: draft.room_id })
  }

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return
    setBusy('photo'); setError(''); setNote('')
    let added = 0
    for (const f of Array.from(files).slice(0, 10)) {
      const fd = new FormData(); fd.append('file', await shrink(f))
      const r = await adminFetch(`/api/admin/maintenance/jobs/${ticketId}`, { method: 'POST', body: fd })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error ?? 'A photo didn’t upload'); break }
      added++
    }
    setBusy('')
    if (fileRef.current) fileRef.current.value = ''
    if (added) { setNote(`${added} photo${added === 1 ? '' : 's'} added.`); await load() }
  }

  if (error && !job) return <p className="text-sm font-semibold text-red-700">{error}</p>
  if (!job) return <p className="text-sm text-neutral-400">Loading the job…</p>

  const input = 'mt-xs w-full rounded-xl border border-neutral-300 bg-white px-md py-sm text-sm text-neutral-900'
  const roomName = rooms.find(r => r.id === job.room_id)?.name

  return (
    <div className="space-y-md">
      <div className="flex items-center justify-between gap-sm">
        <h3 className="font-medium text-neutral-900">Details</h3>
        {!editing && <button type="button" onClick={() => { setDraft(job); setEditing(true); setNote('') }} className="rounded-lg border border-neutral-300 px-md py-xs text-sm font-bold text-neutral-900 hover:bg-neutral-50">Edit details</button>}
      </div>

      {editing && draft ? (
        <div className="space-y-sm rounded-xl border border-neutral-200 bg-neutral-50 p-md">
          <label className="block text-xs font-medium text-neutral-700">Title<input value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} className={input} /></label>
          <label className="block text-xs font-medium text-neutral-700">Description — add anything the contractor should know
            <textarea rows={5} value={draft.description ?? ''} onChange={e => setDraft({ ...draft, description: e.target.value })} className={input} /></label>
          <div className="grid gap-sm sm:grid-cols-2">
            <label className="block text-xs font-medium text-neutral-700">Category
              <select value={draft.category ?? ''} onChange={e => setDraft({ ...draft, category: e.target.value })} className={input}>
                {[...new Set([...(draft.category && !CATEGORIES.includes(draft.category) ? [draft.category] : []), ...CATEGORIES])].map(c => <option key={c} value={c}>{c}</option>)}
              </select></label>
            <label className="block text-xs font-medium text-neutral-700">Priority
              <select value={draft.priority} onChange={e => setDraft({ ...draft, priority: e.target.value })} className={input}>
                {Object.entries(PRIORITY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select></label>
            <label className="block text-xs font-medium text-neutral-700">Where in the house
              <select value={draft.location ?? ''} onChange={e => setDraft({ ...draft, location: e.target.value })} className={input}>
                <option value="">Not said</option>
                {[...new Set([...(draft.location && !WHERE.includes(draft.location) ? [draft.location] : []), ...WHERE])].map(w => <option key={w} value={w}>{w}</option>)}
              </select></label>
            <label className="block text-xs font-medium text-neutral-700">Room
              <select value={draft.room_id ?? ''} onChange={e => setDraft({ ...draft, room_id: e.target.value || null })} className={input}>
                <option value="">No room (shared area)</option>
                {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select></label>
          </div>
          {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
          <div className="flex gap-sm">
            <button type="button" onClick={save} disabled={busy === 'save' || !draft.title.trim()} className="flex-1 rounded-lg bg-neutral-900 py-sm text-sm font-bold text-white disabled:bg-neutral-300">{busy === 'save' ? 'Saving…' : 'Save details'}</button>
            <button type="button" onClick={() => { setEditing(false); setError('') }} className="rounded-lg border border-neutral-300 px-md py-sm text-sm font-bold">Cancel</button>
          </div>
        </div>
      ) : (
        <>
          <p className="whitespace-pre-line text-sm text-neutral-600">{job.description || 'No description yet — use Edit details to add one.'}</p>
          <dl className="grid grid-cols-2 gap-md text-sm">
            <div><dt className="font-medium text-neutral-900">Category</dt><dd className="mt-xs text-neutral-600">{job.category || '—'}</dd></div>
            <div><dt className="font-medium text-neutral-900">Priority</dt><dd className={`mt-xs font-semibold ${PRIORITY_TONE[job.priority] ?? 'text-neutral-600'}`}>{PRIORITY[job.priority] ?? job.priority}</dd></div>
            <div><dt className="font-medium text-neutral-900">Where</dt><dd className="mt-xs text-neutral-600">{job.location || '—'}</dd></div>
            <div><dt className="font-medium text-neutral-900">Room</dt><dd className="mt-xs text-neutral-600">{roomName ?? 'No room (shared area)'}</dd></div>
          </dl>
        </>
      )}

      <div>
        <div className="flex items-center justify-between gap-sm">
          <h3 className="font-medium text-neutral-900">Photos{photos.length ? ` (${photos.length})` : ''}</h3>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy === 'photo'} className="rounded-lg border border-neutral-300 px-md py-xs text-sm font-bold text-neutral-900 hover:bg-neutral-50 disabled:opacity-50">{busy === 'photo' ? 'Uploading…' : 'Add photos'}</button>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={e => addPhotos(e.target.files)} />
        </div>
        {photos.length === 0 ? <p className="mt-xs text-sm text-neutral-500">No photos yet.</p> : (
          <div className="mt-sm grid grid-cols-3 gap-sm sm:grid-cols-4">
            {photos.map(p => (
              <a key={p.id} href={p.url} target="_blank" rel="noreferrer" title={p.name} className="block aspect-square overflow-hidden rounded-lg bg-neutral-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.name} className="h-full w-full object-cover" />
              </a>
            ))}
          </div>
        )}
      </div>
      {note && <p className="text-sm font-semibold text-green-800">{note}</p>}
      {error && !editing && <p className="text-sm font-semibold text-red-700">{error}</p>}
    </div>
  )
}
