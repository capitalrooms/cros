// POST /api/cleans/<id>/tell-tenants { kind: booked | moved | late | arrived | done | cancelled, note? } — tell the
// house's tenants about a clean (lib/cleans/tenantUpdates; 26 Oct 2026). The office, or the cleaner on that clean (or
// an unassigned one they're picking up).
import { NextRequest, NextResponse } from 'next/server'
import { requireSignedIn, isStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { tellTenantsAboutClean, type CleanUpdate } from '@/lib/cleans/tenantUpdates'

export const dynamic = 'force-dynamic'
const KINDS: CleanUpdate[] = ['booked', 'moved', 'late', 'arrived', 'done', 'cancelled']

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await requireSignedIn(req)
  if (!caller) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const { id } = await params
  const b = await req.json().catch(() => ({}))
  if (!KINDS.includes(b.kind)) return NextResponse.json({ error: 'Unknown update' }, { status: 400 })
  const s = createServiceClient()
  const { data: c } = await s.from('cleans').select('id, cleaner_id').eq('id', id).maybeSingle()
  if (!c) return NextResponse.json({ error: 'Clean not found' }, { status: 404 })
  const allowed = isStaff(caller) || (caller.role === 'cleaner' && (!c.cleaner_id || c.cleaner_id === caller.personId))
  if (!allowed) return NextResponse.json({ error: 'Not your clean' }, { status: 403 })
  const out = await tellTenantsAboutClean(s, id, b.kind, { note: typeof b.note === 'string' ? b.note.slice(0, 500) : undefined }, req)
  return NextResponse.json({ ok: true, ...out })
}
