'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'

const LARGE_FILE_THRESHOLD = 4 * 1024 * 1024 // 4 MB — Vercel body limit

async function uploadLargeFile(file: File): Promise<string> {
  const presignRes = await fetch('/api/storage/presign-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: file.name, mimeType: file.type }),
  })
  if (!presignRes.ok) throw new Error('Could not prepare upload — please try again')
  const { token, path: storagePath, publicUrl } = await presignRes.json()

  const { createClient } = await import('@/lib/supabase')
  const sbClient = createClient()
  const { error: upErr } = await sbClient.storage
    .from('property-documents')
    .uploadToSignedUrl(storagePath, token, file, { contentType: file.type })
  if (upErr) throw new Error('Upload failed: ' + upErr.message)
  return publicUrl
}

export interface DocUploadDrawerProps {
  title: string          // e.g. "1 St Georges Mews"
  subtitle?: string      // e.g. "Upload a document"
  onClose: () => void
  onUploaded?: (doc: UploadedDoc) => void
  // One of these must be provided:
  propertyId?: string
  tenancyId?: string
  // Pre-selected type (optional)
  defaultType?: string
  // Override full upload logic (for custom save behaviour)
  onSave?: (file: File, type: string, description: string) => Promise<void>
}

export interface UploadedDoc {
  id: string
  file_name: string
  document_type: string
  storage_url: string
  uploaded_at: string
}

const DOC_TYPES = [
  { value: 'tenancy_agreement',        label: 'Tenancy Agreement' },
  { value: 'gas_safety',               label: 'Gas Safety Certificate' },
  { value: 'electrical_cert',          label: 'Electrical Safety (EICR)' },
  { value: 'epc',                      label: 'EPC' },
  { value: 'fire_risk_assessment',     label: 'Fire Risk Assessment' },
  { value: 'inventory',                label: 'Move-in Inventory' },
  { value: 'right_to_rent',            label: 'Right to Rent Check' },
  { value: 'deposit_certificate',      label: 'Deposit Protection Certificate' },
  { value: 'how_to_rent',              label: 'How to Rent Guide' },
  { value: 'reference_report',         label: 'Reference Report' },
  { value: 'id_proof',                 label: 'ID Proof (Passport / Licence)' },
  { value: 'employment_letter',        label: 'Employment / Income Letter' },
  { value: 'floor_plan',               label: 'Floor Plan' },
  { value: 'insurance_policy',         label: 'Insurance Policy' },
  { value: 'hmo_licence',              label: 'HMO Licence' },
  { value: 'management_agreement',     label: 'Management Agreement' },
  { value: 'other',                    label: 'Other' },
]

