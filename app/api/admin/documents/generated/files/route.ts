// Receipts and other files kept with a saved invoice or letter (migration 254; lib/documents/files).
//   GET    ?documentId=…                                   → { files: [{ id, name, type, size, url }] }  (url: 5-minute link)
//   POST   { action: 'start', documentId, fileName, contentType, size } → { path, token }  upload straight from the browser
//   POST   { action: 'confirm', documentId, path, fileName, contentType, size } → { file }
//   DELETE ?id=…                                           → hides it (the file is kept)
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { DOCS_BUCKET } from '@/lib/documents/generated'
import { FILE_TYPES, MAX_FILE_BYTES, filesFor, missingFilesTable } from '@/lib/documents/files'

export const dynamic = 'force-dynamic'
const SETUP = { error: 'Receipts need migration 254 running in Supabase.' }

export async function GET(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const s = createServiceClient()
  const id = req.nextUrl.searchParams.get('documentId') ?? ''
  const { error } = await s.from('generated_document_files').select('id').limit(1)
  if (missingFilesTable(error)) return NextResponse.json({ files: [], setupNeeded: true })
  const files = await filesFor(s, [id])
  const out = await Promise.all(files.map(async f => {
    const { data } = await s.storage.from(DOCS_BUCKET).createSignedUrl(f.storage_path, 300)
    return { id: f.id, name: f.file_name, type: f.content_type, size: f.size_bytes, url: data?.signedUrl ?? null }
  }))
  return NextResponse.json({ files: out })
}

export async function POST(req: NextRequest) {
  const caller = await requireStaff(req)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const s = createServiceClient()
  const documentId = String(b.documentId ?? '')
  const { data: doc } = await s.from('generated_documents').select('id').eq('id', documentId).is('deleted_at', null).maybeSingle()
  if (!doc) return NextResponse.json({ error: 'Save the invoice first, then add receipts.' }, { status: 404 })
  const ext = FILE_TYPES[String(b.contentType)]
  if (!ext) return NextResponse.json({ error: 'Add a PDF or a photo (JPEG, PNG, HEIC).' }, { status: 400 })
  if (Number(b.size) > MAX_FILE_BYTES) return NextResponse.json({ error: 'That file is over 20 MB.' }, { status: 400 })

  if (b.action === 'start') {
    const path = `generated/${documentId}/files/${crypto.randomUUID()}.${ext}`
    const { data, error } = await s.storage.from(DOCS_BUCKET).createSignedUploadUrl(path)
    if (error || !data) return NextResponse.json({ error: 'Could not prepare the upload' }, { status: 500 })
    return NextResponse.json({ path, token: data.token })
  }
  const path = String(b.path ?? '')
  if (!path.startsWith(`generated/${documentId}/files/`)) return NextResponse.json({ error: 'Invalid upload' }, { status: 400 })
  const { data, error } = await s.from('generated_document_files').insert({
    document_id: documentId, storage_path: path, file_name: String(b.fileName ?? 'Receipt').slice(0, 200),
    content_type: String(b.contentType), size_bytes: Math.round(Number(b.size) || 0), uploaded_by: caller.email,
  }).select('id, file_name').single()
  if (error) return NextResponse.json(missingFilesTable(error) ? SETUP : { error: error.message }, { status: 500 })
  return NextResponse.json({ file: data })
}

export async function DELETE(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { error } = await createServiceClient().from('generated_document_files').update({ removed_at: new Date().toISOString() }).eq('id', req.nextUrl.searchParams.get('id') ?? '')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
