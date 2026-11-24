// Landlord emails for the video call (24 Nov 2026). Designed bodies in the house colours; the house shell
// (logo, footer, signature) is added by buildEmail. Pure HTML, tables for mail clients, inline styles only.

const INK = '#17332B', GOLD = '#C4922A', GOLD_LIGHT = '#F2B84B', IVORY = '#F6F3EC', SAGE = '#E3ECE5', MUTED = '#4E6158', BUTTER = '#FDF1D8', BUTTER_INK = '#7A5410'
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Record<string, string>)[c]!)

function band(eyebrow: string, headline: string, sub: string) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-radius:20px;background:${SAGE};">
  <tr><td style="padding:26px 26px 24px;font-family:Nunito,Helvetica,Arial,sans-serif;">
    <table role="presentation" cellspacing="0" cellpadding="0"><tr>
      <td style="width:10px;height:10px;border-radius:50%;background:${GOLD};font-size:0;line-height:0;">&nbsp;</td>
      <td style="padding-left:8px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${MUTED};">${esc(eyebrow)}</td>
    </tr></table>
    <h1 style="margin:14px 0 8px;font-family:'Baloo 2',Helvetica,Arial,sans-serif;font-size:26px;line-height:1.2;font-weight:700;color:${INK};">${esc(headline)}</h1>
    <p style="margin:0;font-size:15px;line-height:1.6;color:${MUTED};">${esc(sub)}</p>
  </td></tr></table>`
}

const para = (t: string) => `<p style="margin:18px 4px 0;font-family:Nunito,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.65;color:${INK};">${t}</p>`

const button = (label: string, href: string) => `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:22px 0 0;"><tr><td style="border-radius:999px;border:1.5px solid ${GOLD};background:#ffffff;">
  <a href="${href}" style="display:inline-block;padding:11px 22px;font-family:Nunito,Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;color:${INK};text-decoration:none;border-radius:999px;">${esc(label)} &rarr;</a>
</td></tr></table>`

const chip = (t: string, i = 0) => `<td style="background:${i % 2 ? BUTTER : '#ffffff'};border:1px solid ${i % 2 ? BUTTER : '#DDE5DE'};border-radius:14px;padding:11px 14px;font-family:Nunito,Helvetica,Arial,sans-serif;font-size:15px;color:${INK};">${esc(t)}</td>`

function chips(labels: string[]) {
  const rows: string[] = []
  for (let i = 0; i < labels.length; i += 2) {
    rows.push(`<tr>${chip(labels[i], i)}<td style="width:10px;"></td>${labels[i + 1] ? chip(labels[i + 1], i + 1) : '<td></td>'}</tr><tr><td style="height:10px;"></td></tr>`)
  }
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:18px 0 0;">${rows.join('')}</table>`
}

const note = (t: string) => `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:22px 0 0;"><tr><td style="background:${BUTTER};border-radius:14px;padding:13px 16px;font-family:Nunito,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:${BUTTER_INK};">${t}</td></tr></table>`

/** Asked to tick the times they are free. */
export function landlordTimesRequest(o: { firstName: string; applicantFirst: string; link: string }) {
  return band('Video call · one step', `Hello ${esc(o.firstName)}, one quick thing`,
    `${o.applicantFirst} has paid the holding deposit and would like a short video call with you.`)
    + para(`Could you tick the times you are free? You can change them from the same page until ${esc(o.applicantFirst)} picks one.`)
    + button('Choose my times', o.link)
    + note('Your number is only shared once they have picked a time.')
}

/** The applicant has picked a time. */
export function landlordBooked(o: { firstName: string; applicantFirst: string; when: string }) {
  return band('Call booked', `${esc(o.applicantFirst)} is calling at ${esc(o.when)}`,
    'They will call you on video. They have your details and will be expecting you.')
    + para(`If that time is a problem, reply to this email or call the office and we will sort it out.`)
    
}

/** Twenty minutes after the call: how did it go? */
export function landlordFollowUp(o: { firstName: string; applicantFirst: string; link: string }) {
  return band('After the call', `How did it go with ${esc(o.applicantFirst)}?`,
    'One tap and we will take it from there.')
    + para(`Can we proceed with the offer?`)
    + button('Let us know', o.link)
}

/** The applicant asked for other times. */
export function landlordNewTimes(o: { firstName: string; applicantFirst: string; link: string }) {
  return band('New times needed', `${esc(o.applicantFirst)} needs other times`,
    'The times you chose did not work for them.')
    + para(`Could you choose some others? It takes a moment on the same page.`)
    + button('Choose new times', o.link)
}

