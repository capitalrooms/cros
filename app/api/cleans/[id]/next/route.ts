// POST /api/cleans/<id>/next — after a clean is finished (or logged afterwards), put the next one at the house in the
// diary (lib/cleans/nextClean; 26 Oct 2026). Only for a finished clean. The office, or the cleaner who did it.
import { NextRequest, NextResponse } from 'next/server'
import { requireSignedIn, isStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { bookNextClean } from '@/lib/cleans/nextClean'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await requireSignedIn(req)
  if (!caller) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const { id } = await params
  const s = createServiceClient()
  const { data: c } = await s.from('cleans').select('id, cleaner_id, status').eq('id', id).maybeSingle()
  if (!c) return NextResponse.json({ error: 'Clean not found' }, { status: 404 })
  if (!(isStaff(caller) || (caller.role === 'cleaner' && c.cleaner_id === caller.personId))) return NextResponse.json({ error: 'Not your clean' }, { status: 403 })
  if (c.status !== 'completed') return NextResponse.json({ error: 'Finish this clean first' }, { status: 400 })
  return NextResponse.json(await bookNextClean(s, id, req))
}
