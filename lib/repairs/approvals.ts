// Landlord approval of repairs (9 Nov 2026, migration 275). A property can have a repair approval limit; accepting a
// quote above it doesn't book the contractor — it asks the landlord, who sees every quote side by side on a private
// page (/approve/<token>) and approves one or declines. Approving books it exactly as the office's "Accept" does.
// Contractors are never named to the landlord (landlord-notifications rule): quotes show as Quote A, B, C. Server only.
import { randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/sendEmail'
import { ctaButton, tableRow, PORTAL_URL } from '@/lib/emailWrapper'
import { dearLine } from '@/lib/people'
import { loadQuoteJob } from '@/lib/quotes/quoteRequest'
import { acceptQuote, QUOTE_COLS, type QuoteRow } from '@/lib/quotes/store'
import type { EmailSender } from '@/lib/email/sender'

const esc = (v: string) => v.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const gbp = (n: number) => '£' + Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const approvalLink = (token: string) => `${PORTAL_URL}/approve/${token}`
const OFFICE = 'management@capitalrooms.co.uk'

/** The property's limit for a job, and who the landlord is. null limit = no approval needed. */
export async function limitFor(s: SupabaseClient, ticketId: string) {
  const { data: t } = await s.from('maintenance_tickets').select('property_id, properties(repair_approval_limit, landlord_id)').eq('id', ticketId).maybeSingle() as { data: any }
  const lim = t?.properties?.repair_approval_limit
  return { propertyId: t?.property_id ?? null, limit: lim == null || lim === '' ? null : Number(lim), landlordId: t?.properties?.landlord_id ?? null }
}

/** Ask the landlord to approve. Returns the approval row; throws if there's no landlord email. */
export async function requestApproval(s: SupabaseClient, q: QuoteRow, by: string | null, sender: EmailSender) {
  const { propertyId, limit, landlordId } = await limitFor(s, q.ticket_id)
  const { data: ll } = landlordId ? await s.from('people').select('salutation, first_name, last_name, full_name, email, joint_salutation, joint_first_name, joint_last_name, joint_email').eq('id', landlordId).maybeSingle() as { data: any } : { data: null }
  const emails = [ll?.email, ll?.joint_email].map(e => String(e ?? '').trim()).filter(e => /@/.test(e))
  if (!emails.length) throw new Error('The landlord has no email address on file, so they can’t be asked to approve. Add one, or go ahead without approval.')
  // one open request per job
  await s.from('repair_approvals').update({ status: 'withdrawn', decided_at: new Date().toISOString() }).eq('ticket_id', q.ticket_id).eq('status', 'pending')
  const token = randomBytes(18).toString('base64url')
  const { data: row, error } = await s.from('repair_approvals').insert({ ticket_id: q.ticket_id, property_id: propertyId, recommended_quote_id: q.id, amount: q.amount, token, sent_to: emails, requested_by: by }).select('*').single()
  if (error) throw new Error(/repair_approvals/.test(error.message) ? 'Repair approvals need migration 275 running in Supabase first.' : error.message)
  await s.from('maintenance_tickets').update({ on_hold: true }).eq('id', q.ticket_id)
  const job = await loadQuoteJob(s, q.ticket_id)
  const where = [job?.roomName, String(job?.propertyName || job?.propertyAddress || '').split(/[,\n]/)[0]].filter(Boolean).join(', ')
  const body = `
    <p>${esc(ll ? dearLine(ll) : 'Dear Sir or Madam,')}</p>
    <p>A repair at ${esc(where)} needs your go-ahead, as it’s over your approval limit${limit != null ? ` of ${gbp(limit)}` : ''}.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      ${tableRow('Repair', esc(job?.title ?? 'Repair'))}
      ${tableRow('Where', esc(where))}
      ${tableRow('Our recommendation', `${gbp(Number(q.amount))}`)}
    </table>
    <p>You can see the tenant’s photos and every quote we received side by side, then approve one or tell us to hold off.</p>
    ${ctaButton('See the quotes and approve', approvalLink(token))}
    <p style="color:#78716c;font-size:13px;">Questions? Just reply to this email or call us on 0207 112 9163.</p>`
  const r = await sendEmail(emails, `Your approval: ${job?.title ?? 'a repair'} — ${where}`, body, { kind: 'repair-approval', sender })
  if (!r.ok) { await s.from('repair_approvals').update({ status: 'withdrawn' }).eq('id', row.id); throw new Error(`The email didn’t send: ${r.error}`) }
  return row
}

/** Everything the landlord's page shows — no contractor names, no tenant details. */
export async function approvalView(s: SupabaseClient, token: string) {
  if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) return null
  const { data: a } = await s.from('repair_approvals').select('*').eq('token', token).maybeSingle() as { data: any }
  if (!a) return null
  if (!a.viewed_at) await s.from('repair_approvals').update({ viewed_at: new Date().toISOString() }).eq('id', a.id)
  const job = await loadQuoteJob(s, a.ticket_id)
  const { data: qs } = await s.from('maintenance_quotes').select('id, amount, notes, site_visit, status, submitted_at').eq('ticket_id', a.ticket_id).in('status', ['submitted', 'accepted']).order('amount', { ascending: true })
  const quotes = ((qs ?? []) as any[]).filter(q => q.amount != null).map((q, i) => ({ id: q.id, label: `Quote ${String.fromCharCode(65 + i)}`, amount: Number(q.amount), notes: q.notes ?? '', recommended: q.id === a.recommended_quote_id }))
  return { status: a.status as string, decidedAt: a.decided_at as string | null, chosen: a.chosen_quote_id as string | null, job: job ? { title: job.title, description: job.description, where: [job.roomName, String(job.propertyName || job.propertyAddress || '').split(/[,\n]/)[0]].filter(Boolean).join(', '), photos: job.photoUrls } : null, quotes }
}

