import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * One-time setup: ensures the "property-documents" storage bucket exists
 * and is public (so tenants can open their documents via URL).
 * Call once: GET /api/admin/ensure-storage
 */
export async function GET(req: NextRequest) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not set' }, { status: 500 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { persistSession: false } }
  )

  // Check if bucket already exists
  const { data: buckets, error: listErr } = await supabase.storage.listBuckets()
  if (listErr) {
    return NextResponse.json({ error: listErr.message }, { status: 500 })
  }

  const existing = (buckets || []).find((b) => b.name === 'property-documents')
  if (existing) {
    return NextResponse.json({ ok: true, created: false, message: 'Bucket already exists' })
  }

  // Create public bucket
  const { error: createErr } = await supabase.storage.createBucket('property-documents', {
    public: true,
    allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    fileSizeLimit: 20971520, // 20 MB
  })

  if (createErr) {
    return NextResponse.json({ error: createErr.message }, { status: 500 })
  }

  // Add storage policies so admins can upload
  await supabase.rpc('exec_sql', { sql: `
    DO $$ BEGIN
      CREATE POLICY "admins_upload_property_documents"
      ON storage.objects FOR INSERT
      WITH CHECK (
        bucket_id = 'property-documents'
        AND (SELECT role FROM public.people WHERE id = auth.uid()) = 'administrator'
      );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  ` }).catch(() => {})

  return NextResponse.json({ ok: true, created: true, message: 'Bucket "property-documents" created successfully' })
}
