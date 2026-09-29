// The planner, saved in CROS so the phone and the computer show the same boards (it used to live only in each
// browser). Kept as a private JSON file in storage — admin-only, never public.
//   GET → { boards, savedAt } (boards null when nothing has been saved yet)
//   PUT { boards } → saves
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/adminAuth'

export const dynamic = 'force-dynamic'
const BUCKET = 'landlord-docs'       // a private bucket — never public
const PATH = 'planner/boards.json'
const svc = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const { data, error } = await svc().storage.from(BUCKET).download(PATH)
  if (error || !data) return NextResponse.json({ boards: null, savedAt: null })
  try {
    const j = JSON.parse(await data.text())
    return NextResponse.json({ boards: j.boards ?? null, savedAt: j.savedAt ?? null })
  } catch {
    return NextResponse.json({ boards: null, savedAt: null })
  }
}

export async function PUT(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const body = await req.json().catch(() => null)
  if (!body || !Array.isArray(body.boards)) return NextResponse.json({ error: 'Nothing to save' }, { status: 400 })
  const savedAt = new Date().toISOString()
  const file = JSON.stringify({ boards: body.boards, savedAt, savedBy: admin.email })
  const { error } = await svc().storage.from(BUCKET).upload(PATH, new Blob([file], { type: 'application/json' }), { upsert: true, contentType: 'application/json' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, savedAt })
}
