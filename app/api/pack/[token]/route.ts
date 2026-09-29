// GET /api/pack/[token] — the tenant's move-in pack (documents, figures, whether they've confirmed).
// Each visit is logged; the first one marks the pack "viewed".
import { NextRequest, NextResponse } from 'next/server'
import { defaultSender } from '@/lib/email/sender'
import { svc } from '@/lib/movein/email'
import { packByToken, logPackEvent } from '@/lib/movein/public'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { pack, error } = await packByToken((await params).token)
  if (error) return NextResponse.json({ error: 'This link isn’t working right now. Please reply to our email instead.' }, { status: 500 })
  if (!pack) return NextResponse.json({ error: 'This link isn’t valid.' }, { status: 404 })
  if (pack.status === 'withdrawn') return NextResponse.json({ error: 'This pack has been replaced — please use the most recent link we sent you.' }, { status: 410 })

  const s = svc()
  await logPackEvent(req, pack.id, 'viewed')
  if (!pack.first_viewed_at) await s.from('tenancy_packs').update({ first_viewed_at: new Date().toISOString(), status: pack.status === 'sent' ? 'viewed' : pack.status }).eq('id', pack.id)

  const [{ data: sender }, office] = await Promise.all([
    pack.sent_by ? s.from('people').select('first_name, email, direct_phone').eq('id', pack.sent_by).maybeSingle() : Promise.resolve({ data: null }),
    defaultSender(),
  ])
  return NextResponse.json({
    firstName: pack.summary.firstName || pack.tenant_name.split(' ')[0],
    address: pack.summary.address,
    summary: pack.summary,
    message: pack.message,
    documents: pack.documents.map(d => ({ key: d.key, label: d.label, group: d.group, available: d.available })),
    confirmedAt: pack.confirmed_at,
    contact: { name: (sender as any)?.first_name || 'Capital Rooms', email: (sender as any)?.email || office.replyTo, phone: (sender as any)?.direct_phone || office.phone },
  })
}
