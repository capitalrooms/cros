// GET /api/admin/statements/[id]/source — the agent's own statement PDF a statement was read from (17 Oct 2026, Harry:
// "softly preview the statement in a pop-up that the data is being drawn from … whilst we are in this mirroring
// phase"). The PDF stays on the email in the email service (statements@); it's found by the agent's statement number
// in the attachment's name (LS1033 …) and passed straight through — nothing is stored or changed.
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireStaff } from '@/lib/portalAuth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const H = () => ({ Authorization: `Bearer ${process.env.RESEND_API_KEY}` })

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const { id } = await params
  const { data: st } = await createServiceClient().from('landlord_statements').select('statement_reference').eq('id', id).maybeSingle()
  const no = String((st as any)?.statement_reference ?? '').match(/^LS\d{3,}/i)?.[0]?.toUpperCase()
  if (!no) return NextResponse.json({ error: 'This statement wasn’t read from an agent’s PDF, so there’s nothing to show.' }, { status: 404 })

  let after = ''
  for (let page = 0; page < 10; page++) {
    const r = await fetch(`https://api.resend.com/emails/receiving?limit=100${after ? `&after=${after}` : ''}`, { headers: H() }).catch(() => null)
    if (!r?.ok) break
    const d: any = await r.json().catch(() => ({}))
    for (const e of (d.data ?? []) as any[]) {
      const att = (e.attachments ?? []).find((a: any) => new RegExp(`\\b${no}\\b`, 'i').test(String(a.filename ?? '')))
      if (!att) continue
      const meta = await fetch(`https://api.resend.com/emails/inbound/${e.id}/attachments/${att.id}`, { headers: H() }).then(x => x.ok ? x.json() : null).catch(() => null)
      if (!meta?.download_url) break
      const file = await fetch(meta.download_url).catch(() => null)
      if (!file?.ok) break
      return new NextResponse(await file.arrayBuffer(), { headers: {
        'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${String(att.filename).replace(/"/g, '')}"`,
        'Cache-Control': 'private, max-age=300',
      } })
    }
    if (!d.has_more || !d.data?.length) break
    after = d.data[d.data.length - 1].id
  }
  return NextResponse.json({ error: `The PDF for ${no} wasn’t found in the statements@ inbox — forward it again to see it here.` }, { status: 404 })
}
