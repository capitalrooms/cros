/**
 * Email templates for offer letters.
 * Option 1: Initial offer (invite to apply)
 * Option 2: Confirmed offer (request holding deposit) — "the search is over"
 *
 * The look matches the pages the applicant opens from them (17 Oct 2026, Harry: "in harmony with the make an offer
 * website … so the aesthetics are the same"): the public pages' "C" look (components/public/public.css) — Instrument
 * Serif headlines, small spaced capitals for labels, fine rules, a black panel and black pill buttons, warm white notes.
 * Only what the applicant actually offered is shown (their rent, move-in date and length of stay) — there is no
 * minimum term (Harry, 17 Oct 2026).
 *
 * Now async — all callers must await these functions.
 * Header and footer come from lib/emailWrapper.ts (the shared component).
 */

import { buildEmail } from '@/lib/emailWrapper'
import { SIGNATURE_ASSET_BASE } from '@/lib/brand/signature'
import { letWords, oneLine } from '@/lib/lettings/letWording'
import { PROCESS_GUIDE } from '@/lib/lettings/processGuide'

export { FROM } from '@/lib/emailWrapper'

interface OfferEmailContext {
  applicantName?: string
  roomName: string
  propertyAddress: string
  propertyCity: string
  /** the rent agreed on this offer, a month */
  advertisedRent: number
  /** what they asked for on their offer: a date (YYYY-MM-DD, or words) — left out when they didn't say */
  moveInDate?: string | null
  /** how long they'd like to stay, as they put it on their offer ("12 months") — left out when they didn't say */
  term?: string | null
  applicationUrl: string
  holdingDeposit: number
  /** the holding-deposit payment reference for this room (lib/offers/holdingRef) */
  holdingRef?: string
  /** a whole house or flat (single let) — same email, property words instead of room words (lib/lettings/letWording) */
  whole?: boolean
  /** false when the bills aren't in the rent (a whole let usually); rooms default to bills included */
  billsIncluded?: boolean | null
  /** a re-send with different figures: shown at the top so it plainly replaces the earlier email (23 Oct 2026) */
  correction?: string | null
}

// ── The look (components/public/public.css, in email-safe inline styles) ─────────────────────────────────────────
const SERIF = "'Instrument Serif',Georgia,'Times New Roman',serif"
const SANS = "'Instrument Sans','Helvetica Neue',Arial,sans-serif"
const INK = '#111111'
const SOFT = '#4A4741'
const MUTED = '#6F6B64'
const RULE = '#E4E0D8'
const PAPER = '#F4F1EB'
const CREAM = '#F3F0EA'
const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi']

