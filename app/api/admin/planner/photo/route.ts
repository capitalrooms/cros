// POST /api/admin/planner/photo (multipart: file) — a photo for the office planner, kept for good in planner-files
// (not the temporary upload folder, which is cleared nightly) → { url } that opens anywhere (lib/planner/img).
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'
import { plannerImg } from '@/lib/planner/img'

export const dynamic = 'force-dynamic'
export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const f = (await req.formData().catch(() => null))?.get('file')
  if (!(f instanceof File) || !/^image\//.test(f.type)) return NextResponse.json({ error: 'Photos only' }, { status: 400 })
  const ext = (f.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg').replace(/[^a-z0-9]/g, '')
  const path = `office/${crypto.randomUUID()}.${ext}`
  const { error } = await createServiceClient().storage.from('planner-files').upload(path, Buffer.from(await f.arrayBuffer()), { contentType: f.type })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ url: plannerImg('planner-files', path) })
}
