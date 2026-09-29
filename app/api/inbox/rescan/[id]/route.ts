import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { createClient } from '@supabase/supabase-js'
import { classifyDocument } from '@/lib/ai-classify'

export const dynamic = 'force-dynamic'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const sb = serviceClient()

  const { data: doc, error: fetchErr } = await sb
    .from('inbox_documents')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchErr || !doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  if (doc.status === 'filed') return NextResponse.json({ error: 'Document already filed' }, { status: 409 })
  if (!doc.storage_path) return NextResponse.json({ error: 'No file stored for this document' }, { status: 400 })

  const { data: fileData, error: dlErr } = await sb.storage
    .from('inbox-docs')
    .download(doc.storage_path)

  if (dlErr || !fileData) {
    return NextResponse.json({ error: `Could not retrieve file: ${dlErr?.message}` }, { status: 500 })
  }

  const bytes = Buffer.from(await fileData.arrayBuffer())
  const mime = doc.mime || (doc.filename?.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg')

  let ai_result: any = null
  let ai_error: string | null = null
  try {
    ai_result = await classifyDocument(bytes, mime)
  } catch (e: any) {
    ai_error = e?.message || 'AI classification failed'
  }

  const { data: updated, error: updateErr } = await sb
    .from('inbox_documents')
    .update({ ai_result, ai_error, status: 'new' })
    .eq('id', id)
    .select('*')
    .single()

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, doc: updated, ai_result, ai_error })
}
