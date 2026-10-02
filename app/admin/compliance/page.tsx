'use client'

import { use, useEffect, useState, useRef } from 'react'
import { GenericPageSkeleton } from '@/app/components/SkeletonLoading'
import { useRouter } from 'next/navigation'
import { one, type PageSearchParams } from '@/lib/pageSearchParams'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import Link from 'next/link'
import { sortPropertiesNumerically } from '@/lib/sortProperties'
import { displayName } from '@/lib/people'

type Tab = 'certificates' | 'monthly-checks'
// Older links use the names of the screens these tabs replaced.
const TAB_ALIASES: Record<string, Tab> = { certificates: 'certificates', 'monthly-checks': 'monthly-checks', 'inspection-logs': 'monthly-checks', 'safety-checks': 'monthly-checks', checks: 'monthly-checks' }
const toTab = (t?: string): Tab => TAB_ALIASES[t ?? ''] ?? 'certificates'

type CertKey = 'gas_safe' | 'electrical' | 'epc' | 'fire_risk' | 'fire_detection' | 'emergency_lighting' | 'pat' | 'license'

const CERT_INFO: Record<CertKey, { label: string; icon: string; dateField: string | null; expiryField: string }> = {
  gas_safe:            { label: 'Gas Safety Certificate',  icon: '🔥', dateField: 'gas_safe_cert_date',          expiryField: 'gas_safe_cert_expiry' },
  electrical:          { label: 'EICR',                    icon: '⚡', dateField: 'electrical_cert_date',         expiryField: 'electrical_cert_expiry' },
  epc:                 { label: 'EPC',                     icon: '🏠', dateField: null,                           expiryField: 'epc_expiry' },
  fire_risk:           { label: 'Fire Risk Assessment',    icon: '🔴', dateField: 'fire_risk_assessment_date',    expiryField: 'fire_risk_assessment_expiry' },
  fire_detection:      { label: 'Fire Detection',          icon: '🚨', dateField: 'fire_detection_test_date',     expiryField: 'fire_detection_expiry' },
  emergency_lighting:  { label: 'Emergency Lighting',      icon: '💡', dateField: 'emergency_lighting_test_date', expiryField: 'emergency_lighting_expiry' },
  pat:                 { label: 'PAT Test',                icon: '🔌', dateField: 'pat_test_date',                expiryField: 'pat_test_expiry' },
  license:             { label: 'Licence',                  icon: '📋', dateField: 'license_date',                 expiryField: 'license_expiry' },
}

interface ComplianceLog {
  id: string
  check_type: 'fire_door' | 'smoke_alarm'
  checked_date: string
  checked_by: string
  notes: string | null
  created_at: string
  person?: { name: string; role: string } | null
}

interface Property {
  id: string
  name: string
  address: string
  gas_safe_cert_date?: string
  gas_safe_cert_expiry?: string
  electrical_cert_date?: string
  electrical_cert_expiry?: string
  fire_detection_test_date?: string
  fire_detection_expiry?: string
  emergency_lighting_test_date?: string
  emergency_lighting_expiry?: string
  pat_test_date?: string
  pat_test_expiry?: string
  fire_risk_assessment_date?: string
  fire_risk_assessment_expiry?: string
  epc_expiry?: string
  epc_rating?: string
  license_expiry?: string
  licence_application_submitted_at?: string | null
  licence_application_ref?: string | null
  license_number?: string
  license_date?: string
  property_type?: string
  has_gas?: boolean
}

interface ComplianceStatus {
  status: 'compliant' | 'expiring_soon' | 'expired'
  daysUntilExpiry?: number
}

interface SafetyCheckResponse {
  id: string
  tenancy_id: string
  property_id: string
  room_id: string
  check_type: 'fire_door' | 'smoke_alarm'
  request_sent_at: string
  response_received_at: string | null
  tenant_response: string | null
  issue_type: string | null
  issue_description: string | null
  tenant_name?: string
  property_name?: string
  room_name?: string
}

interface UploadPanel {
  propertyId: string
  propertyName: string
  certKey: CertKey
  currentExpiry?: string
}

interface ExistingDoc {
  storage_url: string
  file_name: string
}

// Maps cert keys to the document_type values used in property_documents table
const CERT_DOC_TYPE: Partial<Record<CertKey, string>> = {
  gas_safe:          'gas_safety_certificate',
  electrical:        'electrical_eicr',
  epc:               'epc',
  fire_risk:         'fire_risk_assessment',
  fire_detection:    'fire_alarm_certificate',
  emergency_lighting:'emergency_lighting_certificate',
  pat:               'pat_test',
  license:           'hmo_licence',
}

// ─── Quick Upload Drawer ─────────────────────────────────────────────────────
// Tell the scan engine what type of cert this is — avoids full classification
const CERT_SCAN_TYPE: Partial<Record<CertKey, string>> = {
  gas_safe: 'gas_safety_certificate',
  electrical: 'electrical_eicr',
  epc: 'epc',
  fire_risk: 'fire_alarm_certificate',
  fire_detection: 'fire_alarm_certificate',
  emergency_lighting: 'emergency_lighting_certificate',
  pat: 'pat_test',
  license: 'hmo_licence',
}

