'use client'

// Receipts and other files sent with an invoice or letter (migration 254). They're kept with the saved document,
// linked from the email, and listed in the landlord's app under Your documents.
import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { adminFetch } from '@/lib/adminFetch'

interface F { id: string; name: string; type: string; size: number | null; url: string | null }
const TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']

export default function ReceiptsBox({ documentId, ensureSaved }: { documentId: string | null; ensureSaved: () => Promise<string | null> }) {
  const [files, setFiles] = useState<F[]>([])
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [setup, setSetup] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const load = useCallback(async (id: string | null) => {
    if (!id) { setFiles([]); return }
    const r = await adminFetch(`/api/admin/documents/generated/files?documentId=${id}`)
    const d = await r.json().catch(() => ({}))
    setFiles(d.files ?? []); setSetup(!!d.setupNeeded)
  }, [])
  useEffect(() => { load(documentId) }, [documentId, load])

  async function add(list: FileList | null) {
    if (!list?.length) return
    setError('')
    const id = documentId ?? await ensureSaved()
    if (!id) { setError('Save the document first, then add receipts.'); return }
    for (const file of Array.from(list)) {
      const contentType = file.type || (/\.heic$/i.test(file.name) ? 'image/heic' : '')
      if (!TYPES.includes(contentType)) { setError(`${file.name}: add a PDF or a photo (JPEG, PNG, HEIC).`); continue }
      setBusy(`Uploading ${file.name}…`)
      const meta = { documentId: id, fileName: file.name, contentType, size: file.size }
      const st = await adminFetch('/api/admin/documents/generated/files', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'start', ...meta }) })
      const sd = await st.json().catch(() => ({}))
      if (!st.ok) { setError(sd.error ?? 'Upload failed'); continue }
      const { error: upErr } = await createClient().storage.from('finance-docs').uploadToSignedUrl(sd.path, sd.token, file, { contentType })
      if (upErr) { setError(`${file.name} didn’t upload — please try again.`); continue }
      const cf = await adminFetch('/api/admin/documents/generated/files', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'confirm', path: sd.path, ...meta }) })
      if (!cf.ok) { const cd = await cf.json().catch(() => ({})); setError(cd.error ?? 'Upload failed') }
    }
    setBusy(''); if (input.current) input.current.value = ''
    load(id)
  }

  async function remove(f: F) {
    if (!window.confirm(`Remove ${f.name}? It won’t be shown to the landlord any more.`)) return
    await adminFetch(`/api/admin/documents/generated/files?id=${f.id}`, { method: 'DELETE' })
    load(documentId)
  }

  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-lg">
      <p className="text-sm font-bold text-neutral-900">Receipts <span className="font-normal text-neutral-400">(optional)</span></p>
      <p className="text-xs text-neutral-500 mt-xs">PDFs or photos that go with it. The email gets a link to them, and they’re kept in the landlord’s account under Your documents, waiting for them if they’re not in the app yet.</p>
      {setup && <p className="mt-sm text-sm text-amber-800">Receipts need migration 254 running in Supabase.</p>}
      {files.length > 0 && (
        <ul className="mt-md divide-y divide-neutral-100 border-y border-neutral-100">
          {files.map(f => (
            <li key={f.id} className="flex items-center justify-between gap-sm py-sm text-sm">
              <span className="min-w-0 truncate">{f.name}{f.size ? <span className="text-neutral-400"> · {Math.max(1, Math.round(f.size / 1024))} KB</span> : null}</span>
              <span className="flex shrink-0 gap-md text-xs font-semibold">
                {f.url && <a href={f.url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">View</a>}
                <button type="button" onClick={() => remove(f)} className="text-red-600 hover:underline">Remove</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <label className="mt-md inline-flex cursor-pointer items-center rounded-lg border border-neutral-300 px-md py-xs text-sm font-semibold text-neutral-800 hover:bg-neutral-50">
        {busy || '+ Add receipts'}
        <input ref={input} type="file" multiple accept="application/pdf,image/*" className="hidden" disabled={!!busy} onChange={e => add(e.target.files)} />
      </label>
      {error && <p className="mt-sm text-sm text-red-700">{error}</p>}
    </div>
  )
}
