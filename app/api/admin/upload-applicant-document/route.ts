import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createClient } from '@supabase/supabase-js'
import { withOptionalColumns } from '@/lib/optionalColumns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Upload a document for an applicant (pre-tenancy: references, right-to-rent, etc.)
 * Stores in applicant_documents. At conversion the convert route copies these to
 * property_documents with person_id and tenancy_id set.
 */
export async function POST(req: NextRequest) {
  if (!(await requireStaff(req as any))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not set' }, { status: 500 })

  const formData = await req.formData()
  const file = formData.get('file')
  const applicantId   = String(formData.get('applicant_id') || '')
  const documentType  = String(formData.get('document_type') || 'tenant_reference')
  const description   = String(formData.get('description') || '')
  const fileName      = String(formData.get('file_name') || (file instanceof Blob ? (file as File).name : 'document'))

  if (!(file instanceof Blob) || !applicantId) {
    return NextResponse.json({ error: 'Missing file or applicant_id' }, { status: 400 })
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { persistSession: false } }
  )

  const bytes = Buffer.from(await file.arrayBuffer())
  const ext = fileName.split('.').pop() || 'pdf'
  const storagePath = `applicants/${applicantId}/${documentType}/${Date.now()}.${ext}`

  const { error: upErr } = await sb.storage
    .from('property-documents')
    .upload(storagePath, bytes, { upsert: false, contentType: file.type || 'application/pdf' })

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data: urlData } = sb.storage.from('property-documents').getPublicUrl(storagePath)
  const storageUrl = urlData?.publicUrl || ''

  const { error: dbErr } = await withOptionalColumns(withNew => sb.from('applicant_documents').insert({
    applicant_id: applicantId,
    doc_type:     documentType,
    file_name:    fileName,
    file_url:     storageUrl,
    storage_path: storagePath,
    ...(withNew ? { description: description || null } : {}),
  }))

  if (dbErr) {
    await sb.storage.from('property-documents').remove([storagePath])
    return NextResponse.json({ error: dbErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, storage_url: storageUrl })
}