const esc = (v: string) => v.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const gbp = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })
const gbp2 = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
/** "SE167TF" → "SE16 7TF" wherever a postcode sits in the address */
const tidyPostcodes = (s: string) => s.replace(/\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/gi, (_, a, b) => `${a.toUpperCase()} ${b.toUpperCase()}`)
/** "2026-11-01" → "1 November 2026"; words are kept as typed */
function moveInWords(v?: string | null): string {
  const s = String(v ?? '').trim()
  if (!s || /^to be (confirmed|agreed)$/i.test(s)) return ''
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? new Date(`${m[1]}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : s
}

/** The place on one line: room (rooms only), address, city when the address doesn't already end in it. */
function placeLine(c: OfferEmailContext): string {
  const addr = tidyPostcodes(oneLine(c.propertyAddress))
  const city = c.propertyCity && !addr.toLowerCase().includes(c.propertyCity.toLowerCase()) ? c.propertyCity : ''
  return [c.whole ? '' : c.roomName, addr, city].filter(Boolean).join(', ')
}

const eyebrow = (t: string, extra = '') =>
  `<p style="margin:0;font-family:${SANS};font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:${MUTED};${extra}">${t}</p>`

/** label / value rows between fine rules — the reserve page's copy rows */
function rows(items: [string, string][], topRule = INK): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border-top:1px solid ${topRule};margin:0 0 8px;">
    ${items.map(([k, v]) => `<tr><td style="padding:14px 0;border-bottom:1px solid ${RULE};">
      ${eyebrow(k)}
      <p style="margin:4px 0 0;font-family:${SANS};font-size:16px;line-height:1.45;font-weight:500;color:${INK};font-variant-numeric:tabular-nums;">${v}</p>
    </td></tr>`).join('')}
  </table>`
}

function pill(label: string, href: string, onDark = false): string {
  const bg = onDark ? CREAM : INK, fg = onDark ? INK : '#ffffff'
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:separate;margin:6px 0 0;"><tr>
    <td bgcolor="${bg}" style="background:${bg};border-radius:999px;">
      <a href="${href}" style="display:inline-block;padding:16px 32px;font-family:${SANS};font-size:15px;font-weight:500;letter-spacing:.04em;color:${fg};text-decoration:none;border-radius:999px;">${label}</a>
    </td></tr></table>`
}

/** The opening: a big serif greeting with its italic second line, the place, then the arched picture. */
function opening(o: { label: string; place: string; line1: string; line2: string; lead: string }): string {
  return `
    ${eyebrow(o.label)}
    <h1 style="margin:14px 0 0;font-family:${SERIF};font-weight:400;font-size:46px;line-height:1.02;letter-spacing:-.02em;color:${INK};">
      ${o.line1}<br><i>${o.line2}</i>
    </h1>
    ${eyebrow(o.place, 'margin-top:18px;')}
    <p style="margin:10px 0 26px;font-family:${SERIF};font-size:23px;line-height:1.3;color:${INK};">${o.lead}</p>
    <div style="text-align:center;margin:0 0 30px;">
      <img src="${SIGNATURE_ASSET_BASE}/brand/email-tenant-home.jpg" width="210" alt="" style="display:inline-block;width:210px;max-width:60%;height:auto;border:0;border-radius:999px 999px 0 0;background:#EFEBE3;">
    </div>`
}

const h2 = (t: string) => `<h2 style="margin:34px 0 14px;font-family:${SERIF};font-weight:400;font-size:32px;line-height:1.1;color:${INK};">${t}</h2>`

/** what they put on their offer — only the parts they actually gave (the place is under the greeting) */
function offerRows(c: OfferEmailContext, w: ReturnType<typeof letWords>): [string, string][] {
  const bills = c.billsIncluded === false ? '' : c.billsIncluded === true || !c.whole ? ', all bills included' : ''
  const moveIn = moveInWords(c.moveInDate)
  const term = String(c.term ?? '').trim()
  return [
    ...(c.advertisedRent ? [['Rent', `${gbp(c.advertisedRent)} a month${bills}`] as [string, string]] : []),
    ...(moveIn ? [['Moving in', esc(moveIn)] as [string, string]] : []),
    ...(term ? [['Staying for', esc(term)] as [string, string]] : []),
  ].filter(r => r[1]) as [string, string][]
}

function contact(): string {
  return `
    <p style="margin:30px 0 0;font-family:${SANS};font-size:15px;line-height:1.6;color:${INK};">
      Any questions? Email <a href="mailto:management@capitalrooms.co.uk" style="color:${INK};text-decoration:underline;">management@capitalrooms.co.uk</a> or call <a href="tel:02071129163" style="color:${INK};text-decoration:underline;">0207 112 9163</a>.
    </p>
    <p style="margin:22px 0 0;font-family:${SANS};font-size:15px;line-height:1.6;color:${INK};">All the best,<br>Harry &amp; the Capital Rooms team</p>`
}

/**
 * Option 1: Initial Offer Letter — invite to apply.
 */
export async function buildOfferLetterEmail(context: OfferEmailContext, req?: Request | null): Promise<string> {
  const w = letWords(!!context.whole)
  const name = context.applicantName ? esc(context.applicantName) : 'there'

  const inner = `
    ${opening({
      label: 'Your application',
      place: esc(placeLine(context)),
      line1: `Hi ${name},`,
      line2: 'we’d love to have you.',
      lead: `We think you’d be a great fit for ${w.thisUnit}, and we’d like to invite you to apply.`,
    })}
    ${rows(offerRows(context, w))}
    ${h2('Tell us about yourself')}
    <p style="margin:0 0 18px;font-family:${SANS};font-size:15px;line-height:1.6;color:${SOFT};">It takes less than 5 minutes, and helps us understand if this is a great fit. We’ll come back to you shortly.</p>
    ${pill('Complete your application', context.applicationUrl)}
    <p style="margin:12px 0 0;font-family:${SANS};font-size:13px;color:${MUTED};">This link lasts 30 days.</p>
    ${contact()}
  `
  return buildEmail(inner, { req })
}

/**
 * Option 2: Confirmed Offer with Holding Deposit Request — "the search is over".
 */
export async function buildSearchIsOverEmail(context: OfferEmailContext, req?: Request | null): Promise<string> {
  const w = letWords(!!context.whole)
  const name = context.applicantName ? esc(context.applicantName) : 'there'
  const unitName = context.whole ? 'The property' : esc(context.roomName || 'The room')
  const ref = esc(context.holdingRef || 'Your full name')
  // the reserve page has the "I've paid" button; the older apply link has the application form
  const toReserve = /\/applicant\/reserve/.test(context.applicationUrl)
  const steps = PROCESS_GUIDE.map((s, i) => `
    <tr><td valign="top" style="width:44px;padding:16px 0;border-top:1px solid ${i < 1 ? INK : '#D9D5CD'};font-family:${SERIF};font-style:italic;font-size:24px;line-height:1;color:${INK};">${ROMAN[i]}.</td>
    <td valign="top" style="padding:16px 0;border-top:1px solid ${i < 1 ? INK : '#D9D5CD'};">
      <p style="margin:0;font-family:${SANS};font-size:15px;font-weight:600;color:${INK};">${esc(s.title)}</p>
      <p style="margin:4px 0 0;font-family:${SANS};font-size:14px;line-height:1.6;color:${SOFT};">${esc(i === 0
        ? `Send ${gbp2(context.holdingDeposit)} to the account above using the reference shown, then let us know. We’ll take ${w.theUnit} off the market and reserve it for you.`
        : s.body.replace(/the room/g, w.theUnit))}</p>
    </td></tr>`).join('')

  const inner = `
    ${opening({
      label: 'Reservation',
      place: esc(placeLine(context)),
      line1: `Hi ${name},`,
      line2: 'the search is over.',
      lead: `We’re delighted to confirm ${unitName === 'The property' ? 'the property' : unitName} is yours. To hold it for you, all we need is a holding deposit of one week’s rent.`,
    })}
    ${context.correction ? `<p style="margin:22px 0 0;padding:14px 16px;border-radius:10px;background:#FBF1E4;font-family:${SANS};font-size:15px;line-height:1.6;color:${INK};"><strong>Updated:</strong> ${esc(context.correction)}</p>` : ''}
    ${rows(offerRows(context, w))}

    <div style="margin:30px 0 0;">
      ${eyebrow('Holding deposit')}
      <p style="margin:6px 0 0;font-family:${SERIF};font-size:64px;line-height:1;letter-spacing:-.01em;color:${INK};font-variant-numeric:tabular-nums;white-space:nowrap;">${gbp2(context.holdingDeposit)}</p>
      <p style="margin:10px 0 0;font-family:${SANS};font-size:15px;line-height:1.6;color:${SOFT};">${context.advertisedRent ? `${gbp(context.advertisedRent)} a month × 12 ÷ 52. ` : ''}It isn’t an extra fee — it comes off the balance you pay before moving in.</p>
    </div>

    ${h2('Pay by bank transfer')}
    ${rows([
      ['Account name', 'Capital Rooms Ltd'],
      ['Sort code', '20-18-93'],
      ['Account number', '40162574'],
      ['Payment reference', ref],
      ['Amount', gbp2(context.holdingDeposit)],
    ])}
    <p style="margin:12px 0 0;font-family:${SANS};font-size:14px;line-height:1.6;color:${MUTED};">Paying from outside the UK? Please make sure your bank’s transfer fees are covered on your side — we need to receive the full amount.</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:30px 0 0;">
      <tr><td bgcolor="${INK}" style="background:${INK};padding:28px 26px;">
        <p style="margin:0;font-family:${SERIF};font-size:32px;line-height:1.1;color:${CREAM};">${toReserve ? 'Sent the holding deposit?' : 'One more thing'}</p>
        <p style="margin:10px 0 18px;font-family:${SANS};font-size:15px;line-height:1.6;color:#C9C4BA;">${toReserve
          ? `Let us know as soon as the transfer has gone, so we can take ${w.theUnit} off the market straight away.`
          : 'Please fill in your application too, if you haven’t already — it takes less than 5 minutes.'}</p>
        ${pill(toReserve ? 'Let us know you’ve paid' : 'Complete your application', context.applicationUrl, true)}
      </td></tr>
    </table>

    <p style="margin:22px 0 0;padding:14px 16px;background:${PAPER};font-family:${SANS};font-size:14px;line-height:1.55;color:${INK};">
      Please send it within 48 hours if you can, so we can hold ${w.theUnit} for you.
    </p>

    ${h2('So, what happens now?')}
    ${eyebrow('From securing, to moving in', 'margin:-6px 0 12px;')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">${steps}</table>

    <p style="margin:26px 0 0;padding-left:16px;border-left:1px solid ${INK};font-family:${SANS};font-size:12.5px;line-height:1.6;color:${SOFT};">
      <strong style="color:${INK};">Important:</strong> the holding deposit takes ${w.theUnit} off the market for you while we complete your checks.
      It is returned to you within 7 days if we or the landlord decide not to go ahead. We may keep it only if you pull out, fail a
      Right to Rent check, give us false or misleading information, or don’t take reasonable steps to sign the agreement within 15 days
      (unless we agree a different date with you).
    </p>
    ${contact()}
  `

  return buildEmail(inner, { req })
}