export default function DocUploadDrawer({
  title,
  subtitle,
  onClose,
  onUploaded,
  propertyId,
  tenancyId,
  defaultType = 'other',
  onSave,
}: DocUploadDrawerProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [docType, setDocType] = useState(defaultType)
  const [description, setDescription] = useState('')
  const [visibleToTenants, setVisibleToTenants] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [aiSuggested, setAiSuggested] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function handleFile(f: File) {
    setFile(f)
    setError(null)
    setAiSuggested(null)
    // Skip AI classification for large files — they'd exceed Vercel's body limit
    if (f.size > LARGE_FILE_THRESHOLD) return
    setProcessing(true)
    try {
      const fd = new FormData()
      fd.append('file', f)
      const res = await fetch('/api/ai/classify-document', { method: 'POST', body: fd })
      if (res.ok) {
        const json = await res.json()
        const result = json.result || {}
        if (result.document_type) {
          // Map AI document_type string to one of our values
          const lower = result.document_type.toLowerCase()
          const match = DOC_TYPES.find(d =>
            lower.includes(d.label.toLowerCase().split(' ')[0]) ||
            lower.includes(d.value.replace(/_/g, ' '))
          )
          if (match) {
            setDocType(match.value)
            setAiSuggested(match.label)
          }
        }
      }
    } catch {
      // AI classification is best-effort, silently ignore errors
    } finally {
      setProcessing(false)
    }
  }

  async function handleSave() {
    if (!file) return
    setSaving(true)
    setError(null)
    try {
      if (onSave) {
        await onSave(file, docType, description)
      } else {
        const fd = new FormData()
        fd.append('file_name', file.name)
        fd.append('document_type', docType)
        if (description) fd.append('description', description)
        fd.append('visible_to_tenants', String(visibleToTenants))
        if (propertyId) fd.append('property_id', propertyId)
        if (tenancyId) fd.append('tenancy_id', tenancyId)

        if (file.size > LARGE_FILE_THRESHOLD) {
          // Upload directly to Supabase to bypass Vercel's 4.5 MB body limit
          const storageUrl = await uploadLargeFile(file)
          fd.append('storage_url', storageUrl)
          fd.append('mime_type', file.type)
        } else {
          fd.append('file', file)
        }

        const res = await fetch('/api/admin/upload-property-document', { method: 'POST', body: fd })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Upload failed')
        onUploaded?.(json.document)
      }
      setSaved(true)
      setTimeout(onClose, 800)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-lg py-md border-b border-neutral-200 shrink-0">
          <div>
            <p className="text-xs text-neutral-400 font-semibold uppercase tracking-widest mb-xs">{title}</p>
            <h2 className="text-lg font-bold text-neutral-900">📎 {subtitle || 'Upload document'}</h2>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-900 text-2xl leading-none mt-xs">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-lg py-lg space-y-lg">

          {/* Drop zone */}
          {!file && (
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              className={`rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-sm py-2xl cursor-pointer transition-colors ${
                dragging ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-300 hover:border-neutral-500 hover:bg-neutral-50'
              }`}
            >
              <span className="text-3xl">📄</span>
              <p className="text-sm font-semibold text-neutral-700">Drop the document here</p>
              <p className="text-xs text-neutral-400">PDF, JPG, PNG or DOCX</p>
              <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
            </div>
          )}

          {/* File selected */}
          {file && (
            <>
              {/* File chip */}
              <div className="flex items-center gap-md rounded-lg border border-neutral-200 bg-neutral-50 px-md py-sm">
                <span className="text-lg">📎</span>
                <p className="text-sm text-neutral-700 font-medium flex-1 truncate">{file.name}</p>
                {processing
                  ? <span className="text-xs text-neutral-400">Reading…</span>
                  : <button onClick={() => { setFile(null); setAiSuggested(null) }} className="text-xs text-neutral-400 hover:text-neutral-700">✕</button>
                }
              </div>

              {/* AI suggestion */}
              {aiSuggested && (
                <div className="rounded-lg border border-green-200 bg-green-50 px-md py-sm">
                  <p className="text-xs font-bold text-green-800">✓ AI identified this as: {aiSuggested}</p>
                  <p className="text-xs text-green-700 mt-xs">Change the type below if it got it wrong</p>
                </div>
              )}

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-md py-sm text-xs text-red-700">{error}</div>
              )}

              {/* Form */}
              <div className="space-y-md">
                <div>
                  <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-sm">Document type</label>
                  <select value={docType} onChange={e => setDocType(e.target.value)}
                    className="w-full rounded-lg border border-neutral-200 px-lg py-md text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900 bg-white">
                    {DOC_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-sm">Description <span className="font-normal normal-case">(optional)</span></label>
                  <input type="text" value={description} onChange={e => setDescription(e.target.value)}
                    placeholder="e.g. Renewal 2025, Signed copy"
                    className="w-full rounded-lg border border-neutral-200 px-lg py-md text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900" />
                </div>
                {propertyId && (
                  <label className="flex items-center gap-md cursor-pointer">
                    <input type="checkbox" checked={visibleToTenants} onChange={e => setVisibleToTenants(e.target.checked)}
                      className="w-4 h-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900" />
                    <span className="text-sm text-neutral-700">Visible to tenants</span>
                  </label>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-lg py-md border-t border-neutral-200 space-y-sm shrink-0">
          {saved ? (
            <div className="rounded-lg bg-green-50 border border-green-200 py-md text-center text-sm font-semibold text-green-700">✓ Uploaded</div>
          ) : (
            <>
              <button
                onClick={handleSave}
                disabled={!file || processing || saving}
                className="w-full rounded-lg bg-neutral-900 py-md text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-40 transition"
              >
                {saving ? 'Uploading…' : 'Save document'}
              </button>
              <p className="text-xs text-neutral-400 text-center">
                Or use <Link href="/admin/ai-upload" className="underline text-neutral-600">AI File Scanner</Link> for batch uploads
              </p>
            </>
          )}
        </div>
      </div>
    </>
  )
}
