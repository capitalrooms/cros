// GET  /api/admin/deposits/prescribed-info?tenancyId= — the tenancy's prescribed information as a PDF (preview)
// POST /api/admin/deposits/prescribed-info { tenancyId } — email it to the tenant(s) with the DPS Terms and Conditions
//      and guide attached, and record the date served. See lib/deposits/prescribedInfo.
import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs'
import path from 'node:path'
import { requireAdmin } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'
import { fetchPDFBizSettings } from '@/lib/pdfLetterhead'
import { renderFormalLetter, signerFromProfile } from '@/lib/letters/formalLetter'
import { loadPI, piBody, piGaps, piSubject, DPS_TERMS_FILE, DPS_GUIDE_FILE, type PIContext } from '@/lib/deposits/prescribedInfo'
import { getElectedCommsLive } from '@/lib/comms'
import { sendEmail } from '@/lib/sendEmail'
import { contentDisposition } from '@/lib/contentDisposition'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
const fileName = (c: PIContext) => `Deposit prescribed information - ${c.property.replace(/[\\/:*?"<>|]/g, '')}.pdf`

async function render(c: PIContext, email: string) {
  const signer = await signerFromProfile(email)
  return renderFormalLetter({
    recipientName: c.tenants.map(t => t.name).join(' and '),
    recipientAddress: c.property.split(/,\s*/).join('\n'),
    date: today(), reference: c.schemeRef ?? undefined,
    subject: 'Prescribed information relating to your tenancy deposit',
    salutation: `Dear ${c.tenants.map(t => t.dear).join(' and ')}`,
    body: piBody(c), closing: 'Yours sincerely',
  }, { ...signer, includeSignature: true })
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const c = await loadPI(createServiceClient() as any, req.nextUrl.searchParams.get('tenancyId') ?? '', await fetchPDFBizSettings())
  if (!c) return NextResponse.json({ error: 'Tenancy not found' }, { status: 404 })
  const pdf = await render(c, admin.email)
  return new NextResponse(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': contentDisposition(fileName(c), 'inline') } })
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const s = createServiceClient() as any
  const b = await req.json().catch(() => ({}))
  const c = await loadPI(s, String(b.tenancyId ?? ''), await fetchPDFBizSettings())
  if (!c) return NextResponse.json({ error: 'Tenancy not found' }, { status: 404 })
  const gaps = piGaps(c)
  if (gaps.length) return NextResponse.json({ error: `Add ${gaps.join(', ')} first.` }, { status: 400 })
  const to = c.tenants.map(t => t.email).filter(Boolean)
  if (!to.length) return NextResponse.json({ error: 'No email address for the tenant — add one, or print it and hand it over.' }, { status: 400 })
  const termsPath = path.join(process.cwd(), 'public', DPS_TERMS_FILE)
  if (!fs.existsSync(termsPath)) return NextResponse.json({ error: 'The DPS Terms and Conditions must go with it — add the PDF first (see the note on the Deposits screen).' }, { status: 409 })
  if (!(await getElectedCommsLive())) return NextResponse.json({ error: 'Messages to tenants are switched off in Settings.' }, { status: 409 })

  const pdf = await render(c, admin.email)
  const guidePath = path.join(process.cwd(), 'public', DPS_GUIDE_FILE)
  const attachments = [
    { filename: fileName(c), content: pdf.toString('base64') },
    { filename: 'DPS Terms and Conditions.pdf', content: fs.readFileSync(termsPath).toString('base64') },
    ...(fs.existsSync(guidePath) ? [{ filename: 'DPS guide for tenants.pdf', content: fs.readFileSync(guidePath).toString('base64') }] : []),
  ]
  const esc = (v: string) => v.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!))
  const res = await sendEmail(to, piSubject(c), `
    <p>Dear ${esc(c.tenants.map(t => t.dear).join(' and '))},</p>
    <p>Your deposit of <strong>£${c.deposit.toFixed(2)}</strong> for ${esc(c.property)} is protected with the Deposit Protection Service, reference <strong>${esc(c.schemeRef ?? '')}</strong>.</p>
    <p>Attached is the <strong>prescribed information</strong> about your deposit, which we are required by law to give you, together with the DPS Terms and Conditions and the DPS guide for tenants. Please read them and keep them safe with your tenancy agreement.</p>
    <p>If anything in it isn’t right, or you’d like to give us a contact address for the end of your tenancy, just reply to this email.</p>`, { req, attachments })
  if (!res.ok) return NextResponse.json({ error: res.error || 'The email could not be sent.' }, { status: 502 })
  await s.from('tenancies').update({ prescribed_info_served_at: today() }).eq('id', c.tenancyId)
  await s.from('audit_logs').insert({ user_id: admin.personId, action: 'prescribed_info_served', details: `Prescribed information emailed to ${to.join(', ')} — ${c.property} (${c.schemeRef})` })
  return NextResponse.json({ ok: true, sentTo: to, servedOn: today() })
}
