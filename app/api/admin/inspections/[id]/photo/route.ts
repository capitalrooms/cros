// A photo for one area of an inspection — shrunk on the phone first, kept privately (property-documents/inspections/…).
import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { requireAdmin } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'
import { signedLinkFor } from '@/lib/files/server'

export const runtime = 'nodejs'
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const s = createServiceClient() as any
  const { data: r } = await s.from('property_inspections').select('property_id').eq('id', id).maybeSingle()
  if (!r) return NextResponse.json({ error: 'Inspection not found' }, { status: 404 })
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'No photo' }, { status: 400 })
  const ext = TYPES[file.type]
  if (!ext) return NextResponse.json({ error: 'Photos only (JPEG, PNG or WebP).' }, { status: 400 })
  if (file.size > 4_000_000) return NextResponse.json({ error: 'That photo is too big.' }, { status: 413 })
  const path = `inspections/${r.property_id}/${id}/${Date.now()}-${randomBytes(4).toString('hex')}.${ext}`
  const { error } = await s.storage.from('property-documents').upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const url = s.storage.from('property-documents').getPublicUrl(path).data.publicUrl as string
  return NextResponse.json({ url, link: await signedLinkFor(url, 3600) })
}
