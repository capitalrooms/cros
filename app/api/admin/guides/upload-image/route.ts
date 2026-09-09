// POST /api/admin/guides/upload-image
// Multipart form: { file: File, path?: string }
// Uploads an image to Supabase Storage (tenant-guides bucket) and returns the public URL.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUCKET = 'tenant-guides'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!

function serviceClient() {
  return createClient(
    SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const pathHint = (formData.get('path') as string | null) || 'uploads'

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: 'Only PNG, JPEG, WebP and GIF images are allowed' }, { status: 400 })
  }

  const timestamp = Date.now()
  const safeName = file.name.replace(/[^a-z0-9.\-_]/gi, '-').toLowerCase()
  const storagePath = `${pathHint}/${timestamp}-${safeName}`

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const sb = serviceClient()
  const { error } = await sb.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: true,
    })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`
  return NextResponse.json({ url: publicUrl })
}
