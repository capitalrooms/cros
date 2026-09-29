// PATCH /api/admin/move-in/packs/[packId] { action: 'withdraw' } — cancel a pack's link (e.g. after re-sending
// corrected documents). The tenant sees "this pack has been replaced".
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { svc } from '@/lib/movein/email'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ packId: string }> }) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { packId } = await params
  const b = await req.json().catch(() => ({}))
  if (b.action !== 'withdraw') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  const s = svc()
  const { error } = await s.from('tenancy_packs').update({ status: 'withdrawn' }).eq('id', packId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await s.from('tenancy_pack_events').insert({ pack_id: packId, event: 'withdrawn' })
  return NextResponse.json({ ok: true })
}
