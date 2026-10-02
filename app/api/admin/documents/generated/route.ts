/**
 * Letters & Invoices — saved documents.
 *   GET                         → { documents }            (newest first, not deleted)
 *   GET ?id=…&mode=view|download → { url }                 (5-minute private link)
 *   GET ?next=<base>            → { number }               (first free invoice number for that day/code)
 *   POST { kind, id?, invoice | letter, signer?, recipientEmail?, respond?: 'json' }
 *                               → the PDF (header X-Document-Id), or { doc } with respond 'json'
 *   DELETE ?id=…                → hides it from the list; the record and PDF are kept
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { contentDisposition } from '@/lib/contentDisposition'
import { DOCS_BUCKET, fileNameFor, isMissingTable, nextInvoiceNumber, renderDocument, saveDocument, type GeneratedDocument } from '@/lib/documents/generated'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const COLUMNS = 'id, kind, number, title, recipient_name, recipient_email, property_id, total, storage_path, created_by, created_at, updated_at, emailed_at, emailed_to'

export async function GET(req: NextRequest) {
  const caller = await requireStaff(req)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = req.nextUrl.searchParams
  const s = createServiceClient()

  const next = sp.get('next')
  if (next) {
    if (!/^[0-9A-Z-]{8,40}$/.test(next)) return NextResponse.json({ error: 'Bad number' }, { status: 400 })
    try { return NextResponse.json({ number: await nextInvoiceNumber(next) }) }
    catch { return NextResponse.json({ number: next }) }
  }

  const id = sp.get('id')
  if (id) {
    const { data, error } = await s.from('generated_documents').select(COLUMNS).eq('id', id).is('deleted_at', null).maybeSingle()
    if (error || !data) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    const doc = data as GeneratedDocument
    const download = sp.get('mode') === 'download' ? { download: fileNameFor(doc) } : undefined
    const { data: signed, error: signErr } = await s.storage.from(DOCS_BUCKET).createSignedUrl(doc.storage_path, 300, download)
    if (signErr || !signed) return NextResponse.json({ error: 'The PDF could not be opened' }, { status: 500 })
    return NextResponse.json({ url: signed.signedUrl })
  }

  const { data, error } = await s.from('generated_documents').select(COLUMNS).is('deleted_at', null).order('created_at', { ascending: false }).limit(200)
  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ documents: [], setupNeeded: true })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ documents: data })
}

export async function POST(req: NextRequest) {
  const caller = await requireStaff(req)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  let rendered
  try { rendered = await renderDocument(String(b.kind ?? ''), b, caller.email) }
  catch (err) {
    console.error('documents/generated render failed', err)
    return NextResponse.json({ error: 'Could not create the PDF' }, { status: 500 })
  }
  if ('error' in rendered) return NextResponse.json({ error: rendered.error }, { status: 400 })

  const { doc, error, status } = await saveDocument({
    id: b.id, pdf: rendered.pdf, fields: rendered.fields, recipientEmail: b.recipientEmail, callerEmail: caller.email,
  })
  if (!doc) return NextResponse.json({ error }, { status: status ?? 500 })
  if (b.respond === 'json') return NextResponse.json({ doc })
  return new NextResponse(new Uint8Array(rendered.pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': contentDisposition(fileNameFor(doc), 'attachment'),
      'X-Document-Id': doc.id,
    },
  })
}

export async function DELETE(req: NextRequest) {
  const caller = await requireStaff(req)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Which document?' }, { status: 400 })
  const { data, error } = await createServiceClient().from('generated_documents')
    .update({ deleted_at: new Date().toISOString(), deleted_by: caller.email }).eq('id', id).is('deleted_at', null).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
