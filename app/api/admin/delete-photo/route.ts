import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Delete a photo from Supabase Storage.
 * Uses the service-role key for direct access.
 *
 * Body:
 *   file_path — path to the file in storage (e.g., "property-photos/uuid/timestamp.jpg")
 */
export async function POST(req: NextRequest) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not set' }, { status: 500 })
  }

  const { file_path } = await req.json()
  if (!file_path) {
    return NextResponse.json({ error: 'Missing file_path' }, { status: 400 })
  }

  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { persistSession: false } }
  )

  // Delete from storage
  const { error } = await serviceClient.storage
    .from('property-photos')
    .remove([file_path])

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
