// The private link in an invoice email (migration 254): the invoice and the receipts sent with it, for a landlord who
// isn't in the app yet. GET → { title, number, total, date, files }; GET ?file=<id>|invoice[&download=1] → the file.
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { DOCS_BUCKET, fileNameFor, type GeneratedDocument } from '@/lib/documents/generated'
import { filesFor } from '@/lib/documents/files'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token
  const s = createServiceClient()
  const { data: doc } = /^[A-Za-z0-9_-]{20,64}$/.test(token)
    ? await s.from('generated_documents').select('id, kind, number, title, recipient_name, total, storage_path, created_at, emailed_at, deleted_at').eq('share_token', token).maybeSingle()
    : { data: null }
  if (!doc || (doc as any).deleted_at) return NextResponse.json({ error: 'This link isn’t valid. Please reply to our email and we’ll send the documents again.' }, { status: 404 })
  const d = doc as any
  const files = await filesFor(s, [d.id])
  const want = req.nextUrl.searchParams.get('file')
  if (want) {
    const download = !!req.nextUrl.searchParams.get('download')
    const f = want === 'invoice' ? { storage_path: d.storage_path, file_name: fileNameFor(d as GeneratedDocument) } : files.find(x => x.id === want)
    if (!f) return NextResponse.json({ error: 'File not found' }, { status: 404 })
    const { data } = await s.storage.from(DOCS_BUCKET).createSignedUrl(f.storage_path, 300, download ? { download: f.file_name } : undefined)
    return data?.signedUrl ? NextResponse.redirect(data.signedUrl) : NextResponse.json({ error: 'That file couldn’t be opened' }, { status: 500 })
  }
  return NextResponse.json({
    kind: d.kind, number: d.number, title: d.title, recipient: d.recipient_name, total: d.total, date: String(d.emailed_at || d.created_at).slice(0, 10),
    files: files.map(f => ({ id: f.id, name: f.file_name, type: f.content_type })),
  })
}
