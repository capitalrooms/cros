// POST /api/planner/shared/upload — a photo for a shared planner board (multipart: file, boardId).
// Saved privately in planner-files under the board's folder; returns { path, url } (url = a 1-hour signed link).
import { NextRequest, NextResponse } from 'next/server'
import { requireSignedIn } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic' }

export async function POST(req: NextRequest) {
  const caller = await requireSignedIn(req)
  if (!caller) return NextResponse.json({ error: 'Please sign in again' }, { status: 401 })
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  const boardId = String(form?.get('boardId') ?? '')
  if (!(file instanceof File)) return NextResponse.json({ error: 'No photo' }, { status: 400 })
  const ext = TYPES[file.type]
  if (!ext) return NextResponse.json({ error: 'Photos only (JPEG, PNG, WebP, GIF)' }, { status: 400 })
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'That photo is over 10 MB' }, { status: 400 })

  const s = createServiceClient()
  const { data: board } = await s.from('planner_shared_boards').select('id, member_person_id').eq('id', boardId).is('archived_at', null).maybeSingle()
  if (!board || !(['administrator', 'admin'].includes(caller.role) || board.member_person_id === caller.personId)) {
    return NextResponse.json({ error: 'Board not found' }, { status: 404 })
  }
  const path = `${board.id}/${crypto.randomUUID()}.${ext}`
  const { error } = await s.storage.from('planner-files').upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type })
  if (error) return NextResponse.json({ error: `Could not save the photo: ${error.message}` }, { status: 500 })
  const { data: signed } = await s.storage.from('planner-files').createSignedUrl(path, 3600)
  return NextResponse.json({ path, url: signed?.signedUrl ?? null })
}
