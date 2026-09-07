/**
 * POST /api/admin/upload-brand-logo
 *
 * Multipart form: { file: File, variant: 'dark' | 'light' }
 *
 * Uploads the logo to Supabase storage (brand-assets bucket),
 * then updates business_settings.logo_url or logo_url_light.
 * Invalidates the email cache so the next send uses the new logo.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentUser } from '@/lib/auth'
import { invalidateBusinessSettingsCache } from '@/lib/emailWrapper'

const SETTINGS_ID = '00000000-0000-0000-0000-000000000001'
const BUCKET = 'brand-assets'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://cros-sigma.vercel.app'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user || !['administrator', 'admin'].includes(user.assignment?.role ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const form = await req.formData()
  const file = form.get('file') as File | null
  const variant = form.get('variant') as string | null

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (!['dark', 'light'].includes(variant ?? '')) {
    return NextResponse.json({ error: 'variant must be "dark" or "light"' }, { status: 400 })
  }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png'
  if (!['png', 'jpg', 'jpeg', 'svg', 'webp'].includes(ext)) {
    return NextResponse.json({ error: 'File must be PNG, JPG, SVG or WebP' }, { status: 400 })
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  const storagePath = `email-logo-${variant}-${Date.now()}.${ext}`

  const supa = serviceClient()

  // Ensure bucket exists (public, no auth needed to read logo from email clients)
  const { data: buckets } = await supa.storage.listBuckets()
  const bucketExists = buckets?.some(b => b.name === BUCKET)
  if (!bucketExists) {
    await supa.storage.createBucket(BUCKET, { public: true })
  }

  const { error: upErr } = await supa.storage
    .from(BUCKET)
    .upload(storagePath, bytes, {
      contentType: file.type || `image/${ext}`,
      upsert: true,
    })

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data: urlData } = supa.storage.from(BUCKET).getPublicUrl(storagePath)
  const publicUrl = urlData.publicUrl

  // Update the settings row
  const column = variant === 'dark' ? 'logo_url' : 'logo_url_light'
  const { error: dbErr } = await supa
    .from('business_settings')
    .update({ [column]: publicUrl, updated_at: new Date().toISOString() })
    .eq('id', SETTINGS_ID)

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

  invalidateBusinessSettingsCache()

  return NextResponse.json({ ok: true, url: publicUrl, column })
}
