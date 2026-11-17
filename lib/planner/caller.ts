// Who's asking the shared planner (app/api/planner/shared): someone signed in, or a planner-link holder.
import type { NextRequest } from 'next/server'
import { requireSignedIn, type Caller } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { readPlannerToken } from '@/lib/planner/link'

/** Who's asking: someone signed in, or — no sign-in — the holder of a planner link (lib/planner/link), who acts as that
 *  board's member on that board only (17 Nov 2026). */
export async function plannerCaller(req: NextRequest): Promise<Caller | null> {
  const link = req.headers.get('x-planner-link') || req.nextUrl.searchParams.get('link')
  if (link) {
    const boardId = readPlannerToken(link)
    if (!boardId) return null
    const s = createServiceClient()
    const { data: b } = await s.from('planner_shared_boards').select('member_person_id').eq('id', boardId).is('archived_at', null).maybeSingle() as { data: any }
    if (!b) return null
    const { data: p } = await s.from('people').select('id, email, role').eq('id', b.member_person_id).maybeSingle() as { data: any }
    if (!p || ['administrator', 'admin'].includes(p.role)) return null
    return { userId: `planner-link:${boardId}`, email: p.email ?? '', personId: p.id, role: p.role }
  }
  return requireSignedIn(req)
}
