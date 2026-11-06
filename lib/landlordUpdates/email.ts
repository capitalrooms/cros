// The email a landlord gets for one update (lib/landlordUpdates/updates). Used by the send route and by the preview in
// the composer, so what the office sees is exactly what the landlord gets.
//   headline   — the property and the tenancy's key terms, in a dark band at the top (6 Nov 2026)
//   message    — the letter as written
//   facts      — the tenant's details, as a table
//   statement  — let-only: deposit and rent received, our fee, the balance and where it was paid (the lettings
//                statement's own figures — lib/lettingsStatement/forTenancy)
//   attached   — what's attached, listed so nothing is missed
//   link       — the private page, when documents go that way
import { buildEmail, ctaButton } from '@/lib/emailWrapper'
import type { EmailSender } from '@/lib/email/sender'
import type { StatementFigures } from '@/lib/lettingsStatement/forTenancy'

const esc = (v: string) => v.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const gbp = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const long = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

// the paperwork palette (lib/pdf/palette): forest, gold, ink, muted, line, tint
const FOREST = '#1F3B2E', GOLD = '#B8862A', INK = '#132219', MUTED = '#5C6B62', LINE = '#DCE2DC', TINT = '#F3F5F2'
const eyebrow = (t: string, colour = MUTED) => `<p style="margin:0 0 8px;font-size:10.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${colour};">${esc(t)}</p>`
const section = (title: string, inner: string) => `<div style="margin:26px 0 0;">${eyebrow(title)}${inner}</div>`

export type Headline = { eyebrow: string; place: string; terms: { label: string; value: string }[] }
type UpdateEmail = {
  stage: string; message: string; facts: { label: string; value: string }[]; link: string | null; until: string | null
  headline?: Headline | null; statement?: StatementFigures | null; attached?: string[]
}

/** The full email, in the house wrapper (the sender's signature at the foot). */
export async function landlordUpdateHtml(o: UpdateEmail & { req?: Request | null; sender?: EmailSender }): Promise<string> {
  return buildEmail(landlordUpdateBody(o), { req: o.req ?? null, sender: o.sender })
}

function headlineBlock(h: Headline): string {
  const cells = h.terms.map(t => `<td style="padding:0 18px 0 0;vertical-align:top;">
      <div style="font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#A9BDB0;">${esc(t.label)}</div>
      <div style="font-size:15px;font-weight:700;color:#FFFFFF;padding-top:3px;white-space:nowrap;">${esc(t.value)}</div></td>`).join('')
  return `<div style="background:${FOREST};border-radius:12px;padding:22px 24px;margin:0 0 24px;">
    ${eyebrow(h.eyebrow, GOLD)}
    <div style="font-size:21px;line-height:1.3;font-weight:700;color:#FFFFFF;">${esc(h.place)}</div>
    ${cells ? `<table role="presentation" style="border-collapse:collapse;margin-top:16px;"><tr>${cells}</tr></table>` : ''}
  </div>`
}

function factsBlock(facts: { label: string; value: string }[]): string {
  return `<table role="presentation" style="width:100%;border-collapse:collapse;border-top:1px solid ${LINE};">${facts.map(f => `<tr>
    <td style="padding:9px 12px 9px 0;border-bottom:1px solid ${LINE};color:${MUTED};font-size:13px;width:38%;vertical-align:top;">${esc(f.label)}</td>
    <td style="padding:9px 0;border-bottom:1px solid ${LINE};color:${INK};font-size:13px;font-weight:600;vertical-align:top;">${esc(f.value).replace(/\n/g, '<br>')}</td></tr>`).join('')}</table>`
}

