// POST /api/admin/market/report — the local market report (lib/rents/report). Office staff.
//   { action: 'areas', landlordId }                          → { codes } — the boroughs their houses are in (up to 3)
//   { action: 'preview', codes, landlordId? }                → { title, html, commentary, to, dear } — writes the commentary
//   { action: 'pdf', codes, commentary, landlordId? }        → the PDF
//   { action: 'email', codes, commentary, landlordId, to }   → sends it to the landlord, PDF attached
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { landlordAreas, reportPacks, reportCommentary, reportHtml, reportPdf, reportTitle } from '@/lib/rents/report'
import { dearLine, landlordName } from '@/lib/people'
import { sendEmail } from '@/lib/sendEmail'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 180

export async function POST(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const s = createServiceClient()
  const ll = b.landlordId ? (await s.from('people').select('salutation, first_name, last_name, full_name, company, email').eq('id', String(b.landlordId)).maybeSingle()).data as any : null
  if (b.action === 'areas') return NextResponse.json({ codes: b.landlordId ? await landlordAreas(s as any, String(b.landlordId)) : [] })
  const codes = (Array.isArray(b.codes) ? b.codes : []).map(String).slice(0, 3)
  if (!codes.length) return NextResponse.json({ error: 'Choose at least one area' }, { status: 400 })
  const packs = await reportPacks(s as any, codes)
  if (!packs.length) return NextResponse.json({ error: 'No figures for those areas' }, { status: 404 })
  const forName = ll ? landlordName(ll) : null
  if (b.action === 'preview') {
    const commentary = await reportCommentary(packs, forName).catch(() => '')
    return NextResponse.json({ title: reportTitle(packs), commentary, html: reportHtml(packs, commentary, ll ? dearLine(ll) : null), to: ll?.email ?? null, areas: packs.map(p => ({ code: p.code, name: p.name })) })
  }
  const commentary = String(b.commentary ?? '').slice(0, 5000)
  const pdf = await reportPdf(packs, commentary, forName)
  const file = `${reportTitle(packs).replace(/[^\w ,—-]/g, '').replace(/\s+/g, ' ')}.pdf`
  if (b.action === 'pdf') return new NextResponse(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${file.replace(/"/g, '')}"` } })
  if (b.action === 'email') {
    const to = String(b.to ?? ll?.email ?? '').trim()
    if (!to.includes('@')) return NextResponse.json({ error: 'No email address for the landlord' }, { status: 400 })
    const r = await sendEmail(to, reportTitle(packs), reportHtml(packs, commentary, ll ? dearLine(ll) : null), { req, kind: 'market-report', attachments: [{ filename: file, content: pdf.toString('base64') }] })
    if (!r.ok) return NextResponse.json({ error: r.error || 'The email didn’t send' }, { status: 502 })
    return NextResponse.json({ ok: true, to })
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
