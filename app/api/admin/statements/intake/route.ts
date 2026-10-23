// GET /api/admin/statements/intake — every email that reached statements@ and what became of it (15 Oct 2026, Harry:
// "go through all the statements I have forwarded and get them logged … to an accounting standard"):
//   logged     — a statement carries the agent's number from its PDF (LS0993 · Jun 2026), with its totals
//   to_read    — has a PDF, but no statement carries its number yet (imported before numbers were kept, or failed)
//   no_pdf     — nothing attached; forward the original again
// Re-reading is done one email at a time by the screen (POST /api/webhooks/autoledger, header x-cros-reread).
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/adminAuth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'That isn’t part of your access — ask an administrator.' }, { status: 403 })
  const all: any[] = []
  let after: string | null = null
  for (let page = 0; page < 10; page++) {
    const r = await fetch(`https://api.resend.com/emails/receiving?limit=100${after ? `&after=${after}` : ''}`, { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` } })
    if (!r.ok) return NextResponse.json({ error: 'The email service didn’t answer — try again.' }, { status: 502 })
    const d = await r.json()
    all.push(...(d.data ?? []))
    if (!d.has_more || !d.data?.length) break
    after = d.data[d.data.length - 1].id
  }
  const emails = all.filter(e => String(e.to).toLowerCase().includes('statements@'))
  const s = createServiceClient()
  const { data: st } = await s.from('landlord_statements').select('id, statement_reference, statement_date, gross_rent, net_to_landlord, properties(name)').like('statement_reference', 'LS%')
  const byNo = new Map<string, any>()
  for (const x of (st ?? []) as any[]) { const n = String(x.statement_reference).match(/^LS\d+/i)?.[0]?.toUpperCase(); if (n) byNo.set(n, x) }
  const rows = emails.map(e => {
    const files: string[] = (e.attachments ?? []).map((a: any) => String(a.filename ?? ''))
    const no = files.map(f => f.match(/\bLS\d{3,}\b/i)?.[0]?.toUpperCase()).find(Boolean) ?? null
    const hit = no ? byNo.get(no) : null
    return {
      id: e.id, receivedAt: e.created_at, subject: e.subject ?? '', files, number: no,
      status: !files.length ? 'no_pdf' : hit ? 'logged' : 'to_read',
      statement: hit ? { id: hit.id, reference: hit.statement_reference, date: hit.statement_date, property: String(hit.properties?.name ?? '').split('\n')[0], gross: Number(hit.gross_rent), net: Number(hit.net_to_landlord) } : null,
    }
  }).sort((a, b) => String(a.receivedAt).localeCompare(String(b.receivedAt)))
  return NextResponse.json({ emails: rows, counts: { total: rows.length, logged: rows.filter(r => r.status === 'logged').length, toRead: rows.filter(r => r.status === 'to_read').length, noPdf: rows.filter(r => r.status === 'no_pdf').length } })
}