function statementBlock(f: StatementFigures): string {
  const row = (label: string, sub: string, amount: string) => `<tr>
    <td style="padding:10px 12px 10px 0;border-bottom:1px solid ${LINE};vertical-align:top;"><div style="font-size:13.5px;color:${INK};">${esc(label)}</div>${sub ? `<div style="font-size:11.5px;color:${MUTED};padding-top:2px;">${esc(sub)}</div>` : ''}</td>
    <td style="padding:10px 0;border-bottom:1px solid ${LINE};text-align:right;vertical-align:top;font-size:13.5px;color:${INK};white-space:nowrap;">${amount}</td></tr>`
  const paid = !!f.paidOn
  const bankRows = [
    f.bank.bank && ['Bank', f.bank.bank], ['Account name', f.bank.name], f.bank.last4 && ['Account', `ending ${f.bank.last4}`],
    f.bank.sortCode && ['Sort code', f.bank.sortCode], ['Reference', f.payRef],
  ].filter(Boolean) as [string, string][]
  return section('Statement', `<table role="presentation" style="width:100%;border-collapse:collapse;border-top:1px solid ${LINE};">
      ${row('Deposit received', `${f.depositWeeks} weeks’ rent${f.holding > 0 ? ` · includes the ${gbp(f.holding)} holding deposit` : ''}`, gbp(f.deposit))}
      ${row('Rent received', f.rentMonths === 1 ? 'One month in advance' : `${f.rentMonths} months in advance`, gbp(f.rentIn))}
      ${f.fee > 0 ? row('Less our letting fee', f.feeLabel, `−${gbp(f.fee)}`) : ''}
    </table>
    <table role="presentation" style="width:100%;border-collapse:collapse;margin-top:12px;background:${TINT};border-radius:10px;"><tr>
      <td style="padding:14px 16px;font-size:13px;font-weight:700;color:${FOREST};">${paid ? 'Paid to you' : 'Balance due to you'}</td>
      <td style="padding:14px 16px;text-align:right;font-size:20px;font-weight:700;color:${FOREST};white-space:nowrap;">${gbp(f.due)}</td></tr></table>`)
    + section(paid ? `Paid on ${long(f.paidOn!)}` : 'Being paid to', factsBlock(bankRows.map(([label, value]) => ({ label, value }))))
}

function attachedBlock(names: string[]): string {
  return section(`Attached · ${names.length}`, `<table role="presentation" style="width:100%;border-collapse:collapse;">${names.map(n => {
    const ext = (n.match(/\.([a-z0-9]{2,4})$/i)?.[1] ?? 'pdf').toUpperCase()
    return `<tr><td style="padding:5px 10px 5px 0;width:38px;vertical-align:middle;"><span style="display:inline-block;min-width:30px;padding:3px 0;border-radius:4px;background:${TINT};border:1px solid ${LINE};font-size:9px;font-weight:700;letter-spacing:.06em;color:${FOREST};text-align:center;">${esc(ext)}</span></td>
      <td style="padding:5px 0;font-size:13px;color:${INK};vertical-align:middle;">${esc(n.replace(/\.[a-z0-9]{2,4}$/i, ''))}</td></tr>`
  }).join('')}</table>`)
}

/** Just the inside, for senders that wrap it themselves (lib/sendEmail sendEmail). */
export function landlordUpdateBody(o: UpdateEmail): string {
  // the details and the button sit between the letter and its closing lines ("Should you need anything…", "Kind regards,")
  const paras = esc(o.message).split(/\n{2,}/)
  const closing: string[] = []
  while (paras.length > 1 && /^(kind regards|best wishes|regards|many thanks|yours|should you|if you have any|please (do not|don’t|don't) hesitate)/i.test(paras[paras.length - 1])) closing.unshift(paras.pop()!)
  // the headline already names the property — a "Re:" line under it would say it twice
  const body = o.headline ? paras.filter(p => !/^Re: /.test(p)) : paras
  const signOff = closing.map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('')
  return `
    ${o.headline ? headlineBlock(o.headline) : ''}
    ${body.map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('')}
    ${o.statement ? statementBlock(o.statement) : ''}
    ${o.facts.length ? section(o.headline ? 'Your tenant' : 'Details', factsBlock(o.facts)) : ''}
    ${o.attached?.length ? attachedBlock(o.attached) : ''}
    ${o.link ? ctaButton(o.stage === 'offer' ? 'Review the offer' : 'View the tenant’s documents', o.link) : ''}
    ${o.link && o.until ? `<p style="color:#78716c;font-size:12.5px;text-align:center;margin-top:-10px;">This private link works until ${o.until}.</p>` : ''}
    <div style="height:10px;"></div>
    ${signOff}`
}
