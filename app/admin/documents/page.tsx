'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import DocReview, { AIResult, TYPE_LABELS } from '@/app/components/DocReview'

const BLANK: AIResult = {
  doc_type: 'other', confidence: 0, summary: '', issue_date: '', expiry_date: '', provider: '',
  policy_number: '', property_address: '', person_name: '', person_phone: '', person_email: '',
  occupation: '', annual_income: '', previous_address: '', tenancy_start: '', tenancy_end: '', monthly_rent: '',
}

type Tab = 'upload' | 'inbox' | 'pending'

interface DocumentPending {
  id: string
  document_type: string
  confidence: number
  summary: string
  status: string
  property_id: string | null
  property_address_extracted: string
  extracted_data: any
  created_at: string
}

export default function DocumentsPage() {
  const router = useRouter()
  const supabase = createClient()

  // Shared state
  const [loading, setLoading] = useState(true)
  const [properties, setProperties] = useState<any[]>([])
  const [people, setPeople] = useState<any[]>([])
  const [tenancies, setTenancies] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState<Tab>('upload')

  // Upload tab state
  const [busy, setBusy] = useState(false)
  const [busyLabel, setBusyLabel] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [uploadResults, setUploadResults] = useState<Array<{ result: AIResult; file: File }>>([])
  const [uploadApplied, setUploadApplied] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Inbox tab state
  const [inboxDocs, setInboxDocs] = useState<any[]>([])
  const [inboxOpenId, setInboxOpenId] = useState<string | null>(null)
  const [inboxFlash, setInboxFlash] = useState('')

  // Pending tab state
  const [pendingDocs, setPendingDocs] = useState<DocumentPending[]>([])
  const [pendingSelected, setPendingSelected] = useState<DocumentPending | null>(null)
  const [pendingPropertyId, setPendingPropertyId] = useState<string | null>(null)
  const [pendingFiling, setPendingFiling] = useState(false)

  // Initialize data
  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      if (!data || (data.assignment?.role !== 'administrator' && data.assignment?.role !== 'admin')) {
        router.push('/login')
        return
      }
      const { data: props } = await supabase.from('properties').select('id, name, address').order('name')
      const { data: ppl } = await supabase.from('people').select('id, full_name, email').eq('role', 'tenant').order('full_name')
      const { data: tens } = await supabase
        .from('tenancies')
        .select('id, start_date, end_date, people(full_name), rooms(id, name, property_id, properties(id, name))')
        .order('start_date', { ascending: false })
      setProperties(props || [])
      setPeople(ppl || [])
      setTenancies((tens as any) || [])

      // Load inbox and pending docs
      await loadInboxDocs()
      await loadPendingDocs()

      setLoading(false)
    }
    init()
  }, [router])

  // ==========================================================================
  // UPLOAD TAB
  // ==========================================================================

  const DIRECT_UPLOAD_LIMIT = 4 * 1024 * 1024 // 4 MB

  async function presignAndUpload(file: File): Promise<string> {
    const presignRes = await fetch('/api/storage/presign-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: file.name, mimeType: file.type || 'application/pdf' }),
    })
    if (!presignRes.ok) {
      const err = await presignRes.json().catch(() => ({}))
      throw new Error(`Presign failed: ${err.error || presignRes.status}`)
    }
    const { token, path, publicUrl } = await presignRes.json()

    const { error: upErr } = await supabase.storage
      .from('property-documents')
      .uploadToSignedUrl(path, token, file, { contentType: file.type || 'application/pdf' })

    if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`)
    return publicUrl
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setBusy(true)
    setBusyLabel(`Scanning ${files.length} file${files.length > 1 ? 's' : ''}…`)
    setUploadError('')
    setUploadResults([])
    setUploadApplied('')

    const analyzed: AIResult[] = []
    const errors: string[] = []

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        setBusyLabel(`Reading ${i + 1} of ${files.length}: ${file.name}`)
        try {
          const body = new FormData()

          if (file.size > DIRECT_UPLOAD_LIMIT) {
            setBusyLabel(`${file.name} is large — uploading to storage (${(file.size / 1024 / 1024).toFixed(1)} MB)…`)
            const signedUrl = await presignAndUpload(file)
            body.append('storage_url', signedUrl)
            body.append('mime_type', file.type || 'application/pdf')
          } else {
            body.append('file', file)
          }

          const res = await fetch('/api/ai/classify-document', { method: 'POST', body })
          let json: any
          try {
            json = await res.json()
          } catch {
            throw new Error(
              res.status === 413
                ? 'File is too large even for storage upload — please compress the PDF and try again'
                : `Server returned ${res.status} (no details)`
            )
          }
          if (!res.ok) {
            errors.push(`${file.name}: ${json.error || 'Failed to read'}`)
          } else {
            analyzed.push({ result: json.result as AIResult, file })
          }
        } catch (err) {
          errors.push(`${file.name}: ${err instanceof Error ? err.message : 'Error'}`)
        }
      }

      if (analyzed.length === 0 && errors.length > 0) {
        setUploadError(errors.join('\n'))
      } else {
        setUploadResults(analyzed)
        if (errors.length > 0) {
          setUploadError(`✅ Scanned ${analyzed.length} file(s)\n\n⚠️ Issues:\n${errors.join('\n')}`)
        }
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  // ==========================================================================
  // INBOX TAB
  // ==========================================================================

  async function loadInboxDocs() {
    const { data } = await supabase
      .from('inbox_documents')
      .select('*')
      .eq('status', 'new')
      .order('created_at', { ascending: false })
    setInboxDocs(data || [])
  }

  function fileUrl(path: string) {
    return supabase.storage.from('inbox-docs').getPublicUrl(path).data.publicUrl
  }

  async function markInboxFiled(id: string, msg: string) {
    await supabase.from('inbox_documents').update({ status: 'filed' }).eq('id', id)
    setInboxOpenId(null)
    setInboxFlash('✅ ' + msg)
    await loadInboxDocs()
  }

  async function dismissInboxDoc(id: string) {
    if (!confirm('Dismiss this document from the inbox?')) return
    await supabase.from('inbox_documents').update({ status: 'dismissed' }).eq('id', id)
    setInboxOpenId(null)
    await loadInboxDocs()
  }

  // ==========================================================================
  // PENDING TAB
  // ==========================================================================

  async function loadPendingDocs() {
    const { data: docsData } = await supabase
      .from('documents_pending')
      .select('*')
      .eq('status', 'pending_review')
      .order('created_at', { ascending: false })
    setPendingDocs(docsData || [])
  }

  async function handlePendingFile(doc: DocumentPending) {
    if (!pendingPropertyId) {
      alert('Please select a property')
      return
    }

    setPendingFiling(true)
    try {
      const { error } = await supabase
        .from('documents_pending')
        .update({ property_id: pendingPropertyId, status: 'property_matched' })
        .eq('id', doc.id)

      if (error) throw error

      await supabase
        .from('documents_pending')
        .update({ status: 'filed', filed_at: new Date().toISOString() })
        .eq('id', doc.id)

      alert('✅ Document filed!')
      setPendingSelected(null)
      setPendingPropertyId(null)
      await loadPendingDocs()
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setPendingFiling(false)
    }
  }

  // Badge count
  const badgeCount = (inboxDocs?.length || 0) + (pendingDocs?.length || 0)

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar />
        <p className="p-xl text-sm text-neutral-400">Loading…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar right={<Link href="/admin" className="min-w-0 truncate font-semibold text-white hover:text-white/80">Dashboard</Link>} />

      <main className="mx-auto max-w-6xl px-lg py-2xl">
        <div className="mb-2xl">
          <div className="flex items-center justify-between mb-lg">
            <div>
              <h1 className="text-3xl font-bold text-neutral-900">📁 Documents</h1>
              <p className="mt-sm text-sm text-neutral-600">
                Upload, manage, and file documents — certificates, contracts, tenancy agreements, and more
              </p>
            </div>
            {badgeCount > 0 && (
              <div className="rounded-full bg-red-600 text-white px-md py-sm text-sm font-bold">
                {badgeCount} pending
              </div>
            )}
          </div>

          {/* Tab buttons */}
          <div className="flex gap-sm border-b border-neutral-300">
            <button
              onClick={() => setActiveTab('upload')}
              className={`px-lg py-md font-semibold transition ${
                activeTab === 'upload'
                  ? 'border-b-2 border-neutral-900 text-neutral-900'
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              ⬆ Upload
            </button>
            <button
              onClick={() => setActiveTab('inbox')}
              className={`px-lg py-md font-semibold transition relative ${
                activeTab === 'inbox'
                  ? 'border-b-2 border-neutral-900 text-neutral-900'
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              📥 Inbox
              {(inboxDocs?.length || 0) > 0 && (
                <span className="ml-sm inline-block rounded-full bg-neutral-900 text-white px-sm py-0 text-xs font-bold">
                  {inboxDocs.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('pending')}
              className={`px-lg py-md font-semibold transition relative ${
                activeTab === 'pending'
                  ? 'border-b-2 border-neutral-900 text-neutral-900'
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              ✅ Pending Review
              {(pendingDocs?.length || 0) > 0 && (
                <span className="ml-sm inline-block rounded-full bg-neutral-900 text-white px-sm py-0 text-xs font-bold">
                  {pendingDocs.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* UPLOAD TAB */}
        {activeTab === 'upload' && (
          <div>
            <div className="mb-lg">
              <h2 className="text-xl font-bold text-neutral-900 mb-sm">Upload documents for AI processing</h2>
              <p className="text-sm text-neutral-600">
                Drop in certificates, tenancy agreements, evacuation plans, contact sheets, utility bills — any property document. The AI reads them, tells you what they are, and you file once you confirm.
              </p>
            </div>

            {uploadError && (
              <div className="mt-lg whitespace-pre-wrap rounded-xl border-2 border-neutral-900 bg-white p-md text-sm text-neutral-900">{uploadError}</div>
            )}
            {uploadApplied && (
              <div className="mt-lg rounded-xl bg-green-600 p-md text-sm font-semibold text-white">✅ {uploadApplied}</div>
            )}

            {uploadResults.length === 0 && (
              <label
                className={`mt-lg flex cursor-pointer flex-col items-center gap-md rounded-2xl border-2 border-dashed bg-white p-xl text-center transition-colors ${
                  dragOver ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-300 hover:border-neutral-500'
                }`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFiles(e.target.files)}
                  disabled={busy}
                />
                <p className="text-4xl">{busy ? '⏳' : '📄'}</p>
                {busy ? (
                  <>
                    <p className="font-bold text-neutral-900">{busyLabel}</p>
                    <p className="text-xs text-neutral-500">Please wait…</p>
                  </>
                ) : (
                  <>
                    <p className="font-bold text-neutral-900">Drop files here, or click to select</p>
                    <p className="text-xs text-neutral-500">PDFs, photos or scans (JPG, PNG) — multiple files at once</p>
                  </>
                )}
              </label>
            )}

            {uploadResults.length > 0 && (
              <div className="mt-lg space-y-lg">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-neutral-700">
                    📋 {uploadResults.length} document{uploadResults.length > 1 ? 's' : ''} identified
                  </p>
                  <button
                    onClick={() => { setUploadResults([]); setUploadError(''); setUploadApplied('') }}
                    className="rounded-lg border border-neutral-300 bg-white px-md py-sm text-sm font-semibold hover:bg-neutral-50"
                  >
                    Upload more
                  </button>
                </div>
                {uploadResults.map(({ result, file }, i) => (
                  <DocReview
                    key={i}
                    initial={result}
                    file={file}
                    properties={properties}
                    people={people}
                    tenancies={tenancies}
                    onApplied={(msg) => {
                      setUploadApplied(msg)
                      setUploadResults(prev => prev.filter((_, idx) => idx !== i))
                    }}
                    onCancel={() => setUploadResults(prev => prev.filter((_, idx) => idx !== i))}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* INBOX TAB */}
        {activeTab === 'inbox' && (
          <div>
            <div className="mb-lg">
              <h2 className="text-xl font-bold text-neutral-900 mb-sm">Documents received by email</h2>
              <p className="text-sm text-neutral-600">
                Documents forwarded to your inbox address land here. Review the AI's suggestion and file each one, or
                assign it yourself. Nothing is filed until you confirm.
              </p>
            </div>

            {inboxFlash && <div className="mt-lg rounded-xl bg-green-600 p-md text-sm font-semibold text-white">{inboxFlash}</div>}

            {inboxDocs.length === 0 ? (
              <div className="mt-lg rounded-2xl border border-dashed border-neutral-300 bg-white p-xl text-center text-sm text-neutral-500">
                Inbox is empty. Forward a document to your inbox address and it'll appear here.
              </div>
            ) : (
              <div className="mt-lg space-y-md">
                {inboxDocs.map((d) => {
                  const ai = (d.ai_result || null) as AIResult | null
                  const label = ai ? TYPE_LABELS[ai.doc_type] || 'Document' : 'Unread document'
                  const isOpen = inboxOpenId === d.id
                  return (
                    <div key={d.id} className="rounded-2xl border border-neutral-200 bg-white">
                      <button
                        onClick={() => setInboxOpenId(isOpen ? null : d.id)}
                        className="flex w-full items-center justify-between gap-md p-md text-left"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-bold text-neutral-900">
                            {label}
                            {ai && ai.confidence ? (
                              <span className="ml-sm text-xs font-normal text-neutral-400">{Math.round(ai.confidence * 100)}%</span>
                            ) : null}
                          </p>
                          <p className="truncate text-xs text-neutral-500">
                            {ai?.summary || d.subject || d.filename}
                            {d.from_email ? ` · from ${d.from_email}` : ''}
                          </p>
                        </div>
                        <span className="shrink-0 text-neutral-400">{isOpen ? '▲' : '▼'}</span>
                      </button>

                      {isOpen && (
                        <div className="border-t border-neutral-200 p-md">
                          <div className="mb-md flex items-center gap-md text-sm">
                            <a href={fileUrl(d.storage_path)} target="_blank" rel="noreferrer" className="font-semibold text-neutral-900 underline">
                              View original ({d.filename})
                            </a>
                            <button onClick={() => dismissInboxDoc(d.id)} className="text-xs text-neutral-400 hover:text-red-600">
                              Dismiss
                            </button>
                          </div>
                          {d.ai_error && !ai && (
                            <p className="mb-md rounded-lg bg-amber-50 p-sm text-xs text-amber-800">
                              The AI couldn't read this ({d.ai_error}). Pick the type and fill the details in yourself below.
                            </p>
                          )}
                          <DocReview
                            initial={ai || BLANK}
                            properties={properties}
                            people={people}
                            tenancies={tenancies}
                            onApplied={(msg) => markInboxFiled(d.id, msg)}
                            onCancel={() => setInboxOpenId(null)}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* PENDING REVIEW TAB */}
        {activeTab === 'pending' && (
          <div>
            <div className="mb-lg">
              <h2 className="text-xl font-bold text-neutral-900 mb-sm">Extracted data awaiting approval</h2>
              <p className="text-sm text-neutral-600">
                The AI has read these documents. Review, confirm the property, and file into the system.
              </p>
            </div>

            {pendingDocs.length === 0 ? (
              <div className="rounded-2xl border-2 border-neutral-200 bg-white p-2xl text-center">
                <p className="text-neutral-600">No documents awaiting review.</p>
                <button
                  onClick={() => setActiveTab('upload')}
                  className="mt-md inline-block text-sm font-bold text-blue-600 hover:text-blue-800"
                >
                  ↑ Upload a document
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-lg">
                {/* List */}
                <div className="col-span-1 space-y-sm max-h-[600px] overflow-y-auto">
                  {pendingDocs.map((doc) => (
                    <button
                      key={doc.id}
                      onClick={() => { setPendingSelected(doc); setPendingPropertyId(doc.property_id); }}
                      className={`w-full text-left rounded-lg border-2 p-md transition ${
                        pendingSelected?.id === doc.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-neutral-200 bg-white hover:border-neutral-300'
                      }`}
                    >
                      <div className="text-xs font-bold text-neutral-500 uppercase">{doc.document_type}</div>
                      <div className="mt-xs text-sm font-semibold text-neutral-900">{doc.summary || '(no summary)'}</div>
                      <div className="mt-sm flex items-center gap-sm text-xs text-neutral-600">
                        <span>📍 {doc.property_address_extracted || 'No address'}</span>
                        <span className="ml-auto">🎯 {(doc.confidence * 100).toFixed(0)}%</span>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Detail */}
                {pendingSelected && (
                  <div className="col-span-2 rounded-2xl border-2 border-neutral-200 bg-white p-lg">
                    <h2 className="text-xl font-bold text-neutral-900 mb-md">{pendingSelected.document_type.toUpperCase()}</h2>
                    <p className="text-sm text-neutral-600 mb-lg">{pendingSelected.summary}</p>

                    {/* Property selector */}
                    <div className="mb-lg">
                      <label className="block text-sm font-bold text-neutral-700 mb-sm">Confirm property:</label>
                      <select
                        value={pendingPropertyId || ''}
                        onChange={(e) => setPendingPropertyId(e.target.value || null)}
                        className="w-full rounded border-2 border-neutral-300 px-md py-sm text-sm"
                      >
                        <option value="">— Select a property —</option>
                        {properties.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.address})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Extracted fields */}
                    <div className="mb-lg max-h-[300px] overflow-y-auto bg-neutral-50 rounded p-md">
                      <h3 className="text-xs font-bold text-neutral-600 uppercase mb-sm">Extracted Data</h3>
                      <pre className="text-xs text-neutral-700 whitespace-pre-wrap break-words">
                        {JSON.stringify(pendingSelected.extracted_data, null, 2)}
                      </pre>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-md">
                      <button
                        onClick={() => handlePendingFile(pendingSelected)}
                        disabled={!pendingPropertyId || pendingFiling}
                        className="flex-1 rounded bg-green-600 px-lg py-md text-white font-bold hover:bg-green-700 disabled:opacity-50"
                      >
                        {pendingFiling ? 'Filing...' : '✅ File Document'}
                      </button>
                      <button
                        onClick={() => setPendingSelected(null)}
                        className="rounded border-2 border-neutral-300 px-lg py-md font-bold hover:bg-neutral-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