/** The landlord's answer. Approve books the chosen quote; decline puts the job back with the office. */
export async function decideApproval(s: SupabaseClient, token: string, decision: 'approve' | 'decline', quoteId: string | null, note: string, sender: EmailSender) {
  const { data: a } = await s.from('repair_approvals').select('*').eq('token', token).maybeSingle() as { data: any }
  if (!a) throw new Error('This link isn’t valid any more.')
  if (a.status !== 'pending') throw new Error(a.status === 'approved' ? 'You’ve already approved this — thank you.' : 'This request has already been answered.')
  const now = new Date().toISOString()
  const job = await loadQuoteJob(s, a.ticket_id)
  if (decision === 'approve') {
    const id = quoteId || a.recommended_quote_id
    const { data: q } = await s.from('maintenance_quotes').select(QUOTE_COLS).eq('id', id).eq('ticket_id', a.ticket_id).maybeSingle()
    if (!q) throw new Error('That quote isn’t available any more — please call us.')
    await acceptQuote(s, q as QuoteRow, null, sender, { thankOthers: true })
    await s.from('repair_approvals').update({ status: 'approved', chosen_quote_id: id, decided_at: now, decided_note: note.slice(0, 1000) || null }).eq('id', a.id)
    await s.from('maintenance_tickets').update({ on_hold: false }).eq('id', a.ticket_id)
    await sendEmail([OFFICE], `Landlord approved: ${job?.title ?? 'repair'} (${gbp(Number((q as any).amount))})`, `<p>The landlord approved <strong>${esc(job?.title ?? 'the repair')}</strong> at ${gbp(Number((q as any).amount))}. The contractor has been told and the job is assigned.</p>${note ? `<p><strong>Their note:</strong> ${esc(note)}</p>` : ''}`, { kind: 'office-repair-approved', sender })
  } else {
    await s.from('repair_approvals').update({ status: 'declined', decided_at: now, decided_note: note.slice(0, 1000) || null }).eq('id', a.id)
    await sendEmail([OFFICE], `Landlord said hold off: ${job?.title ?? 'repair'}`, `<p>The landlord asked us to hold off on <strong>${esc(job?.title ?? 'the repair')}</strong>.</p>${note ? `<p><strong>Their note:</strong> ${esc(note)}</p>` : '<p>No note — give them a call.</p>'}`, { kind: 'office-repair-approved', sender })
  }
}
