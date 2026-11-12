// The email a landlord gets for one update (lib/landlordUpdates/updates). Used by the send route and by the preview in
// the composer, so what the office sees is exactly what the landlord gets.
// Design "C+" (6 Nov 2026 — Harry chose the editorial direction, "integrate the brand"; options canvas
// https://claude.ai/artifact/8b9cTQH6YdMmczGjtveURw), inside the house wrapper (lib/emailWrapper: logo bar on top, the
// sender's signature card with the TPO / ClientMoney Protect / DPS / Google badges at the foot):
//   hero       — cream band: a pill, "Your new tenant at <street>" in Instrument Serif, the room and move-in date, and the
//                house illustration (public/brand/email-tenant-home.jpg)
//   figures    — rent · deposit · paid to you (or the start date)
//   the letter
//   tenant + checks side by side (the checks are the facts that are dates: references, Right to Rent, signed, money in)
//   statement  — let-only: a dark panel, deposit and rent received, our fee, the balance, where it went (account
//                number as the last four only)
//   enclosed   — what's attached, as file tiles
// Tables throughout, inline styles only — what mail apps (Outlook included) actually render.
import { buildEmail, ctaButton } from '@/lib/emailWrapper'
import type { EmailTheme } from '@/lib/email/themes'
import { SIGNATURE_ASSET_BASE } from '@/lib/brand/signature'
import type { EmailSender } from '@/lib/email/sender'
import type { StatementFigures } from '@/lib/lettingsStatement/forTenancy'

const esc = (v: string) => v.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const gbp = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const long = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

const FOREST = '#1F3B2E', INK = '#1C1C1B', BODY = '#2E2C28', MUTED = '#8A8478', SOFT = '#6F6A60', LINE = '#DDD6C8', CREAM = '#F3EEE3', CREAM2 = '#F7F3EA', GOLD = '#D9C9A3'
const SERIF = "'Instrument Serif',Georgia,'Times New Roman',serif"
const SANS = "'Instrument Sans','Helvetica Neue',Arial,sans-serif"
const label = (t: string, colour = MUTED) => `<div style="font-family:${SANS};font-size:10.5px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:${colour};">${esc(t)}</div>`
const heading = (t: string, colour = FOREST) => `<div style="font-family:${SERIF};font-style:italic;font-size:21px;line-height:1.2;color:${colour};padding:0 0 12px;">${esc(t)}</div>`

export type Headline = { eyebrow: string; place: string; lead?: string; street?: string; sub?: string; room?: string | null; progress?: number; terms: { label: string; value: string }[] }
type UpdateEmail = {
  stage: string; message: string; facts: { label: string; value: string }[]; link: string | null; until: string | null
  headline?: Headline | null; statement?: StatementFigures | null; attached?: string[]
  /** a round photo of the tenant beside "Your tenant" (only if they shared one and the office left it on) */
  photoUrl?: string | null
  /** "Meet your new housemate": the card to forward — their photo and what they chose to share */
  card?: { first: string; photoUrl: string | null; items: { label: string; value: string }[] } | null
}

/** The full email, in the house wrapper (the sender's signature at the foot). */
export async function landlordUpdateHtml(o: UpdateEmail & { req?: Request | null; sender?: EmailSender; kind?: string; theme?: EmailTheme }): Promise<string> {
  // the hero runs full width under the logo bar; the rest sits in the wrapper's padded body
  return buildEmail(landlordUpdateBody(o, { heroApart: true }), { req: o.req ?? null, sender: o.sender, hero: o.headline ? hero(o.headline) : undefined, kind: o.kind ?? `landlord-update-${o.stage}`, theme: o.theme })   // the look chosen for this landlord, else its theme (Email hub)
}

