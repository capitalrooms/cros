// POST /api/cleaner/reminder { cleanId, text } — the cleaner's "reminder for next time" at the end of a clean
// (17 Oct 2026). Kept with the house (property_cleaning_notes, type 'reminder'): it shows at the top of the next clean
// there and the office sees it. Cleaners can't add those notes directly (row rules allow view + tick off only), so
// it's saved here after checking this is their clean (or the office).
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireSignedIn, isStaff } from '@/lib/portalAuth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const me = await requireSignedIn(req)
  if (!me) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const text = String(b.text ?? '').trim().slice(0, 1000)
  if (!b.cleanId || !text) return NextResponse.json({ error: 'cleanId and text required' }, { status: 400 })
  const s = createServiceClient()
  const { data: clean } = await s.from('cleans').select('id, property_id, cleaner_id').eq('id', String(b.cleanId)).maybeSingle()
  if (!clean) return NextResponse.json({ error: 'Clean not found' }, { status: 404 })
  if (!isStaff(me) && !(me.role === 'cleaner' && (clean as any).cleaner_id === me.personId)) return NextResponse.json({ error: 'Not your clean' }, { status: 403 })
  const { error } = await s.from('property_cleaning_notes').insert({
    property_id: (clean as any).property_id, cleaning_type: 'reminder', note_title: 'Reminder from your last clean',
    note_content: text, created_by: me.personId, is_completed: false, is_deleted: false,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