function CertUploadDrawer({
  panel,
  onClose,
  onSaved,
}: {
  panel: UploadPanel
  onClose: () => void
  onSaved: () => void
}) {
  const info = CERT_INFO[panel.certKey]
  const fileRef = useRef<HTMLInputElement>(null)
  // 'view' when there's an existing cert, 'upload' when adding new
  const [mode, setMode] = useState<'view' | 'upload'>(panel.currentExpiry ? 'view' : 'upload')
  const [existingDoc, setExistingDoc] = useState<ExistingDoc | null>(null)
  const [docLoading, setDocLoading] = useState(!!CERT_DOC_TYPE[panel.certKey])
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null)
  const [preUploadedUrl, setPreUploadedUrl] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [aiResult, setAiResult] = useState<any>(null)
  const [form, setForm] = useState({ issueDate: '', expiryDate: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  // re-reading the certificate that's already attached (e.g. it came in through Documents or email, so the dates
  // were never recorded here)
  const [rereadState, setRereadState] = useState<'idle' | 'reading' | 'done'>('idle')
  const [autoReread, setAutoReread] = useState(false)
  useEffect(() => { if (autoReread && existingDoc) { setAutoReread(false); rereadExisting() } }, [autoReread, existingDoc]) // eslint-disable-line react-hooks/exhaustive-deps

  async function rereadExisting() {
    if (!existingDoc) return
    setRereadState('reading'); setError(null)
    try {
      const fd = new FormData()
      fd.append('storage_url', existingDoc.storage_url)
      fd.append('mime_type', isPdf(existingDoc.storage_url) || isPdf(existingDoc.file_name) ? 'application/pdf' : 'image/jpeg')
      fd.append('cert_type', CERT_SCAN_TYPE[panel.certKey] ?? 'other')
      const res = await fetch('/api/ai/scan-cert-dates', { method: 'POST', body: fd })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json) throw new Error(json?.error || 'The certificate couldn’t be read automatically — enter the dates and save.')
      const result = json.result || {}
      setAiResult(result)
      setForm({ issueDate: result.issue_date || result.certified_date || '', expiryDate: result.expiry_date || '' })
    } catch (e: any) {
      setError(e.message)
    } finally {
      setRereadState('done')
    }
  }

  // Look up any stored file for this cert (always, not just when expiry is set)
  useEffect(() => {
    const docType = CERT_DOC_TYPE[panel.certKey]
    if (!docType) { setDocLoading(false); return }
    const supabase = createClient()
    supabase
      .from('property_documents')
      .select('storage_url, file_name')
      .eq('property_id', panel.propertyId)
      .eq('document_type', docType)
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data?.[0]) {
          setExistingDoc(data[0])
          if (!panel.currentExpiry) setAutoReread(true)
          // If a file exists but no expiry was recorded, still show view mode
          if (!panel.currentExpiry) setMode('view')
        }
        setDocLoading(false)
      })
  }, [panel.propertyId, panel.certKey])

  // Create an object URL for preview of newly selected file
  useEffect(() => {
    if (!file) { setFilePreviewUrl(null); return }
    const url = URL.createObjectURL(file)
    setFilePreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  async function handleFile(f: File) {
    setFile(f)
    setPreUploadedUrl(null)
    setError(null)
    setAiResult(null)
    setProcessing(true)
    try {
      const LARGE_FILE_THRESHOLD = 4 * 1024 * 1024 // 4 MB — Vercel body limit

      const scanFd = new FormData()

      scanFd.append('cert_type', CERT_SCAN_TYPE[panel.certKey] ?? 'other')

      if (f.size > LARGE_FILE_THRESHOLD) {
        // Pre-upload directly to Supabase storage to bypass Vercel's body limit
        const presignRes = await fetch('/api/storage/presign-upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: f.name, mimeType: f.type }),
        })
        if (!presignRes.ok) throw new Error('Could not prepare upload — please try again')
        const { signedUrl: _sv, token, path: storagePath, publicUrl } = await presignRes.json()

        const { createClient: createSbClient } = await import('@/lib/supabase')
        const sbClient = createSbClient()
        const { error: upErr } = await sbClient.storage
          .from('property-documents')
          .uploadToSignedUrl(storagePath, token, f, { contentType: f.type })
        if (upErr) throw new Error('Upload failed: ' + upErr.message)

        setPreUploadedUrl(publicUrl)
        scanFd.append('storage_url', publicUrl)
        scanFd.append('mime_type', f.type)
      } else {
        scanFd.append('file', f)
      }

      // Use lightweight cert-date endpoint (haiku, first-page only) — not the full classify
      const res = await fetch('/api/ai/scan-cert-dates', { method: 'POST', body: scanFd })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json) throw new Error(json?.error || 'The certificate couldn’t be read automatically this time — enter the dates below and save; the file is still attached.')
      const result = json.result || {}
      setAiResult(result)
      setForm({
        issueDate: result.issue_date || result.certified_date || '',
        expiryDate: result.expiry_date || '',
      })
    } catch (err: any) {
      setError(err.message)
    } finally {
      setProcessing(false)
    }
  }

  async function handleSave() {
    if (!form.expiryDate) { setError('Expiry date is required'); return }
    setSaving(true)
    setError(null)
    try {
      const supabase = createClient()

      // 1. Update the property record with the cert dates
      const updates: Record<string, string | null> = { [info.expiryField]: form.expiryDate }
      if (info.dateField && form.issueDate) updates[info.dateField] = form.issueDate
      if (panel.certKey === 'epc' && aiResult?.epc_rating) updates['epc_rating'] = aiResult.epc_rating
      if (panel.certKey === 'license' && aiResult?.license_number) updates['license_number'] = aiResult.license_number
      const { error: upErr } = await supabase.from('properties').update(updates).eq('id', panel.propertyId)
      if (upErr) throw new Error(upErr.message)

      // 2. Also store the actual file in property_documents if we have one
      if ((file || preUploadedUrl) && CERT_DOC_TYPE[panel.certKey]) {
        const fd = new FormData()
        if (preUploadedUrl) {
          fd.append('storage_url', preUploadedUrl)
          fd.append('file_name', file?.name || 'Certificate')
        } else {
          fd.append('file', file!)
        }
        fd.append('property_id', panel.propertyId)
        fd.append('document_type', CERT_DOC_TYPE[panel.certKey]!)
        fd.append('description', `${info.label}${form.expiryDate ? ` — expires ${new Date(form.expiryDate).toLocaleDateString('en-GB')}` : ''}`)
        fd.append('visible_to_tenants', 'false')
        const uploadRes = await fetch('/api/admin/upload-property-document', { method: 'POST', body: fd })
        if (!uploadRes.ok) {
          const j = await uploadRes.json().catch(() => ({}))
          throw new Error(j.error || 'File upload failed')
        }
      }

      setSaved(true)
      onSaved()
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

  const isPdf = (url: string) => url.toLowerCase().includes('.pdf') || url.toLowerCase().includes('pdf')

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-lg py-md border-b border-neutral-200 shrink-0">
          <div>
            <p className="text-xs text-neutral-400 font-semibold uppercase tracking-widest mb-xs">{panel.propertyName}</p>
            <h2 className="text-lg font-bold text-neutral-900">{info.icon} {info.label}</h2>
            {panel.currentExpiry ? (
              <p className="text-xs text-neutral-500 mt-xs">
                Expires: {new Date(panel.currentExpiry).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            ) : (
              <p className="text-xs text-amber-600 mt-xs">Expiry date not yet recorded</p>
            )}
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-900 text-2xl leading-none mt-xs">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-lg py-lg space-y-lg">

          {/* ── VIEW MODE ── */}
          {mode === 'view' && (
            <>
              {docLoading ? (
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 flex items-center justify-center py-xl">
                  <div className="w-6 h-6 border-4 border-neutral-200 border-t-neutral-900 rounded-full animate-spin" />
                </div>
              ) : existingDoc ? (
                <>
                  {/* PDF preview */}
                  <div className="rounded-xl overflow-hidden border border-neutral-200 bg-neutral-50">
                    {isPdf(existingDoc.storage_url) ? (
                      <iframe
                        src={existingDoc.storage_url}
                        className="w-full"
                        style={{ height: '420px' }}
                        title={existingDoc.file_name}
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={existingDoc.storage_url} alt={existingDoc.file_name} className="w-full object-contain max-h-96" />
                    )}
                  </div>
                  {/* File name + download */}
                  <div className="flex items-center gap-md rounded-lg border border-neutral-200 bg-neutral-50 px-md py-sm">
                    <span className="text-lg">📎</span>
                    <p className="text-sm text-neutral-700 font-medium flex-1 truncate">{existingDoc.file_name}</p>
                    <a
                      href={existingDoc.storage_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-neutral-600 hover:text-neutral-900 underline shrink-0"
                    >
                      Download
                    </a>
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-lg py-xl text-center">
                  <p className="text-2xl mb-sm">📋</p>
                  <p className="text-sm font-semibold text-neutral-700">Dates recorded, no file stored</p>
                  <p className="text-xs text-neutral-400 mt-xs">The expiry date was entered manually. Upload the actual certificate below.</p>
                </div>
              )}

              {/* Read the dates from the attached certificate and save them */}
              {existingDoc && (
                <div className="rounded-lg border border-neutral-200 bg-white px-md py-md space-y-md">
                  {rereadState === 'idle' && (
                    <button onClick={rereadExisting} className="w-full rounded-lg bg-neutral-900 py-sm text-sm font-semibold text-white hover:bg-neutral-800">
                      ↻ Read dates from this certificate
                    </button>
                  )}
                  {rereadState === 'reading' && (
                    <div className="flex items-center gap-sm text-sm text-neutral-600">
                      <div className="w-4 h-4 border-2 border-neutral-200 border-t-neutral-900 rounded-full animate-spin" /> Reading the attached certificate…
                    </div>
                  )}
                  {rereadState === 'done' && (
                    <>
                      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-md py-sm text-xs text-red-700">{error}</div>}
                      <div className="grid grid-cols-2 gap-md">
                        {info.dateField && (
                          <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Issue / test date
                            <input type="date" value={form.issueDate} onChange={e => setForm(f => ({ ...f, issueDate: e.target.value }))}
                              className="mt-xs w-full rounded-lg border border-neutral-200 px-md py-sm text-sm text-neutral-900 normal-case" />
                          </label>
                        )}
                        <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Expiry / next due
                          <input type="date" value={form.expiryDate} onChange={e => setForm(f => ({ ...f, expiryDate: e.target.value }))}
                            className="mt-xs w-full rounded-lg border border-neutral-200 px-md py-sm text-sm text-neutral-900 normal-case" />
                        </label>
                      </div>
                      {aiResult?.summary && /worked out/.test(aiResult.summary) && <p className="text-xs text-neutral-500">{aiResult.summary}</p>}
                      {panel.currentExpiry && form.expiryDate && form.expiryDate === String(panel.currentExpiry).slice(0, 10) ? (
                        <p className="text-xs text-neutral-500">This certificate matches the dates already recorded. If you have a newer one, upload it below.</p>
                      ) : (
                        <button onClick={handleSave} disabled={saving || !form.expiryDate}
                          className="w-full rounded-lg bg-neutral-900 py-sm text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-40">
                          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save these dates'}
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Replace button */}
              <button
                onClick={() => setMode('upload')}
                className="w-full rounded-lg border-2 border-dashed border-neutral-300 py-md text-sm font-semibold text-neutral-600 hover:border-neutral-500 hover:text-neutral-900 hover:bg-neutral-50 transition"
              >
                ↑ Replace / upload new certificate
              </button>
            </>
          )}

          {/* ── UPLOAD MODE ── */}
          {mode === 'upload' && (
            <>
              {/* Drop zone */}
              {!file && !processing && (
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
                  <p className="text-sm font-semibold text-neutral-700">Drop the certificate here</p>
                  <p className="text-xs text-neutral-400">PDF, JPG or PNG — AI will read the dates</p>
                  <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
                </div>
              )}

              {/* Processing spinner */}
              {processing && (
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 flex flex-col items-center justify-center gap-md py-2xl">
                  <div className="w-8 h-8 border-4 border-neutral-200 border-t-neutral-900 rounded-full animate-spin" />
                  <p className="text-sm text-neutral-600 font-semibold">Reading document…</p>
                  <p className="text-xs text-neutral-400">{file?.name}</p>
                </div>
              )}

              {/* File loaded */}
              {file && !processing && (
                <>
                  {/* Inline preview */}
                  {filePreviewUrl && (
                    <div className="rounded-xl overflow-hidden border border-neutral-200">
                      {isPdf(file.name) ? (
                        <iframe src={filePreviewUrl} className="w-full" style={{ height: '320px' }} title={file.name} />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={filePreviewUrl} alt={file.name} className="w-full object-contain max-h-64" />
                      )}
                    </div>
                  )}

                  {/* File chip */}
                  <div className="flex items-center gap-md rounded-lg border border-neutral-200 bg-neutral-50 px-md py-sm">
                    <span className="text-lg">📎</span>
                    <p className="text-sm text-neutral-700 font-medium flex-1 truncate">{file.name}</p>
                    <button onClick={() => { setFile(null); setPreUploadedUrl(null); setAiResult(null); setForm({ issueDate: '', expiryDate: '' }); setError(null) }}
                      className="text-xs text-neutral-400 hover:text-neutral-700">✕ change</button>
                  </div>

                  {/* AI summary */}
                  {aiResult && (
                    <div className="rounded-lg border border-green-200 bg-green-50 px-md py-sm">
                      <p className="text-xs font-bold text-green-800 mb-xs">✓ AI read this document</p>
                      <p className="text-xs text-green-700">
                        {aiResult.document_type && <span className="font-semibold">{aiResult.document_type}</span>}
                        {aiResult.property_address && <span className="ml-xs">· {aiResult.property_address}</span>}
                      </p>
                    </div>
                  )}

                  {error && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-md py-sm text-xs text-red-700">{error}</div>
                  )}

                  {/* Editable dates */}
                  <div className="space-y-md">
                    {info.dateField && (
                      <div>
                        <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-sm">Issue / Test date</label>
                        <input type="date" value={form.issueDate} onChange={e => setForm(f => ({ ...f, issueDate: e.target.value }))}
                          className="w-full rounded-lg border border-neutral-200 px-lg py-md text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900" />
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-sm">Expiry date *</label>
                      <input type="date" value={form.expiryDate} onChange={e => setForm(f => ({ ...f, expiryDate: e.target.value }))}
                        className="w-full rounded-lg border border-neutral-200 px-lg py-md text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900" />
                      <p className="text-xs text-neutral-400 mt-xs">{aiResult?.summary && /worked out/.test(aiResult.summary) ? aiResult.summary : 'Edit if the AI got it wrong'}</p>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-lg py-md border-t border-neutral-200 space-y-sm shrink-0">
          {mode === 'view' ? (
            <p className="text-xs text-neutral-400 text-center">
              Or <Link href="/admin/ai-upload" className="underline text-neutral-600">go to AI File Scanner</Link> to batch-upload
            </p>
          ) : saved ? (
            <div className="rounded-lg bg-green-50 border border-green-200 py-md text-center text-sm font-semibold text-green-700">✓ Saved</div>
          ) : (
            <>
              <button
                onClick={handleSave}
                disabled={!file || processing || saving || !form.expiryDate}
                className="w-full rounded-lg bg-neutral-900 py-md text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-40 transition"
              >
                {saving ? 'Saving…' : 'Save to property record'}
              </button>
              {panel.currentExpiry && (
                <button onClick={() => setMode('view')} className="w-full text-xs text-neutral-400 hover:text-neutral-700 py-xs">
                  ← Back to current certificate
                </button>
              )}
              <p className="text-xs text-neutral-400 text-center">
                Or <Link href="/admin/ai-upload" className="underline text-neutral-600">go to AI File Scanner</Link> to batch-upload
              </p>
            </>
          )}
        </div>
      </div>
    </>
  )
}

// ─── Certificates Table ──────────────────────────────────────────────────────
function CertificatesTab({
  properties,
  checkStatus,
  onCellClick,
}: {
  properties: Property[]
  checkStatus: (d?: string) => ComplianceStatus
  onCellClick: (propertyId: string, propertyName: string, certKey: CertKey, currentExpiry?: string) => void
}) {
  // Every cell is judged on its EXPIRY. Where only the date a test was done is recorded, the expiry is that
  // date plus the usual interval — before this, a PAT test done last month showed as "expired".
  const INTERVAL_MONTHS: Record<CertKey, number> = { gas_safe: 12, electrical: 60, epc: 120, fire_risk: 12, fire_detection: 12, emergency_lighting: 12, pat: 12, license: 60 }
  const effectiveExpiry = (key: CertKey, expiry?: string, done?: string): { due: string; derived: boolean } | null => {
    if (expiry) return { due: expiry, derived: false }
    if (!done) return null
    const d = new Date(done + 'T12:00:00'); d.setMonth(d.getMonth() + INTERVAL_MONTHS[key])
    return { due: d.toISOString().slice(0, 10), derived: true }
  }
  // [key, expiry, done date, applies?] for each column of a property
  const cellsFor = (p: Property): [CertKey, string | undefined, string | undefined, boolean][] => {
    const hmo = p.property_type !== 'single_let'
    return [
      ['gas_safe', p.gas_safe_cert_expiry, p.gas_safe_cert_date, p.has_gas !== false],
      ['electrical', p.electrical_cert_expiry, p.electrical_cert_date, true],
      ['epc', p.epc_expiry, undefined, true],
      ['fire_risk', p.fire_risk_assessment_expiry, p.fire_risk_assessment_date, hmo],
      ['fire_detection', p.fire_detection_expiry, p.fire_detection_test_date, hmo],
      ['emergency_lighting', p.emergency_lighting_expiry, p.emergency_lighting_test_date, hmo],
      ['pat', p.pat_test_expiry, p.pat_test_date, hmo],
      ['license', p.license_expiry, p.license_date, true],
    ]
  }
  let missing = 0, expired = 0, expiringSoon = 0
  for (const p of properties) for (const [key, exp, done, applies] of cellsFor(p)) {
    if (!applies) continue
    if (key === 'license' && p.licence_application_submitted_at) continue   // application with the council
    const e = effectiveExpiry(key, exp, done)
    if (!e) { missing++; continue }
    const st = checkStatus(e.due).status
    if (st === 'expired') expired++; else if (st === 'expiring_soon') expiringSoon++
  }

  function CertCell({ expiry, date, certKey, propertyId, propertyName, hmoOnly, isHmo, naOverride, appliedOn }: {
    expiry?: string; date?: string; certKey: CertKey; propertyId: string; propertyName: string; hmoOnly?: boolean; isHmo?: boolean; naOverride?: boolean; appliedOn?: string | null
  }) {
    if (naOverride || (hmoOnly && !isHmo)) return <span className="text-xs text-neutral-300">n/a</span>
    if (appliedOn) {
      const d = new Date(appliedOn + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
      return (
        <a href={`/admin/properties/${propertyId}?tab=compliance`} title={`Licence application made ${d} — waiting for the council`}
          className="inline-flex flex-col items-center rounded px-sm py-[3px] text-xs font-medium min-w-[5rem] text-center leading-tight bg-blue-50 text-blue-800 hover:bg-blue-100">
          <span className="text-[9px] font-bold uppercase tracking-wide opacity-70">Applied</span><span>{d}</span>
        </a>
      )
    }
    const e = effectiveExpiry(certKey, expiry, date)
    const st = e ? checkStatus(e.due).status : null
    const short = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
    const cls = !e
      ? 'border border-dashed border-neutral-300 bg-white text-neutral-400 hover:border-neutral-500 hover:text-neutral-700'
      : st === 'compliant' ? 'bg-green-50 text-green-800 hover:bg-green-100'
      : st === 'expiring_soon' ? 'bg-amber-100 text-amber-900 hover:bg-amber-200'
      : 'bg-red-600 text-white hover:bg-red-700'
    const title = !e ? `Add the ${CERT_INFO[certKey].label}` : `${CERT_INFO[certKey].label}: ${st === 'expired' ? 'expired' : 'due'} ${short(e.due)}${e.derived && date ? ` (done ${short(date)}; due date worked out from the usual interval)` : ''} — click to upload a new one`

    return (
      <button
        onClick={() => onCellClick(propertyId, propertyName, certKey, expiry)}
        title={title}
        className={`inline-flex flex-col items-center rounded px-sm py-[3px] text-xs font-medium min-w-[5rem] text-center leading-tight transition cursor-pointer ${cls}`}
      >
        {e ? (
          <>
            <span className={`text-[9px] font-bold uppercase tracking-wide ${st === 'expired' ? 'text-white/80' : 'opacity-70'}`}>{st === 'expired' ? 'Expired' : 'Due'}</span>
            <span>{short(e.due)}</span>
          </>
        ) : <span className="py-[5px]">Add</span>}
      </button>
    )
  }

  return (
    <div>
      <div className="mb-lg flex flex-wrap gap-lg rounded-2xl border border-neutral-200 bg-white px-lg py-md items-center">
        <div className="text-center"><p className="text-xl font-semibold text-neutral-900">{properties.length}</p><p className="text-xs text-neutral-500">Properties</p></div>
        <div className="w-px bg-neutral-100 self-stretch" />
        <div className="text-center"><p className={`text-xl font-semibold ${missing > 0 ? 'text-red-700' : 'text-green-700'}`}>{missing}</p><p className="text-xs text-neutral-500">Not uploaded</p></div>
        <div className="w-px bg-neutral-100 self-stretch" />
        <div className="text-center"><p className={`text-xl font-semibold ${expired > 0 ? 'text-red-700' : 'text-green-700'}`}>{expired}</p><p className="text-xs text-neutral-500">Expired</p></div>
        <div className="w-px bg-neutral-100 self-stretch" />
        <div className="text-center"><p className={`text-xl font-semibold ${expiringSoon > 0 ? 'text-amber-700' : 'text-green-700'}`}>{expiringSoon}</p><p className="text-xs text-neutral-500">Expiring soon</p></div>
        <div className="ml-auto flex flex-wrap items-center gap-md text-xs text-neutral-500">
          <span className="flex items-center gap-xs"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-green-100" />In date</span>
          <span className="flex items-center gap-xs"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-200" />Due within 30 days</span>
          <span className="flex items-center gap-xs"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-red-600" />Expired</span>
          <span className="flex items-center gap-xs"><i className="inline-block h-2.5 w-2.5 rounded-sm border border-dashed border-neutral-400" />Not uploaded</span>
          <span className="text-neutral-400">· click a cell to upload</span>
        </div>
      </div>
      <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50">
                <th className="sticky left-0 bg-neutral-50 px-md py-sm text-left text-xs font-semibold text-neutral-500 min-w-[180px]">Property</th>
                <th className="px-sm py-sm text-center text-xs font-semibold text-neutral-500 whitespace-nowrap">Gas safety</th>
                <th className="px-sm py-sm text-center text-xs font-semibold text-neutral-500 whitespace-nowrap">EICR</th>
                <th className="px-sm py-sm text-center text-xs font-semibold text-neutral-500 whitespace-nowrap">EPC</th>
                <th className="px-sm py-sm text-center text-xs font-semibold text-neutral-500 whitespace-nowrap">Fire risk</th>
                <th className="px-sm py-sm text-center text-xs font-semibold text-neutral-500 whitespace-nowrap">Fire detection</th>
                <th className="px-sm py-sm text-center text-xs font-semibold text-neutral-500 whitespace-nowrap">Em. lighting</th>
                <th className="px-sm py-sm text-center text-xs font-semibold text-neutral-500 whitespace-nowrap">PAT</th>
                <th className="px-sm py-sm text-center text-xs font-semibold text-neutral-500 whitespace-nowrap">Licence</th>
              </tr>
            </thead>
            <tbody>
              {properties.map((prop, i) => {
                const hmo = prop.property_type !== 'single_let'
                return (
                  <tr key={prop.id} className={`border-b border-neutral-100 ${i === properties.length - 1 ? 'border-b-0' : ''}`}>
                    <td className="sticky left-0 bg-white px-md py-sm">
                      <Link href={`/admin/properties/${prop.id}`} className="block no-underline">
                        <p className="font-medium text-neutral-900 text-sm leading-tight">{prop.name}</p>
                        <p className="text-xs text-neutral-400 mt-xs">{prop.address?.split(',').slice(-2).join(',').trim()}</p>
                      </Link>
                    </td>
                    <td className="px-sm py-sm text-center"><CertCell certKey="gas_safe" propertyId={prop.id} propertyName={prop.name} expiry={prop.gas_safe_cert_expiry} date={prop.gas_safe_cert_date} naOverride={prop.has_gas === false} /></td>
                    <td className="px-sm py-sm text-center"><CertCell certKey="electrical" propertyId={prop.id} propertyName={prop.name} expiry={prop.electrical_cert_expiry} date={prop.electrical_cert_date} /></td>
                    <td className="px-sm py-sm text-center"><CertCell certKey="epc" propertyId={prop.id} propertyName={prop.name} expiry={prop.epc_expiry} /></td>
                    <td className="px-sm py-sm text-center"><CertCell certKey="fire_risk" propertyId={prop.id} propertyName={prop.name} expiry={prop.fire_risk_assessment_expiry} date={prop.fire_risk_assessment_date} hmoOnly isHmo={hmo} /></td>
                    <td className="px-sm py-sm text-center"><CertCell certKey="fire_detection" propertyId={prop.id} propertyName={prop.name} expiry={prop.fire_detection_expiry} date={prop.fire_detection_test_date} hmoOnly isHmo={hmo} /></td>
                    <td className="px-sm py-sm text-center"><CertCell certKey="emergency_lighting" propertyId={prop.id} propertyName={prop.name} expiry={prop.emergency_lighting_expiry} date={prop.emergency_lighting_test_date} hmoOnly isHmo={hmo} /></td>
                    <td className="px-sm py-sm text-center"><CertCell certKey="pat" propertyId={prop.id} propertyName={prop.name} expiry={prop.pat_test_expiry} date={prop.pat_test_date} hmoOnly isHmo={hmo} /></td>
                    <td className="px-sm py-sm text-center"><CertCell certKey="license" propertyId={prop.id} propertyName={prop.name} expiry={prop.license_expiry} date={prop.license_date} appliedOn={prop.licence_application_submitted_at} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────
function CompliancePageInner({ tab }: { tab?: string }) {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>(toTab(tab))
  // The side menu links to ?tab=…; follow it when it changes without leaving the page.
  useEffect(() => { if (tab) setActiveTab(toTab(tab)) }, [tab])
  const [checksTypeFilter, setChecksTypeFilter] = useState<'all' | 'fire_door' | 'smoke_alarm'>('all')
  const [checksPropertyFilter, setChecksPropertyFilter] = useState<string>('all')
  const [properties, setProperties] = useState<Property[]>([])
  const [checks, setChecks] = useState<SafetyCheckResponse[]>([])
  const [logSelectedProperty, setLogSelectedProperty] = useState<string | null>(null)
  const [logs, setLogs] = useState<ComplianceLog[]>([])
  const [logTab, setLogTab] = useState<'fire_door' | 'smoke_alarm'>('fire_door')
  const [showLogModal, setShowLogModal] = useState(false)
  const [logSaving, setLogSaving] = useState(false)
  const [logError, setLogError] = useState<string | null>(null)
  const [logSuccess, setLogSuccess] = useState<string | null>(null)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [logForm, setLogForm] = useState({ checked_date: new Date().toISOString().split('T')[0], notes: '' })

  // Quick upload drawer
  const [uploadPanel, setUploadPanel] = useState<UploadPanel | null>(null)

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      if (!data || (data.assignment?.role !== 'administrator' && data.assignment?.role !== 'admin')) {
        router.push('/login')
        return
      }
      setCurrentUser(data)
      await loadProperties()

      const { data: checksData } = await supabase
        .from('tenant_self_checks')
        .select('*, properties (name), rooms (name), tenancies (people!person_id (full_name, first_name, last_name))')
        .order('request_sent_at', { ascending: false })

      // Self-checks link to the tenant through their tenancy
      const transformed = (checksData || []).map((c: any) => ({ ...c, people: c.tenancies?.people ?? null })).map((check: any) => ({
        id: check.id,
        tenancy_id: check.tenancy_id,
        property_id: check.property_id,
        room_id: check.room_id,
        check_type: check.check_type,
        request_sent_at: check.request_sent_at,
        response_received_at: check.response_received_at,
        tenant_response: check.tenant_response,
        issue_type: check.issue_type,
        issue_description: check.issue_description,
        property_name: check.properties?.name,
        room_name: check.rooms?.name,
        tenant_name: check.people?.name,
      }))
      setChecks(transformed)
      setLoading(false)
    }
    init()
  }, [router])

  useEffect(() => { loadAllLogs() }, [])

  async function loadProperties() {
    const { data } = await supabase.from('properties').select('*').order('name')
    const sorted = sortPropertiesNumerically(data || [])
    setProperties(sorted)
    if (sorted.length > 0 && !logSelectedProperty) {
      setLogSelectedProperty(sorted[0].id)
    }
  }

  async function handleAddLog() {
    if (!logSelectedProperty || !logForm.checked_date) { setLogError('Property and date are required'); return }
    setLogSaving(true)
    setLogError(null)
    try {
      const { data: authData } = await supabase.auth.getUser()
      if (!authData?.user?.email) throw new Error('Not signed in')
      const { data: personRow } = await supabase.from('people').select('id, first_name, last_name, full_name').eq('email', authData.user.email).single()
      if (!personRow?.id) throw new Error('Your user account was not found')
      const checkedByName = [personRow.first_name, personRow.last_name].filter(Boolean).join(' ') || (personRow as any).full_name || authData.user.email

      const { error: insertError } = await supabase.from('compliance_logs').insert({
        property_id: logSelectedProperty,
        check_type: logTab,
        checked_by: personRow.id,
        checked_by_role: (currentUser?.assignment as any)?.role || 'admin',
        checked_date: logForm.checked_date,
        notes: logForm.notes || null,
      })
      if (insertError) throw new Error(insertError.message)
      setLogSuccess(`✓ ${logTab === 'fire_door' ? 'Fire door' : 'Smoke alarm'} check recorded`)
      setLogForm({ checked_date: new Date().toISOString().split('T')[0], notes: '' })
      setShowLogModal(false)
      await loadAllLogs()
      setTimeout(() => setLogSuccess(null), 3000)
    } catch (err) {
      setLogError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setLogSaving(false)
    }
  }

  async function loadAllLogs() {
    const { data } = await supabase
      .from('compliance_logs')
      .select('*, person:checked_by(full_name, first_name, last_name, role)')
      .order('checked_date', { ascending: false })
    setLogs(data || [])
  }

  const checkStatus = (expiryDate?: string): ComplianceStatus => {
    if (!expiryDate) return { status: 'expired' }
    const today = new Date()
    const expiry = new Date(expiryDate)
    const daysUntil = Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (daysUntil < 0) return { status: 'expired' }
    if (daysUntil < 30) return { status: 'expiring_soon', daysUntilExpiry: daysUntil }
    return { status: 'compliant' }
  }

  const issuesCount = checks.filter((c) => c.tenant_response === 'issue_reported').length

  if (loading) return <GenericPageSkeleton />

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin" />} />

      <main className="mx-auto max-w-6xl px-lg py-xl">
        <div className="mb-2xl">
          <h1 className="text-2xl font-bold text-neutral-900">🛡️ Compliance</h1>
          <p className="mt-sm text-sm text-neutral-600 mb-lg">
            Certificates, safety checks, and compliance dashboard across all properties
          </p>

          <div className="flex gap-sm border-b border-neutral-300">
            <button
              onClick={() => setActiveTab('certificates')}
              className={`px-lg py-md font-semibold transition ${activeTab === 'certificates' ? 'border-b-2 border-neutral-900 text-neutral-900' : 'text-neutral-500 hover:text-neutral-700'}`}
            >
              📋 Property Certificates
            </button>
            <button
              onClick={() => setActiveTab('monthly-checks')}
              className={`px-lg py-md font-semibold transition relative ${activeTab === 'monthly-checks' ? 'border-b-2 border-neutral-900 text-neutral-900' : 'text-neutral-500 hover:text-neutral-700'}`}
            >
              🔔 Monthly Checks
              {issuesCount > 0 && (
                <span className="ml-sm inline-block rounded-full bg-red-600 text-white px-sm py-0 text-xs font-bold">{issuesCount}</span>
              )}
            </button>
          </div>
        </div>

        {/* PROPERTY CERTIFICATES TAB */}
        {activeTab === 'certificates' && (
          <CertificatesTab
            properties={properties}
            checkStatus={checkStatus}
            onCellClick={(propertyId, propertyName, certKey, currentExpiry) =>
              setUploadPanel({ propertyId, propertyName, certKey, currentExpiry })
            }
          />
        )}

        {/* MONTHLY CHECKS TAB */}
        {activeTab === 'monthly-checks' && (
          <div className="space-y-lg">
            {logError && <div className="rounded-lg bg-red-50 border border-red-200 p-md text-sm text-red-800">{logError}</div>}
            {logSuccess && <div className="rounded-lg bg-green-50 border border-green-200 p-md text-sm text-green-800">{logSuccess}</div>}

            <div className="flex flex-wrap items-center gap-sm justify-between">
              <div className="flex flex-wrap gap-sm">
                <select value={checksPropertyFilter} onChange={(e) => setChecksPropertyFilter(e.target.value)}
                  className="rounded-lg border border-neutral-300 px-md py-sm text-sm text-neutral-900 bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900">
                  <option value="all">All properties</option>
                  {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                {(['all', 'fire_door', 'smoke_alarm'] as const).map((t) => (
                  <button key={t} onClick={() => setChecksTypeFilter(t)}
                    className={`px-md py-sm text-sm font-semibold rounded-lg transition ${checksTypeFilter === t ? 'bg-neutral-900 text-white' : 'bg-white border border-neutral-300 text-neutral-700'}`}>
                    {t === 'all' ? 'All types' : t === 'fire_door' ? '🚪 Fire Door' : '🔔 Smoke Alarm'}
                  </button>
                ))}
              </div>
              <button onClick={() => { setLogSelectedProperty(properties[0]?.id || null); setShowLogModal(true) }}
                className="px-lg py-sm bg-neutral-900 text-white rounded-lg font-semibold text-sm hover:bg-neutral-800 transition whitespace-nowrap">
                + Log check
              </button>
            </div>

            {(() => {
              const tenantIssues = checks.filter(c =>
                c.tenant_response === 'issue_reported' &&
                (checksPropertyFilter === 'all' || c.property_id === checksPropertyFilter) &&
                (checksTypeFilter === 'all' || c.check_type === checksTypeFilter)
              )
              if (tenantIssues.length === 0) return null
              return (
                <div className="rounded-xl border-2 border-red-200 bg-red-50 p-lg">
                  <p className="text-sm font-bold text-red-800 mb-md">⚠️ Tenant-reported issues ({tenantIssues.length})</p>
                  <div className="space-y-sm">
                    {tenantIssues.map(c => (
                      <div key={c.id} className="bg-white rounded-lg border border-red-200 p-md">
                        <p className="text-sm font-semibold text-neutral-900">{c.property_name} · {c.room_name}</p>
                        <p className="text-xs text-neutral-600 mt-xs">{c.check_type === 'fire_door' ? '🚪 Fire Door' : '🔔 Smoke Alarm'} · reported by {c.tenant_name}</p>
                        {c.issue_description && <p className="text-xs text-red-700 mt-xs font-semibold">{c.issue_description}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}

            {(() => {
              const filtered = logs.filter(l =>
                (checksPropertyFilter === 'all' || l.property_id === checksPropertyFilter) &&
                (checksTypeFilter === 'all' || l.check_type === checksTypeFilter)
              )
              const propById = Object.fromEntries(properties.map(p => [p.id, p.name]))
              if (filtered.length === 0) return (
                <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-xl text-center">
                  <p className="text-sm text-neutral-500">No checks recorded yet</p>
                </div>
              )
              return (
                <div className="rounded-lg border border-neutral-200 divide-y divide-neutral-100 bg-white overflow-hidden">
                  {filtered.map((log: any) => (
                    <div key={log.id} className="px-lg py-md flex items-start gap-lg">
                      <div className="shrink-0 mt-xs">
                        <span className={`inline-block w-2 h-2 rounded-full ${log.check_type === 'fire_door' ? 'bg-orange-400' : 'bg-blue-400'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-md flex-wrap">
                          <p className="text-sm font-semibold text-neutral-900">{log.check_type === 'fire_door' ? '🚪 Fire Door' : '🔔 Smoke Alarm'}</p>
                          <p className="text-xs text-neutral-500">{propById[log.property_id] || 'Unknown property'}</p>
                        </div>
                        <p className="text-xs text-neutral-500 mt-xs">
                          {new Date(log.checked_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                          {' · '}{displayName(log.person) || (log as any).checked_by_name || 'Unknown'}
                          {log.person?.role && <span className="ml-xs text-neutral-400">({log.person.role})</span>}
                        </p>
                        {log.notes && <p className="text-xs text-neutral-600 mt-xs italic">"{log.notes}"</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })()}

            {showLogModal && (
              <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-lg">
                <div className="w-full max-w-lg rounded-2xl bg-white p-lg shadow-xl">
                  <div className="flex items-center justify-between mb-lg">
                    <h2 className="text-xl font-bold text-neutral-900">Log Check</h2>
                    <button onClick={() => setShowLogModal(false)} disabled={logSaving} className="text-neutral-400 hover:text-neutral-900 text-2xl leading-none">×</button>
                  </div>
                  <div className="space-y-lg mb-lg">
                    <div>
                      <label className="block text-sm font-bold text-neutral-700 mb-sm">Property</label>
                      <select value={logSelectedProperty || ''} onChange={(e) => setLogSelectedProperty(e.target.value)}
                        className="w-full rounded-lg border border-neutral-300 px-lg py-md text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900">
                        {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-neutral-700 mb-sm">Check type</label>
                      <div className="flex gap-sm">
                        {(['fire_door', 'smoke_alarm'] as const).map(t => (
                          <button key={t} type="button" onClick={() => setLogTab(t)}
                            className={`flex-1 py-sm rounded-lg text-sm font-semibold transition ${logTab === t ? 'bg-neutral-900 text-white' : 'border border-neutral-300 text-neutral-700'}`}>
                            {t === 'fire_door' ? '🚪 Fire Door' : '🔔 Smoke Alarm'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-neutral-700 mb-sm">Date</label>
                      <input type="date" value={logForm.checked_date} onChange={(e) => setLogForm({ ...logForm, checked_date: e.target.value })}
                        className="w-full rounded-lg border border-neutral-300 px-lg py-md text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900" />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-neutral-700 mb-sm">Notes (optional)</label>
                      <textarea value={logForm.notes} onChange={(e) => setLogForm({ ...logForm, notes: e.target.value })}
                        placeholder={logTab === 'fire_door' ? 'e.g. Door closing smoothly, latch secure' : 'e.g. Battery level good, sensor responsive'}
                        rows={3} className="w-full rounded-lg border border-neutral-300 px-lg py-md text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900" />
                    </div>
                  </div>
                  <div className="flex gap-md">
                    <button onClick={() => setShowLogModal(false)} disabled={logSaving} className="flex-1 rounded-lg border border-neutral-300 px-lg py-md text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50">Cancel</button>
                    <button onClick={handleAddLog} disabled={logSaving} className="flex-1 rounded-lg bg-neutral-900 px-lg py-md text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-50">{logSaving ? 'Saving…' : 'Save check'}</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Quick upload drawer */}
      {uploadPanel && (
        <CertUploadDrawer
          panel={uploadPanel}
          onClose={() => setUploadPanel(null)}
          onSaved={loadProperties}
        />
      )}
    </div>
  )
}

export default function CompliancePage({ searchParams }: { searchParams: PageSearchParams }) {
  return <CompliancePageInner tab={one(use(searchParams).tab)} />
}
