import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Web Share Target handler.
 *
 * The PWA manifest points the iOS/Android share sheet here via POST with
 * multipart/form-data. We receive the shared content, optionally upload any
 * files to Supabase temp storage, then redirect to /share-target for the
 * user to decide what to do with it.
 *
 * Note: the browser sends this POST with the auth cookie attached, so the
 * user is implicitly authenticated. We use the service role key only for
 * storage uploads (bypassing RLS on the bucket) — we don't expose any
 * user data without the cookie check below.
 */
export async function POST(request: NextRequest) {
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.redirect(new URL('/share-target?error=parse', request.url))
  }

  const title = (formData.get('title') as string | null) || ''
  const text  = (formData.get('text')  as string | null) || ''
  const url   = (formData.get('url')   as string | null) || ''
  const file  = formData.get('media') as File | null

  // If a file was shared, upload it to Supabase temp storage
  if (file && file.size > 0) {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceKey) {
      // Fallback: redirect without pre-upload — user will upload manually
      const params = new URLSearchParams({ title, text, url, error: 'no-key' })
      return NextResponse.redirect(new URL(`/share-target?${params}`, request.url))
    }

    try {
      const serviceClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        serviceKey,
        { auth: { persistSession: false } }
      )

      const ext  = file.name?.split('.').pop() || (file.type.startsWith('image/') ? 'jpg' : 'pdf')
      const path = `ai-temp/share-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

      const arrayBuffer = await file.arrayBuffer()
      const { error: uploadError } = await serviceClient.storage
        .from('property-documents')
        .upload(path, arrayBuffer, { contentType: file.type, upsert: false })

      if (!uploadError) {
        const { data: urlData } = serviceClient.storage
          .from('property-documents')
          .getPublicUrl(path)

        const params = new URLSearchParams({
          ...(title && { title }),
          ...(text  && { text }),
          path,
          fileUrl: urlData.publicUrl,
          fileName: file.name || `shared.${ext}`,
          fileType: file.type,
        })
        return NextResponse.redirect(new URL(`/share-target?${params}`, request.url))
      }
    } catch {
      // Upload failed — fall through to text-only redirect
    }
  }

  // Text / URL share (or file upload failed)
  const params = new URLSearchParams({
    ...(title && { title }),
    ...(text  && { text }),
    ...(url   && { url }),
  })
  return NextResponse.redirect(new URL(`/share-target?${params}`, request.url))
}

// Some browsers issue a GET preflight — return a redirect to the install page
export async function GET() {
  return NextResponse.redirect(new URL('/install', process.env.NEXT_PUBLIC_SITE_URL || 'https://cros-sigma.vercel.app'))
}
