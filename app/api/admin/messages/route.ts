// GET /api/admin/messages?personId= — everything CROS has sent one person, newest first: emails and texts (message_log,
// migration 242, matched by their email address and mobile) and app messages (notifications). For the tenant profile's
// Communications tab (24 Oct 2026). Office staff with People, Comms or Lettings (lib/access/areas).
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const e164 = (p: string | null | undefined) => { const d = String(p ?? '').replace(/[^\d+]/g, ''); return d.startsWith('+') ? d : d.startsWith('0') ? `+44${d.slice(1)}` : d ? `+${d}` : '' }

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const personId = req.nextUrl.searchParams.get('personId') ?? ''
  const s = createServiceClient()
  const { data: p } = await s.from('people').select('id, email, phone').eq('id', personId).maybeSingle()
  if (!p) return NextResponse.json({ error: 'Person not found' }, { status: 404 })
  const addrs = [String(p.email ?? '').trim().toLowerCase(), e164(p.phone)].filter(Boolean)
  const [logQ, appQ] = await Promise.all([
    addrs.length ? s.from('message_log').select('id, channel, to_address, subject, preview, status, error, sent_by, created_at').in('to_address', addrs).order('created_at', { ascending: false }).limit(200) : Promise.resolve({ data: [], error: null }),
    s.from('notifications').select('id, title, body, type, read, created_at').eq('user_id', personId).order('created_at', { ascending: false }).limit(200),
  ])
  const items = [
    ...(((logQ as any).data ?? []) as any[]).map(m => ({ id: `m-${m.id}`, at: m.created_at, kind: m.channel === 'sms' ? 'Text' : 'Email', title: m.subject || (m.channel === 'sms' ? 'Text message' : 'Email'), detail: m.status === 'failed' ? `Not sent: ${m.error ?? 'refused'}` : m.preview ?? '', failed: m.status === 'failed', to: m.to_address, by: m.sent_by ?? null })),
    ...(((appQ as any).data ?? []) as any[]).map(n => ({ id: `n-${n.id}`, at: n.created_at, kind: 'App', title: n.title, detail: n.body ?? '', failed: false, to: null, by: null, read: !!n.read })),
  ].sort((a, b) => String(b.at).localeCompare(String(a.at)))
  return NextResponse.json({ items, logReady: !(logQ as any).error })
}
