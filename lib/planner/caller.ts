// Who's asking the shared planner (app/api/planner/shared): someone signed in, or a planner-link holder.
import type { NextRequest } from 'next/server'
import { requireSignedIn, type Caller } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { readPlannerLink } from '@/lib/planner/link'

/** Who's asking: someone signed in, or — no sign-in — the holder of a planner link (lib/planner/link), who acts as that
 *  board's member on that board only (17 Nov 2026). */
/** Is this person on the board — its first person, or added (migration 293)? */
export async function onBoard(s: ReturnType<typeof createServiceClient>, board: { id: string; member_person_id: string }, personId: string) {
  if (board.member_person_id === personId) return true
  const { data } = await s.from('planner_board_members').select('person_id').eq('board_id', board.id).eq('person_id', personId).maybeSingle()
  return !!data
}
/** Everyone on a board: first person + added. */
export async function boardPeople(s: ReturnType<typeof createServiceClient>, board: { id: string; member_person_id: string }): Promise<string[]> {
  const { data } = await s.from('planner_board_members').select('person_id').eq('board_id', board.id)
  return [board.member_person_id, ...((data ?? []) as any[]).map(x => x.person_id).filter(x => x !== board.member_person_id)]
}

export async function plannerCaller(req: NextRequest): Promise<Caller | null> {
  const link = req.headers.get('x-planner-link') || req.nextUrl.searchParams.get('link')
  if (link) {
    const got = readPlannerLink(link)
    if (!got) return null
    const boardId = got.boardId
    const s = createServiceClient()
    const { data: b } = await s.from('planner_shared_boards').select('member_person_id').eq('id', boardId).is('archived_at', null).maybeSingle() as { data: any }
    if (!b) return null
    // a person's own link on a shared board (migration 293) — only while they're still on it
    if (got.personId && got.personId !== b.member_person_id) {
      const { data: m } = await s.from('planner_board_members').select('person_id').eq('board_id', boardId).eq('person_id', got.personId).maybeSingle()
      if (!m) return null
    }
    const { data: p } = await s.from('people').select('id, email, role').eq('id', got.personId ?? b.member_person_id).maybeSingle() as { data: any }
    if (!p || ['administrator', 'admin'].includes(p.role)) return null
    return { userId: `planner-link:${boardId}`, email: p.email ?? '', personId: p.id, role: p.role, plannerBoardId: boardId } as Caller
  }
  return requireSignedIn(req)
}
