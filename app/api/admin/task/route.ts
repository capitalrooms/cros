// POST /api/admin/task — the task bar (13 Nov 2026). { text, history? } → { message, choices, actions }.
// Plans only: looks things up and fills in cards (lib/taskbar/plan). Nothing is sent or saved here — each card is
// confirmed on screen and goes through the same route its screen uses. Administrators first; other roles later.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdministrator } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'
import { planTask } from '@/lib/taskbar/plan'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(req: NextRequest) {
  const me = await requireAdministrator(req)
  if (!me) return NextResponse.json({ error: 'The task bar is for administrators for now.' }, { status: 403 })
  const b = await req.json().catch(() => ({}))
  const text = String(b.text ?? '').trim()
  if (text.length < 3) return NextResponse.json({ error: 'Say what you want to do.' }, { status: 400 })
  const history = (Array.isArray(b.history) ? b.history : []).filter((h: any) => (h?.role === 'user' || h?.role === 'assistant') && typeof h.content === 'string').map((h: any) => ({ role: h.role, content: String(h.content).slice(0, 2000) }))
  try {
    return NextResponse.json(await planTask(createServiceClient(), text, me.email, history))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'That didn’t work — try again.' }, { status: 500 })
  }
}
