/**
 * Publish (migration 285): GET → every piece, newest first, with how many it reached.
 * POST { kind: 'market_update' | 'announcement', areas? } → a new draft. lib/publish.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'
import { createPublication } from '@/lib/publish'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const s = createServiceClient()
  const { data, error } = await s.from('publications').select('id, kind, title, status, period, channels, scheduled_for, sent_at, website_published_at, created_at, created_by').order('created_at', { ascending: false }).limit(100)
  if (error && /publications/.test(error.message)) return NextResponse.json({ setupNeeded: true, items: [] })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const ids = (data ?? []).map((x: any) => x.id)
  const { data: sends } = ids.length ? await s.from('publication_sends').select('publication_id, status').in('publication_id', ids) : { data: [] as any[] }
  const count = (id: string, st: string) => ((sends ?? []) as any[]).filter(x => x.publication_id === id && x.status === st).length
  return NextResponse.json({ trackingReady: !!process.env.RESEND_EVENTS_SECRET, items: (data ?? []).map((x: any) => ({ ...x, sent: count(x.id, 'sent'), failed: count(x.id, 'failed') })) })
}

export async function POST(req: NextRequest) {
  const me = await requireAdmin(req)
  if (!me) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  try {
    const id = await createPublication(createServiceClient(), { kind: b.kind === 'announcement' ? 'announcement' : 'market_update', areas: Array.isArray(b.areas) ? b.areas.map(String) : [], by: me.email })
    return NextResponse.json({ ok: true, id })
  } catch (e) {
    const m = e instanceof Error ? e.message : 'Couldn’t start it'
    return NextResponse.json({ error: /publications/.test(m) ? 'Run migration 285 in Supabase first.' : m }, { status: 500 })
  }
}
