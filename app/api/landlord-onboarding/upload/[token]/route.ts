import { NextRequest, NextResponse } from 'next/server'
import {
  svc, loadRow, updateFormData, mergeDocuments,
  DOCS_BUCKET, MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_TYPES,
} from '@/lib/landlordOnboarding/store'

export const dynamic = 'force-dynamic'

const DOC_TYPE_RE = /^[a-z_]{2,40}$/
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }

// Files go browser → storage directly via a signed URL (Vercel caps request bodies at 4.5 MB,
// too small for phone photos and scanned PDFs). Two steps:
//   POST { action: 'start', docType, contentType, size } → { path, uploadToken }
//   POST { action: 'confirm', docType, path }            → records the path once the file exists
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const body = await req.json().catch(() => ({}))
  const docType = String(body.docType ?? '')
  if (!DOC_TYPE_RE.test(docType)) return NextResponse.json({ error: 'Invalid document type' }, { status: 400 })

  const row = await loadRow(token)
  if (!row) return NextResponse.json({ error: 'Invalid link' }, { status: 404 })
  if (row.stage >= 3) return NextResponse.json({ error: 'This form has already been submitted' }, { status: 409 })

  if (body.action === 'start') {
    const contentType = String(body.contentType ?? '')
    const size = Number(body.size ?? 0)
    if (!ALLOWED_UPLOAD_TYPES.includes(contentType)) {
      return NextResponse.json({ error: 'Please upload a photo (JPEG, PNG or WebP) or a PDF' }, { status: 400 })
    }
    if (!size || size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: 'Files must be under 20 MB' }, { status: 400 })
    }
    const path = `${token}/${docType}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${EXT[contentType]}`
    await svc().storage.createBucket(DOCS_BUCKET, { public: false }).catch(() => {})
    const { data, error } = await svc().storage.from(DOCS_BUCKET).createSignedUploadUrl(path)
    if (error || !data) return NextResponse.json({ error: 'Could not start the upload — please try again' }, { status: 500 })
    return NextResponse.json({ path: data.path, uploadToken: data.token, bucket: DOCS_BUCKET })
  }

  if (body.action === 'confirm') {
    const path = String(body.path ?? '')
    if (!path.startsWith(`${token}/${docType}_`)) return NextResponse.json({ error: 'Invalid upload' }, { status: 400 })
    const folder = path.slice(0, path.lastIndexOf('/'))
    const name = path.slice(path.lastIndexOf('/') + 1)
    const { data: found } = await svc().storage.from(DOCS_BUCKET).list(folder, { search: name, limit: 1 })
    if (!found?.some(f => f.name === name)) {
      return NextResponse.json({ error: 'The file did not finish uploading — please try again' }, { status: 400 })
    }
    const result = await updateFormData(token, (current) => ({
      form_data: { ...current, documents: mergeDocuments(current.documents, { [docType]: [path] }) },
    }))
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json({ ok: true, path, docType, documents: result.form_data.documents })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

// GET ?path=… → short-lived signed download URL (admin review screens).
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const path = req.nextUrl.searchParams.get('path')
  if (!path || !path.startsWith(`${token}/`)) return NextResponse.json({ error: 'path required' }, { status: 400 })
  const { data, error } = await svc().storage.from(DOCS_BUCKET).createSignedUrl(path, 3600)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ url: data.signedUrl })
}
