'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase'
import AppBar from '@/components/AppBar'
import BackButton from '@/app/components/BackButton'
import DocReview, { AIResult } from '@/app/components/DocReview'
import PhotoReview from '@/app/components/PhotoReview'
import PurchaseReview from '@/app/components/PurchaseReview'
import InvoiceReview from '@/app/components/InvoiceReview'

// A scanned file is treated as a marketing photo (not a document) when it's an
// image the AI didn't recognise as any specific document type. Check the file
// extension as well as the MIME type — drag-dropped phone photos often arrive
// with an empty or non-image MIME type.
function isPhoto(result: AIResult, file: File) {
  const name = (file.name || '').toLowerCase()
  const looksLikeImage =
    file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/.test(name)
  return looksLikeImage && (!result.doc_type || result.doc_type === 'other')
}

export default function AIUploadPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [properties, setProperties] = useState<any[]>([])
  const [people, setPeople] = useState<any[]>([])
  const [tenancies, setTenancies] = useState<any[]>([])

  const [recentFiles, setRecentFiles] = useState<any[]>([])

  const [busy, setBusy] = useState(false)
  const [busyLabel, setBusyLabel] = useState('')
  const [error, setError] = useState('')
  const [results, setResults] = useState<Array<{ result: AIResult; file: File }>>([])
  const [applied, setApplied] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function init() {
      const data = await getCurrentUser()
      if (!data || (data.assignment?.role !== 'administrator' && data.assignment?.role !== 'admin')) {
        router.push('/login')
        return
      }
      const supabase = createClient()
      const { data: props } = await supabase.from('properties').select('id, name, address').order('name')
      const { data: ppl } = await supabase.from('people').select('id, full_name, first_name, last_name, email').eq('role', 'tenant').order('full_name')
      const { data: tens } = await supabase
        .from('tenancies')
        .select('id, start_date, end_date, people(full_name, first_name, last_name), rooms(id, name, property_id, properties(id, name))')
        .order('start_date', { ascending: false })
      setProperties(props || [])
      setPeople(ppl || [])
      setTenancies((tens as any) || [])

      // Recent uploads — pull from all three filing destinations
      const [{ data: docs }, { data: photos }, { data: purch }] = await Promise.all([
        supabase
          .from('property_documents')
          .select('id, file_name, document_type, uploaded_at, properties(name)')
          .order('uploaded_at', { ascending: false })
          .limit(10),
        supabase
          .from('property_photos')
          .select('id, file_name, file_url, created_at, properties(name)')
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('purchases')
          .select('id, name, category, created_at, properties(name)')
          .order('created_at', { ascending: false })
          .limit(10),
      ])

      const combined = [
        ...(docs || []).map((d: any) => ({ kind: 'doc', label: d.file_name, sub: d.document_type?.replace(/_/g, ' '), property: d.properties?.name, date: d.uploaded_at })),
        ...(photos || []).map((p: any) => ({ kind: 'photo', label: p.file_name || 'Photo', sub: 'room photo', property: p.properties?.name, date: p.created_at })),
        ...(purch || []).map((p: any) => ({ kind: 'purchase', label: p.name || 'Purchase', sub: p.category, property: p.properties?.name, date: p.created_at })),
      ]
        .filter(f => f.date)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 20)

      setRecentFiles(combined)
      setLoading(false)
    }
    init()
  }, [router])

  // Vercel serverless functions cap the request body at ~4.5 MB.
  // For larger files: server generates a signed upload URL, browser uploads
  // directly to Supabase Storage (bypassing Vercel entirely), then the classify
  // endpoint downloads from the public bucket URL server-to-server.
  const DIRECT_UPLOAD_LIMIT = 4 * 1024 * 1024 // 4 MB

  async function presignAndUpload(file: File): Promise<string> {
    // Step 1 — get a signed upload token from our server (uses service role key)
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

    // Step 2 — upload directly from the browser to Supabase Storage
    // (this never touches Vercel so the 4.5 MB limit doesn't apply)
    const supabase = createClient()
    const { error: upErr } = await supabase.storage
      .from('property-documents')
      .uploadToSignedUrl(path, token, file, { contentType: file.type || 'application/pdf' })

    if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`)

    // Step 3 — return the public URL for the classify endpoint to download
    return publicUrl
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setBusy(true)
    setBusyLabel(`Scanning ${files.length} file${files.length > 1 ? 's' : ''}…`)
    setError('')
    setResults([])
    setApplied('')

    const analyzed: AIResult[] = []
    const errors: string[] = []

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        setBusyLabel(`Reading ${i + 1} of ${files.length}: ${file.name}`)
        try {
          const body = new FormData()

          if (file.size > DIRECT_UPLOAD_LIMIT) {
            // Large file — upload to storage first so we bypass Vercel's body limit
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
            // Non-JSON response (e.g. plain-text 413 from Vercel gateway)
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
        setError(errors.join('\n'))
      } else {
        setResults(analyzed)
        if (errors.length > 0) {
          setError(`✅ Scanned ${analyzed.length} file(s)\n\n⚠️ Issues:\n${errors.join('\n')}`)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <AppBar left={<BackButton />} />
        <p className="p-xl text-sm text-neutral-400">Loading…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-100 pb-3xl">
      <AppBar left={<BackButton href="/admin" />} />

      <main className="mx-auto max-w-2xl px-lg py-lg">
        <div className="flex items-start justify-between gap-md">
          <div>
            <h1 className="text-3xl font-bold text-neutral-900">AI File Upload</h1>
            <p className="mt-sm text-sm text-neutral-600">
              Drop in certificates, tenancy agreements, contact sheets, utility bills, invoices and receipts — plus property photos. The AI reads documents, tells you what they are, and files once you confirm. For photos, you&apos;ll confirm which property they belong to (and assign rooms now or later on the property&apos;s Photos tab).
            </p>
          </div>
          <Link href="/admin/inbox" className="shrink-0 rounded-xl border border-neutral-300 bg-white px-md py-sm text-sm font-semibold hover:bg-neutral-50">
            📥 Inbox
          </Link>
        </div>

        {error && (
          <div className="mt-lg whitespace-pre-wrap rounded-xl border-2 border-neutral-900 bg-white p-md text-sm text-neutral-900">{error}</div>
        )}
        {applied && (
          <div className="mt-lg rounded-xl bg-green-600 p-md text-sm font-semibold text-white">✅ {applied}</div>
        )}

        {results.length === 0 && (
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

        {results.length > 0 && (
          <div className="mt-lg space-y-lg">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-neutral-700">
                📋 {results.length} file{results.length > 1 ? 's' : ''} to review
              </p>
              <button
                onClick={() => { setResults([]); setError(''); setApplied('') }}
                className="rounded-lg border border-neutral-300 bg-white px-md py-sm text-sm font-semibold hover:bg-neutral-50"
              >
                Upload more
              </button>
            </div>
            {results.map(({ result, file }, i) => {
              const onApplied = (msg: string) => {
                setApplied(msg)
                setResults(prev => prev.filter((_, idx) => idx !== i))
              }
              const onCancel = () => setResults(prev => prev.filter((_, idx) => idx !== i))
              const common = { initial: result, file, properties, onApplied, onCancel }
              if (isPhoto(result, file)) return <PhotoReview key={i} {...common} />
              if (result.doc_type === 'purchase_receipt') return <PurchaseReview key={i} {...common} />
              if (result.doc_type === 'supplier_invoice') return <InvoiceReview key={i} {...common} />
              return <DocReview key={i} {...common} people={people} tenancies={tenancies} />
            })}
          </div>
        )}
        {/* ── Recently filed ─────────────────────────────────────────── */}
        {recentFiles.length > 0 && results.length === 0 && (
          <div className="mt-2xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400 mb-md">Recently filed</p>
            <div className="rounded-2xl border border-neutral-200 bg-white divide-y divide-neutral-100">
              {recentFiles.map((f, i) => (
                <div key={i} className="flex items-center gap-md px-lg py-sm">
                  <span className="text-lg shrink-0">
                    {f.kind === 'photo' ? '📷' : f.kind === 'purchase' ? '🧾' : '📄'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-neutral-900 truncate">{f.label}</p>
                    <p className="text-xs text-neutral-400 truncate">
                      {[f.sub, f.property].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <p className="text-xs text-neutral-400 shrink-0 tabular-nums">
                    {new Date(f.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
