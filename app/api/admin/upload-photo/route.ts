import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Upload a property photo to Supabase Storage.
 * Uses the service-role key so no storage bucket policies are needed.
 *
 * Form fields:
 *   file        — the image file
 *   property_id — UUID of the property
 */
export async function POST(req: NextRequest) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not set' }, { status: 500 })
  }

  const formData = await req.formData()
  const file = formData.get('file')
  const propertyId = String(formData.get('property_id') || '')

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
  const ext = ((file as File).name || 'photo').split('.').pop() || 'jpg'
  const storagePath = `property-photos/${propertyId}/${Date.now()}.${ext}`

  const { error: upErr } = await serviceClient.storage
    .from('property-photos')
    .upload(storagePath, bytes, {
      upsert: false,
      contentType: file.type || 'image/jpeg',
    })

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 })
  }

  // Get public URL
  const { data: urlData } = serviceClient.storage
    .from('property-photos')
    .getPublicUrl(storagePath)

  return NextResponse.json({
    ok: true,
    path: storagePath,
    url: urlData?.publicUrl || ''
  })
}