// ---- Applicant emails (2026 layout: one column, one action, the picture small and centred) ----
export const CALL_IMAGE = 'https://fihjzzxxhprxgjuefgtb.supabase.co/storage/v1/object/public/website/emails/call-illustration.webp'
const F = "font-family:Nunito,Helvetica,Arial,sans-serif;"
const pre = (t: string) => `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(t)}</div>`
const brand = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="${F}font-family:'Baloo 2',Helvetica,Arial,sans-serif;font-size:18px;font-weight:700;color:${INK};">Capital Rooms</td></tr></table>`
const picture = (alt: string) => `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:22px 0 4px;"><tr><td align="center"><img src="${CALL_IMAGE}" alt="${esc(alt)}" width="240" style="display:block;width:240px;max-width:100%;height:auto;border:0;" /></td></tr></table>`
const h1 = (t: string) => `<h1 class="cr-ink" style="${F}margin:18px 0 10px;font-size:26px;line-height:1.2;font-weight:800;color:${INK};text-align:center;">${t}</h1>`
const lead = (t: string) => `<p class="cr-muted" style="${F}margin:0 auto;max-width:440px;font-size:16px;line-height:1.6;color:${MUTED};text-align:center;">${t}</p>`
const cta = (label: string, href: string) => `<table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:26px auto 0;"><tr><td align="center" style="border-radius:999px;background:${INK};"><a href="${href}" style="${F}display:inline-block;padding:14px 30px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">${esc(label)}</a></td></tr></table>`
const foot = (t: string) => `<p style="${F}margin:26px 0 0;font-size:13px;line-height:1.6;color:${MUTED};text-align:center;">${t}</p>`
// The mint of the illustration behind everything; a deep teal card-and-ground in dark mode (where mail apps respect it).
const MINT = '#98ECD5'
const darkStyle = `<style>@media (prefers-color-scheme: dark){.cr-bg{background:#0E2B25 !important}.cr-card{background:#163B33 !important}.cr-ink{color:#EAF7F2 !important}.cr-muted{color:#A8C7BC !important}.cr-chip{background:#21493F !important;color:#EAF7F2 !important}}</style>`
const shellRow = (inner: string) => `${darkStyle}<table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="cr-bg" style="background:${MINT};padding:28px 12px;"><tr><td><table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="cr-card" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:24px;"><tr><td style="padding:28px 26px 30px;">${inner}</td></tr></table></td></tr></table>`

/** Pick a time: the landlord has ticked the times that suit them. */
export function applicantPickTime(o: { firstName: string; landlordFirst: string; link: string; options: string[] }) {
  const list = o.options.map(t => `<tr><td class="cr-chip" style="${F}padding:10px 14px;margin:0 0 8px;background:${SAGE};border-radius:12px;font-size:15px;font-weight:700;color:${INK};text-align:center;">${esc(t)}</td></tr><tr><td style="height:8px;"></td></tr>`).join('')
  return pre(`${o.landlordFirst} has accepted your offer. Pick a time for a short call.`)
    + shellRow(brand + picture('A call is ready to book')
      + h1(`Hi ${esc(o.firstName)}, pick a time to talk`)
      + lead(`${esc(o.landlordFirst)} has accepted your offer, subject to a short informal video call. It takes 5 to 10 minutes, a relaxed chat so you can both see if it feels right before going ahead.`)
      + `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0 0;">${list}</table>`
      + cta('Choose my time', o.link)
      + foot(`If either of you does not wish to go ahead, your holding deposit is refunded in full.`))
}

/** Booked: when, and how to reach the landlord. */
export function applicantBooked(o: { firstName: string; landlordFirst: string; when: string; phone: string }) {
  return pre(`Booked: ${o.when}`)
    + shellRow(brand + picture('Your call is booked')
      + h1(`You're booked in, ${esc(o.firstName)}`)
      + lead(`Your call with ${esc(o.landlordFirst)} is on <strong style="color:${INK};">${esc(o.when)}</strong>.`)
      + `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0 0;"><tr><td style="${F}padding:16px;background:${SAGE};border-radius:14px;text-align:center;font-size:15px;line-height:1.6;color:${INK};">Call <strong>${esc(o.landlordFirst)}</strong> on video at that time, on FaceTime or WhatsApp, using<br><strong style="font-size:18px;">${esc(o.phone)}</strong></td></tr></table>`
      + foot(`Anything come up? Just reply to this email and the office will help.`))
}
