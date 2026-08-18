import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Upload a property document to Supabase Storage and record it in the
 * property_documents table. Uses the service-role key so no storage bucket
 * policies are needed.
 *
 * Form fields:
 *   file          — the binary file
 *   property_id   — UUID of the property
 *   document_type — DB document_type value (e.g. "evacuation_plan")
 *   description   — optional human summary
 */
export async function POST(req: NextRequest) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not set' }, { status: 500 })
  }

  const formData = await req.formData()
  const file = formData.get('file')
  const propertyId = String(formData.get('property_id') || '')
  const documentType = String(formData.get('document_type') || 'other')
  const description = String(formData.get('description') || '')
  const fileName = String(formData.get('file_name') || (file instanceof Blob ? (file as File).name : 'document'))
  const visibleToTenants = formData.get('visible_to_tenants') === 'true'

  if (!(file instanceof Blob) || !propertyId) {
    return NextResponse.json({ error: 'Missing file or property_id' }, { status: 400 })
  }

  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { persistSession: false } }
  )

  // Upload to storage
  const bytes = Buffer.from(await file.arrayBuffer())
  const ext = fileName.split('.').pop() || 'pdf'
  const storagePath = `${propertyId}/${documentType}/${Date.now()}.${ext}`

  const { error: upErr } = await serviceClient.storage
    .from('property-documents')
    .upload(storagePath, bytes, {
      upsert: false,
      contentType: file.type || 'application/pdf',
    })

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 })
  }

  // Get public URL
  const { data: urlData } = serviceClient.storage
    .from('property-documents')
    .getPublicUrl(storagePath)

  const storageUrl = urlData?.publicUrl || ''

  // Insert property_documents row
  const { data: doc, error: dbErr } = await serviceClient
    .from('property_documents')
    .insert({
      property_id:        propertyId,
      document_type:      documentType,
      file_name:          fileName,
      storage_url:        storageUrl,
      description:        description || null,
      visible_to_tenants: visibleToTenants,
    })
    .select()
    .single()

  if (dbErr) {
    // Clean up orphaned storage file
    await serviceClient.storage.from('property-documents').remove([storagePath])
    return NextResponse.json({ error: dbErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, document: doc, storage_url: storageUrl })
}
