import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const svc = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

const BUCKET = 'landlord-docs'

// POST /api/landlord-onboarding/upload/[token]
// Accepts multipart/form-data with fields: file, docType (e.g. 'id_document', 'proof_of_address', 'proof_of_ownership')
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  // Verify token exists
  const { data: row, error: rowErr } = await svc()
    .from('landlord_onboarding')
    .select('id, form_data, stage')
    .eq('token', token)
    .single()

  if (rowErr || !row) return NextResponse.json({ error: 'Invalid link' }, { status: 404 })
  if (row.stage >= 3) return NextResponse.json({ error: 'Already submitted' }, { status: 409 })

  const formData = await req.formData()
  const file     = formData.get('file') as File | null
  const docType  = (formData.get('docType') as string) || 'document'

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  // Validate file type and size (max 10MB)
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: 'Only JPEG, PNG, WebP or PDF files are accepted' }, { status: 400 })
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'File must be under 10 MB' }, { status: 400 })
  }

  const ext  = file.name.split('.').pop() ?? 'bin'
  const path = `${token}/${docType}_${Date.now()}.${ext}`

  // Ensure bucket exists (idempotent)
  await svc().storage.createBucket(BUCKET, { public: false }).catch(() => {})

  const bytes  = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  const { error: uploadErr } = await svc()
    .storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false })

  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 })
  }

  // Merge the new document path into form_data.documents
  const existing  = (row.form_data as any) ?? {}
  const documents = (existing.documents ?? {}) as Record<string, string[]>
  documents[docType] = [...(documents[docType] ?? []), path]

  await svc()
    .from('landlord_onboarding')
    .update({
      form_data:  { ...existing, documents },
      updated_at: new Date().toISOString(),
    })
    .eq('token', token)

  return NextResponse.json({ ok: true, path, docType })
}

// GET /api/landlord-onboarding/upload/[token]?path=... → signed download URL (admin use)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  await params // token not needed for signed URL, path is the key
  const path = req.nextUrl.searchParams.get('path')
  if (!path) return NextResponse.json({ error: 'path required' }, { status: 400 })

  const { data, error } = await svc()
    .storage
    .from(BUCKET)
    .createSignedUrl(path, 3600) // 1 hour

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ url: data.signedUrl })
}
