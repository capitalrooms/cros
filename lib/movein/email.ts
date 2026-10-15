// The "Your New Tenancy Pack" email — based on Harry's own (Sept 2026): congratulations on passing
// referencing, the documents to read, then confirm you're ready and we send the agreement to sign online.
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import { tableRow, ctaButton, PORTAL_URL } from '@/lib/emailWrapper'
import { ukLongDate, parseTenancyDate } from '@/lib/tenancy/firstRent'
import type { PackContext, PackDoc } from './pack'

export const svc = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
export const newPackToken = () => randomBytes(18).toString('base64url')
export const packLink = (token: string) => `${PORTAL_URL}/pack/${token}`
export const PACK_BUCKET = 'inbox-docs'

const esc = (v: string) => v.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const gbp = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const ordinal = (n: number) => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th')
const day = (isoDate: string | null) => { const d = parseTenancyDate(isoDate); return d ? ukLongDate(d) : '' }

export const defaultPackSubject = (ctx: PackContext) => `Your New Tenancy Pack - ${ctx.address.split(',').slice(0, 2).join(',')}`

export const defaultPackMessage = (ctx: PackContext) =>
  `Hooray! You have now completed the referencing process — thank you for your patience.\n\nYour tenancy documents are ready. Please read through them and let us know if you have any questions before signing.\n\nOnce you’ve read them, press “I’ve read everything and I’m ready to sign” on the page (or just reply to this email) and we’ll send your agreement to sign online.`

export function packEmailHtml(ctx: PackContext, docs: PackDoc[], link: string, message: string): string {
  const f = ctx.first
  const paras = esc(message).split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('')
  const list = docs.map(d => `<li style="margin:2px 0;">${esc(d.label)}${d.available ? '' : ' <span style="color:#a16207;">(to follow)</span>'}</li>`).join('')
  return `
    <p>Dear ${esc(ctx.tenant.dear)},</p>
    ${paras}
    <p style="margin-top:18px;"><strong>${esc(ctx.address)}</strong></p>
    ${ctaButton('View your tenancy documents', link)}
    <table style="width:100%;border-collapse:collapse;margin:8px 0 18px;">
      ${tableRow('Move-in date', day(ctx.startDate))}
      ${tableRow('Monthly rent', `${gbp(ctx.rentMonthly)} — due on the ${ordinal(ctx.rentDueDay)}`)}
      ${f ? tableRow(f.full ? 'First month’s rent' : 'First rent (pro rata)', `${gbp(f.amount)} <span style="color:#78716c;font-weight:400;">(${ukLongDate(f.from)} – ${ukLongDate(f.to)})</span>`) : ''}
      ${ctx.deposit ? tableRow('Deposit', gbp(ctx.deposit)) : ''}
      ${ctx.holdingDeposit ? tableRow('Holding deposit paid', `− ${gbp(ctx.holdingDeposit)}`) : ''}
      ${tableRow('Balance to pay', `${gbp(ctx.amountDue)}${ctx.payBy ? ` by ${day(ctx.payBy)}` : ''}`)}
      ${tableRow('Payment reference', esc(ctx.paymentRef))}
    </table>
    <p style="margin:0 0 6px;">In your pack:</p>
    <ul style="margin:0 0 18px;padding-left:20px;">${list}</ul>
    <p style="color:#78716c;font-size:13px;">Your agreement and check-in balance are also attached to this email.</p>`
}

/** The follow-up when the paperwork has gone quiet (Harry, 15 Oct 2026: "a reminder on our email then send the docs
 *  again … we would like to get the paperwork completed"). Same link, same documents; the wording follows what the
 *  tenant has done so far — not opened yet, or opened but not confirmed. */
export const packReminderSubject = (ctx: PackContext) => `Reminder: your tenancy paperwork - ${ctx.address.split(',').slice(0, 2).join(',')}`

export function packReminderHtml(ctx: PackContext, link: string, o: { sentAt: string; opened: boolean; phone: string }): string {
  const sent = ukLongDate(new Date(o.sentAt))
  const moveIn = day(ctx.startDate)
  const where = esc(ctx.address)
  const nudge = o.opened
    ? `<p>Thank you for taking a look at your documents. When you’re happy with everything, just press <strong>“I’ve read everything and I’m ready to sign”</strong> on the page — or simply reply to this email — and we’ll send your agreement over to sign online.</p>`
    : `<p>It looks like you haven’t had a chance to open them yet — no problem at all, everything is just one click away below.</p>`
  return `
    <p>Dear ${esc(ctx.tenant.dear)},</p>
    <p>Just a friendly reminder about your tenancy paperwork for <strong>${where}</strong>, which we sent over on ${sent}.</p>
    ${nudge}
    <p>We’d love to get everything completed${moveIn ? ` well ahead of your move-in on <strong>${moveIn}</strong>` : ''}, so that the agreement can be signed, your balance received and your keys ready and waiting for you.</p>
    ${ctaButton('View your tenancy documents', link)}
    <table style="width:100%;border-collapse:collapse;margin:8px 0 18px;">
      ${moveIn ? tableRow('Move-in date', moveIn) : ''}
      ${tableRow('Balance to pay', `${gbp(ctx.amountDue)}${ctx.payBy ? ` by ${day(ctx.payBy)}` : ''}`)}
      ${tableRow('Payment reference', esc(ctx.paymentRef))}
    </table>
    <p>If anything is holding you up — a question about the agreement, the payments or your move-in day — just reply to this email or call us on ${esc(o.phone)}. We’re always happy to help.</p>
    <p style="color:#78716c;font-size:13px;">For convenience, your agreement and check-in balance are attached again.</p>`
}
