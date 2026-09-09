/**
 * POST /api/admin/upload-signature
 *
 * Accepts a multipart/form-data body with a single "file" field (PNG or JPEG).
 * Uploads to inbox-docs/staff-signatures/{personId}.{ext} and saves the storage
 * path back to people.signature_url.
 *
 * Auth: Bearer token → must be an administrator or lettings user.
 * The upload always updates the caller's OWN signature (not another person's).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sb = svc()
  const { data: { user }, error: authErr } = await sb.auth.getUser(token)
  if (authErr || !user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Resolve the caller's people row
  const { data: person } = await sb
    .from('people')
    .select('id, role')
    .eq('email', user.email)
    .maybeSingle()

  if (!person) return NextResponse.json({ error: 'Person not found' }, { status: 404 })
  const role = (person as any).role as string
  if (!['administrator', 'admin', 'lettings'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ── Parse file ────────────────────────────────────────────────────────────
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: 'File must be a PNG, JPEG, or WebP image' }, { status: 400 })
  }
  if (file.size > 2 * 1024 * 1024) {
    return NextResponse.json({ error: 'File must be under 2 MB' }, { status: 400 })
  }

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const storagePath = `staff-signatures/${person.id}.${ext}`

  // ── Upload to storage ─────────────────────────────────────────────────────
  const bytes = await file.arrayBuffer()
  const { error: upErr } = await sb.storage
    .from('inbox-docs')
    .upload(storagePath, bytes, {
      contentType: file.type,
      upsert: true,  // replace any existing signature
    })

  if (upErr) {
    console.error('[upload-signature] storage error:', upErr)
    return NextResponse.json({ error: upErr.message }, { status: 500 })
  }

  // ── Save path to people.signature_url ─────────────────────────────────────
  const { error: dbErr } = await sb
    .from('people')
    .update({ signature_url: storagePath })
    .eq('id', person.id)

  if (dbErr) {
    console.error('[upload-signature] db error:', dbErr)
    return NextResponse.json({ error: dbErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, storagePath })
}
