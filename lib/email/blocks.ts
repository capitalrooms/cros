// The building blocks every email to a tenant (and applicant) is made from (4 Nov 2026, Harry: "all these emails to
// tenants should have modern continuity"). Forest and brand gold, the office's own colours, laid out in email-safe
// tables with inline styles so they look the same in Gmail, Outlook and on a phone. They sit inside the house email
// (lib/emailWrapper buildEmail: logo, signature, footer) — never a frame of their own.
//
//   hero      the one thing the email is about, big: a date, an amount, a decision
//   steps     what happens next, numbered
//   card      a titled panel (tint: mint | cream | plain)
//   checklist groups of to-dos with gold ticks
//   facts     label → value rows
//   button    the one thing to press
//   note      a small cream aside
// Text passed in is escaped unless the name says html.

export const EMAIL = {
  forest: '#1F3B2E', gold: '#C4922A', ink: '#132219', text: '#3A4A40', muted: '#5C6B62',
  mint: '#E6EFE8', cream: '#F8F0DE', line: '#E1E6E0', white: '#FFFFFF',
  display: "'Bricolage Grotesque','Helvetica Neue',Arial,sans-serif",
  body: "Lato,'Helvetica Neue',Arial,sans-serif",
}
const E = EMAIL

export const esc = (s: string | number | null | undefined) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** "Dear Ms Smith," */
export const greeting = (dear: string) => `<p style="margin:0 0 14px;font-family:${E.body};font-size:15px;color:${E.ink}">Dear ${esc(dear)},</p>`

/** a paragraph of plain text (escaped); use paraHtml for text with your own <strong>/<a> */
export const para = (text: string) => paraHtml(esc(text))
export const paraHtml = (html: string) => `<p style="margin:0 0 16px;font-family:${E.body};font-size:15px;line-height:1.65;color:${E.text}">${html}</p>`

/** The headline panel: gold eyebrow, big white title, optional line under it. */
export function hero(o: { eyebrow: string; title: string; sub?: string; subHtml?: string }): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:6px 0 20px;border-collapse:separate">
<tr><td style="background:${E.forest};border-radius:16px;padding:22px 24px;border-bottom:5px solid ${E.gold}">
  <p style="margin:0;font-family:${E.body};font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${E.gold}">${esc(o.eyebrow)}</p>
  <p style="margin:6px 0 0;font-family:${E.display};font-size:26px;line-height:1.2;font-weight:800;color:${E.white}">${esc(o.title)}</p>
  ${o.sub || o.subHtml ? `<p style="margin:8px 0 0;font-family:${E.body};font-size:14px;line-height:1.55;color:#D7E2DA">${o.subHtml ?? esc(o.sub)}</p>` : ''}
</td></tr></table>`
}

/** A titled panel. */
export function card(title: string, innerHtml: string, tint: 'mint' | 'cream' | 'plain' = 'plain'): string {
  const bg = tint === 'mint' ? E.mint : tint === 'cream' ? E.cream : E.white
  const border = tint === 'plain' ? `border:1px solid ${E.line};` : ''
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 16px;border-collapse:separate">
<tr><td style="background:${bg};${border}border-radius:14px;padding:18px 20px">
  <p style="margin:0 0 10px;font-family:${E.display};font-size:17px;font-weight:800;color:${E.forest}">${esc(title)}</p>
  ${innerHtml}
</td></tr></table>`
}

/** Numbered steps — [title, text] (text is html). */
export function steps(items: [string, string][]): string {
  return items.map(([t, html], i) => `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:${i ? '12px' : '0'} 0 0"><tr>
  <td style="width:34px;vertical-align:top"><span style="display:inline-block;width:24px;height:24px;border-radius:12px;background:${E.forest};color:${E.white};font-family:${E.body};font-size:12px;font-weight:700;line-height:24px;text-align:center">${i + 1}</span></td>
  <td style="vertical-align:top;font-family:${E.body};font-size:14.5px;line-height:1.6;color:${E.text}"><strong style="color:${E.ink}">${esc(t)}.</strong> ${html}</td></tr></table>`).join('')
}

/** Groups of to-dos with gold ticks. */
export function checklist(groups: { title: string; items: string[] }[]): string {
  return groups.map((g, gi) => `<p style="margin:${gi ? '14px' : '0'} 0 6px;font-family:${E.body};font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${E.muted}">${esc(g.title)}</p>
  ${g.items.map(it => `<table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr><td style="width:22px;vertical-align:top;font-family:${E.body};font-size:14px;line-height:1.6;color:${E.gold};font-weight:700">✓</td><td style="font-family:${E.body};font-size:14px;line-height:1.6;color:${E.text};padding-bottom:3px">${esc(it)}</td></tr></table>`).join('')}`).join('')
}

/** Label → value rows. */
export function facts(rows: [string, string][]): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%">${rows.map(([k, v]) => `<tr>
  <td style="padding:7px 0;border-bottom:1px solid ${E.line};font-family:${E.body};font-size:13.5px;color:${E.muted};width:44%;vertical-align:top">${esc(k)}</td>
  <td style="padding:7px 0;border-bottom:1px solid ${E.line};font-family:${E.body};font-size:14px;font-weight:700;color:${E.ink};text-align:right;vertical-align:top">${esc(v)}</td></tr>`).join('')}</table>`
}

/** The one thing to press. */
export function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 20px"><tr><td style="background:${E.forest};border-radius:999px">
  <a href="${esc(href)}" style="display:inline-block;padding:13px 26px;font-family:${E.body};font-size:15px;font-weight:700;color:${E.white};text-decoration:none;border-radius:999px">${esc(label)}</a></td></tr></table>`
}

/** A small aside. */
export const note = (html: string) => `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 16px"><tr><td style="background:${E.cream};border-radius:12px;padding:12px 16px;font-family:${E.body};font-size:13.5px;line-height:1.6;color:${E.text}">${html}</td></tr></table>`