function hero(h: Headline): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:${CREAM};margin:0 0 0;">
    <tr>
      <td valign="middle" style="padding:30px 26px 28px 26px;">
        <span style="display:inline-block;font-family:${SANS};font-size:10px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:#FFFFFF;background:${FOREST};border-radius:999px;padding:6px 12px;">${esc(h.eyebrow)}</span>${h.room ? ` <span style="display:inline-block;font-family:${SANS};font-size:12px;font-weight:700;color:${FOREST};background:#FFFFFF;border:1px solid ${FOREST};border-radius:999px;padding:4px 12px;margin-left:6px;">${esc(h.room)}</span>` : ''}
        <div style="font-family:${SERIF};font-size:38px;line-height:1.04;color:${INK};padding:14px 0 10px;">${esc(h.lead ?? '')}${h.lead ? ' ' : ''}<em style="color:${FOREST};">${esc(h.street ?? h.place)}</em></div>
        ${h.sub ? `<div style="font-family:${SANS};font-size:13.5px;line-height:1.55;color:#5A564D;">${esc(h.sub).replace(/\n/g, '<br>')}</div>` : ''}
      </td>
    </tr>
  </table>`
}

/** Where the letting has got to: offer → secured → referenced → signed & paid (12 Nov 2026, "a little boring"). */
function progress(at: number): string {
  const steps = ['Offer', 'Secured', 'Referenced', 'Signed & paid']
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 22px;"><tr>${steps.map((st, i) => {
    const done = i < at, now = i === at
    return `<td valign="top" width="25%" style="padding:0 2px;">
      <div style="height:5px;border-radius:3px;background:${done || now ? FOREST : LINE};font-size:0;line-height:0;">&nbsp;</div>
      <div style="font-family:${SANS};font-size:11.5px;line-height:1.3;padding-top:7px;color:${now ? FOREST : done ? BODY : MUTED};font-weight:${now ? 700 : 500};">${done ? '&#10003; ' : ''}${esc(st)}</div></td>`
  }).join('')}</tr></table>`
}

function figures(cells: { label: string; value: string; strong?: boolean }[]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-bottom:1px solid ${LINE};margin:0 0 26px;"><tr>${cells.map((c, i) => `
    <td valign="top" style="padding:16px 0 16px ${i ? '16px' : '0'};${i ? `border-left:1px solid ${LINE};` : ''}">
      ${label(c.label)}
      <div style="font-family:${SERIF};font-size:${cells.length > 3 ? 21 : 24}px;line-height:1.15;padding-top:3px;color:${c.strong ? FOREST : INK};white-space:nowrap;">${esc(c.value)}</div>
    </td>`).join('')}</tr></table>`
}

// the facts that are checks (a date or a pass), shown with a tick beside the tenant
const CHECK_LABELS = ['References', 'Right to Rent', 'Agreement signed', 'Move-in money', 'Deposit protection', 'Holding deposit']
const face = (url: string, size: number, alt: string) => `<img src="${esc(url)}" width="${size}" height="${size}" alt="${esc(alt)}" style="display:block;border:0;width:${size}px;height:${size}px;border-radius:${size / 2}px;object-fit:cover;">`

