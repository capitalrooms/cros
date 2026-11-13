// /api/admin/task — the task bar (13 Nov 2026). Administrators first; other roles later.
//   POST  { text, history? }                → { message, choices, actions, logId } — plans only (lib/taskbar/plan):
//         looks things up and fills in cards. Nothing is sent or saved here except the history line — each card is
//         confirmed on screen and goes through the same route its screen uses.
//   PATCH { logId, index, state, note }     → records what happened to a card (done / error)
//   GET                                     → { items } the last 25 asks, newest first, with what was done
// History needs migration 288 (task_log); without it the task bar still works, it just doesn't remember.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdministrator } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'
import { planTask } from '@/lib/taskbar/plan'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const NO = NextResponse.json({ error: 'The task bar is for administrators for now.' }, { status: 403 })

export async function GET(req: NextRequest) {
  if (!(await requireAdministrator(req))) return NO
  const { data, error } = await createServiceClient().from('task_log').select('id, created_by, text, reply, actions, results, created_at').order('created_at', { ascending: false }).limit(25)
  if (error) return NextResponse.json({ items: [], historyReady: false })
  return NextResponse.json({ items: data ?? [], historyReady: true })
}

export async function POST(req: NextRequest) {
  const me = await requireAdministrator(req)
  if (!me) return NO
  const b = await req.json().catch(() => ({}))
  const text = String(b.text ?? '').trim()
  if (text.length < 3) return NextResponse.json({ error: 'Say what you want to do.' }, { status: 400 })
  const history = (Array.isArray(b.history) ? b.history : []).filter((h: any) => (h?.role === 'user' || h?.role === 'assistant') && typeof h.content === 'string').map((h: any) => ({ role: h.role, content: String(h.content).slice(0, 2000) }))
  const s = createServiceClient()
  try {
    const plan = await planTask(s, text, me.email, history)
    const { data: log } = await s.from('task_log').insert({ created_by: me.email, text: text.slice(0, 2000), reply: plan.message, actions: plan.actions.map(a => ({ kind: a.kind, title: a.title })) }).select('id').maybeSingle()
    return NextResponse.json({ ...plan, logId: (log as any)?.id ?? null })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'That didn’t work — try again.' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const me = await requireAdministrator(req)
  if (!me) return NO
  const b = await req.json().catch(() => ({}))
  if (!b.logId || !Number.isInteger(b.index)) return NextResponse.json({ ok: false })
  const s = createServiceClient()
  const { data: row } = await s.from('task_log').select('results').eq('id', String(b.logId)).maybeSingle()
  if (!row) return NextResponse.json({ ok: false })
  const results = { ...((row as any).results ?? {}), [String(b.index)]: { state: b.state === 'done' ? 'done' : 'error', note: String(b.note ?? '').slice(0, 300), by: me.email, at: new Date().toISOString() } }
  await s.from('task_log').update({ results }).eq('id', String(b.logId))
  return NextResponse.json({ ok: true })
}
