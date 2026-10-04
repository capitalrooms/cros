// POST /api/admin/statements/[id]/send
//   { preview: true }                               → { html, from, to, subject, message } for the send dialog
//   { to, cc?, subject, message }                    → emails the statement PDF from the signed-in admin; logs sent_at
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/adminAuth'
import { sendEmail } from '@/lib/sendEmail'
import { buildEmail } from '@/lib/emailWrapper'
import { senderFor } from '@/lib/email/sender'
import { loadStatementForPdf, renderStatementPdf } from '@/lib/statements/pdf'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const esc = (v: string) => v.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const gbp = (n: number) => '£' + Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const split = (v: unknown) => String(v || '').split(/[,;\s]+/).map(x => x.trim()).filter(Boolean)
const bodyHtml = (message: string) => esc(message).split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('')

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const data = await loadStatementForPdf(s, id)
  if (!data) return NextResponse.json({ error: 'Statement not found' }, { status: 404 })
  const { statement: st, property, landlord } = data
  if (/^X/.test(String(st.statement_reference || ''))) return NextResponse.json({ error: 'This is a practice statement — it can’t be emailed to anyone' }, { status: 409 })
  const sender = await senderFor(req)
  const where = property?.name || property?.address || 'your property'
  const hello = landlord?.first_name ? `Dear ${landlord.first_name}${landlord.joint_first_name ? ` and ${landlord.joint_first_name}` : ''},` : 'Dear Landlord,'
  const suggestedSubject = `Your statement for ${where} — ${st.statement_reference}`
  const suggestedMessage = `${hello}\n\nPlease find attached your statement for ${where} for ${st.statement_reference}.\n\nRent received ${gbp(st.gross_rent || 0)}, less our management fee and any expenses, leaves ${gbp(st.net_to_landlord || 0)} ${st.paid_date ? 'paid to you' : 'to be paid to you'}.\n\nIf anything doesn't look right, just reply to this email.`

  // invoices the admin chose to share, for expenses on this statement (private bucket; attached, never linked)
  const { data: exps } = await s.from('recharge_expenses').select('*').eq('included_in_statement_id', id)
  const shared = ((exps ?? []) as any[]).filter(e => e.share_invoice && e.invoice_path)
  const invoiceNames = shared.map(e => e.invoice_name || `Invoice ${e.reference || e.description}`)

  if (body.preview) {
    const to = [landlord?.email, landlord?.joint_email].filter(Boolean).join(', ')
    const message = String(body.message ?? suggestedMessage)
    return NextResponse.json({
      to, subject: suggestedSubject, message: suggestedMessage, from: sender.from,
      html: await buildEmail(bodyHtml(message), { sender }),
      alreadySent: st.sent_at ? { at: st.sent_at, to: st.sent_to } : null,
      invoices: invoiceNames,
    })
  }

  const to = split(body.to), cc = split(body.cc)
  const bad = [...to, ...cc].find(e => !EMAIL.test(e))
  if (!to.length) return NextResponse.json({ error: 'Add the landlord’s email address.' }, { status: 400 })
  if (bad) return NextResponse.json({ error: `“${bad}” isn’t a valid email address.` }, { status: 400 })
  const subject = String(body.subject || '').trim() || suggestedSubject
  const message = String(body.message || '').trim() || suggestedMessage

  const pdf = await renderStatementPdf(data)
  const attachments = [{ filename: `Statement ${st.statement_reference} ${property?.name || ''}.pdf`.replace(/\s+\.pdf$/, '.pdf'), content: pdf.toString('base64') }]
  const skipped: string[] = []
  if (body.include_invoices !== false) {
    let bytes = pdf.length
    for (const e of shared) {
      const { data: file } = await s.storage.from('finance-docs').download(e.invoice_path)
      const buf = file ? Buffer.from(await file.arrayBuffer()) : null
      const name = e.invoice_name || `Invoice ${e.reference || ''}.${String(e.invoice_path).split('.').pop()}`
      if (!buf || bytes + buf.length > 20 * 1024 * 1024) { skipped.push(name); continue }   // stay well under the email size limit
      bytes += buf.length
      attachments.push({ filename: name, content: buf.toString('base64') })
    }
  }
  const res = await sendEmail(to, subject, bodyHtml(message), { req, cc: cc.length ? cc : undefined, attachments })
  if (!res.ok) return NextResponse.json({ error: res.error || 'The email could not be sent.' }, { status: 502 })

  const { error } = await s.from('landlord_statements').update({ sent_at: new Date().toISOString(), sent_to: to.join(', ') }).eq('id', id)
  const warning = [error ? (error.code === '42703' ? 'Sent — run migration 185 so the send date is recorded.' : error.message) : null,
    skipped.length ? `Not attached (missing or too large): ${skipped.join(', ')}` : null].filter(Boolean).join(' ')
  return NextResponse.json({ ok: true, attached: attachments.length - 1, warning: warning || null })
}