function tenantAndChecks(facts: { label: string; value: string }[], photoUrl?: string | null): string {
  const checks = facts.filter(f => CHECK_LABELS.includes(f.label))
  const about = facts.filter(f => !CHECK_LABELS.includes(f.label))
  const rows = about.map(f => `<tr><td style="padding:5px 10px 5px 0;font-family:${SANS};font-size:12px;color:${MUTED};vertical-align:top;white-space:nowrap;">${esc(f.label)}</td><td style="padding:5px 0;font-family:${SANS};font-size:13px;color:${BODY};vertical-align:top;">${esc(f.value).replace(/\n/g, '<br>')}</td></tr>`).join('')
  const ticks = checks.map(f => `<tr><td valign="top" style="padding:5px 10px 5px 0;width:18px;"><div style="width:18px;height:18px;border-radius:9px;background:${FOREST};color:#FFFFFF;font-family:${SANS};font-size:11px;line-height:18px;text-align:center;">&#10003;</div></td><td style="padding:5px 0;font-family:${SANS};font-size:13px;line-height:1.4;color:${BODY};">${esc(f.label)}<br><span style="color:${MUTED};font-size:12px;">${esc(f.value)}</span></td></tr>`).join('')
  const name = facts.find(f => f.label === 'Full name')?.value ?? ''
  const title = photoUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 10px;"><tr><td style="padding:0 12px 0 0;">${face(photoUrl, 56, name)}</td><td valign="middle">${heading('Your tenant').replace('padding:0 0 12px;', 'padding:0;')}</td></tr></table>`
    : heading('Your tenant')
  if (!checks.length) return `<div style="border:1px solid ${LINE};padding:20px 22px;margin:28px 0 0;">${title}<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows}</table></div>`
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid ${LINE};margin:28px 0 0;"><tr>
    <td valign="top" width="56%" style="padding:20px 18px 18px 22px;">${title}<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows}</table></td>
    <td valign="top" style="padding:20px 20px 18px;border-left:1px solid ${LINE};background:${CREAM2};">${heading('Checks')}<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${ticks}</table></td>
  </tr></table>`
}

function housemateCardBlock(c: NonNullable<UpdateEmail['card']>): string {
  const items = c.items.map(i => `<tr><td style="padding:10px 0;border-top:1px solid ${LINE};">
      <div style="font-family:${SANS};font-size:11.5px;color:${MUTED};padding-bottom:3px;">${esc(i.label)}</div>
      <div style="font-family:${SERIF};font-size:19px;line-height:1.3;color:${INK};">${esc(i.value)}</div></td></tr>`).join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:${CREAM2};border:1px solid ${LINE};margin:26px 0 0;"><tr><td style="padding:26px 26px 14px;">
    ${c.photoUrl ? `<div style="padding:0 0 14px;">${face(c.photoUrl, 96, c.first)}</div>` : ''}
    <div style="font-family:${SERIF};font-size:30px;line-height:1.1;color:${INK};padding:0 0 14px;">Hi, I’m <em style="color:${FOREST};">${esc(c.first)}</em></div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${items}</table>
  </td></tr></table>`
}

function statementBlock(f: StatementFigures): string {
  const row = (name: string, sub: string, amount: string) => `<tr>
    <td style="padding:7px 0;font-family:${SANS};font-size:14px;color:${CREAM};">${esc(name)}${sub ? ` <span style="color:#8F8B82;font-size:12px;">· ${esc(sub)}</span>` : ''}</td>
    <td align="right" style="padding:7px 0;font-family:${SANS};font-size:14px;color:${CREAM};white-space:nowrap;">${amount}</td></tr>`
  const paid = !!f.paidOn
  const meta = (k: string, v: string) => `<td valign="top" style="padding:0 12px 0 0;font-family:${SANS};font-size:12px;line-height:1.5;color:#B9B5AC;"><span style="color:#7E7A72;">${esc(k)}</span><br>${esc(v)}</td>`
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:${INK};margin:28px 0 0;"><tr><td style="padding:26px 26px 22px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr>
      <td style="font-family:${SERIF};font-style:italic;font-size:21px;color:${GOLD};">Statement</td>
      <td align="right">${label(paid ? `Paid ${long(f.paidOn!)}` : 'Balance due', '#8F8B82')}</td></tr></table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:12px;">
      ${row('Deposit received', `${f.depositWeeks} weeks${f.holding > 0 ? `, incl. ${gbp(f.holding)} holding deposit` : ''}`, gbp(f.deposit))}
      ${row('Rent received', f.rentMonths === 1 ? 'one month' : `${f.rentMonths} months`, gbp(f.rentIn))}
      ${f.fee > 0 ? row('Less our letting fee', f.feeLabel === 'Flat fee' ? '' : f.feeLabel, `&minus;${gbp(f.fee)}`) : ''}
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-top:1px solid #3A3833;margin-top:12px;"><tr>
      <td style="padding:16px 0 0;font-family:${SANS};font-size:13px;font-weight:600;color:${CREAM};">${paid ? 'Paid to you' : 'Balance due to you'}</td>
      <td align="right" style="padding:12px 0 0;font-family:${SERIF};font-size:38px;line-height:1;color:#FFFFFF;white-space:nowrap;">${gbp(f.due)}</td></tr></table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:18px;"><tr>
      ${meta('Account', [f.bank.name, [f.bank.bank, f.bank.last4 ? `••${f.bank.last4}` : ''].filter(Boolean).join(' ')].filter(Boolean).join(' · '))}
      ${f.bank.sortCode ? meta('Sort code', f.bank.sortCode) : ''}
      ${meta('Reference', f.payRef)}
    </tr></table>
  </td></tr></table>`
}

function enclosed(names: string[]): string {
  const tile = (n: string) => {
    const ext = (n.match(/\.([a-z0-9]{2,4})$/i)?.[1] ?? 'pdf').toUpperCase()
    return `<td valign="middle" width="50%" style="padding:4px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#FFFFFF;border:1px solid ${LINE};"><tr>
      <td width="34" style="padding:11px 0 11px 12px;"><span style="display:inline-block;font-family:${SANS};font-size:9px;font-weight:700;letter-spacing:.08em;color:#FFFFFF;background:${ext === 'PDF' ? FOREST : MUTED};padding:4px 5px;">${esc(ext)}</span></td>
      <td style="padding:11px 12px 11px 8px;font-family:${SANS};font-size:12.5px;line-height:1.3;color:${BODY};">${esc(n.replace(/\.[a-z0-9]{2,4}$/i, ''))}</td></tr></table></td>`
  }
  const rows: string[] = []
  for (let i = 0; i < names.length; i += 2) rows.push(`<tr>${tile(names[i])}${names[i + 1] ? tile(names[i + 1]) : '<td width="50%"></td>'}</tr>`)
  return `<div style="margin:28px 0 0;">${heading('Enclosed for your records')}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 -4px;">${rows.join('')}</table></div>`
}

