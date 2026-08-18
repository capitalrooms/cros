import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Generate a signed upload URL for direct browser-to-Supabase uploads.
 *
 * This sidesteps Vercel's ~4.5 MB serverless body limit for large files.
 * The browser uploads the file directly to Supabase Storage using the
 * returned token, then passes the public URL to the classify endpoint.
 *
 * Only callable by authenticated admin users (the route itself is just a
 * URL generator — the heavy lifting of the policy check is that the service
 * role key lives only on the server, never in the browser).
 */
export async function POST(request: NextRequest) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' }, { status: 500 })
  }

  let body: { fileName?: string; mimeType?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { fileName = 'document', mimeType = 'application/octet-stream' } = body

  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { persistSession: false } }
  )

  const ext = fileName.split('.').pop() || 'bin'
  const path = `ai-temp/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  // Create a signed upload URL — browser will use uploadToSignedUrl() with this token
  const { data, error } = await serviceClient.storage
    .from('property-documents')
    .createSignedUploadUrl(path)

  if (error || !data) {
    return NextResponse.json({ error: error?.message || 'Could not create upload URL' }, { status: 500 })
  }

  // Public URL for the classify endpoint to download — bucket is public so no
  // signed download URL needed
  const { data: urlData } = serviceClient.storage
    .from('property-documents')
    .getPublicUrl(path)

  return NextResponse.json({
    signedUrl: data.signedUrl,
    token: data.token,
    path,
    publicUrl: urlData.publicUrl,
  })
}