/** Just the inside, for senders that wrap it themselves (lib/sendEmail sendEmail). */
export function landlordUpdateBody(o: UpdateEmail, opts: { heroApart?: boolean } = {}): string {
  // the details and the button sit between the letter and its closing lines ("Should you need anything…", "Kind regards,")
  const paras = esc(o.message).split(/\n{2,}/)
  const closing: string[] = []
  while (paras.length > 1 && /^(kind regards|best wishes|regards|with kind regards|many thanks|yours|should you|if you have any|please (do not|don’t|don't) hesitate)/i.test(paras[paras.length - 1])) closing.unshift(paras.pop()!)
  // the hero already names the property — a "Re:" line under it would say it twice
  const body = o.headline ? paras.filter(p => !/^Re: /.test(p)) : paras
  const p = (t: string) => `<p style="margin:0 0 14px;font-family:${SANS};font-size:15px;line-height:1.7;color:${BODY};">${t.replace(/\n/g, '<br>')}</p>`
  const h = o.headline
  const cells = h ? [
    ...h.terms.filter(t => t.label !== 'Start date' || !o.statement).map(t => ({ label: t.label, value: t.value.replace(/ pcm$/, ' pcm') })),
    ...(o.statement ? [{ label: o.statement.paidOn ? 'Paid to you' : 'Due to you', value: gbp(o.statement.due), strong: true }] : []),
  ].slice(0, 4) : []
  return `
    ${h && !opts.heroApart ? `<div style="margin:0 0 4px;">${hero(h)}</div>` : ''}
    ${h && h.progress != null && h.progress >= 0 ? `<div style="height:22px;line-height:22px;">&nbsp;</div>${progress(h.progress)}` : ''}
    ${cells.length ? figures(cells) : h ? '<div style="height:26px;line-height:26px;">&nbsp;</div>' : ''}
    ${body.map(p).join('')}
    ${o.card ? housemateCardBlock(o.card) : ''}
    ${o.facts.length ? tenantAndChecks(o.facts, o.photoUrl) : ''}
    ${o.statement ? statementBlock(o.statement) : ''}
    ${o.attached?.length ? enclosed(o.attached) : ''}
    ${o.link ? ctaButton(o.stage === 'offer' ? 'Review the offer' : 'View the tenant’s documents', o.link) : ''}
    ${o.link && o.until ? `<p style="color:#78716c;font-size:12.5px;text-align:center;margin-top:-10px;">This private link works until ${o.until}.</p>` : ''}
    <div style="height:18px;line-height:18px;">&nbsp;</div>
    ${closing.map(p).join('')}`
}
