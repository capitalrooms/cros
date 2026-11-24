// Landlord emails for the video call (24 Nov 2026). Designed bodies in the house colours; the house shell
// (logo, footer, signature) is added by buildEmail. Pure HTML, tables for mail clients, inline styles only.

const INK = '#17332B', GOLD = '#C4922A', GOLD_LIGHT = '#F2B84B', IVORY = '#F6F3EC', SAGE = '#E3ECE5', MUTED = '#4E6158', BUTTER = '#FDF1D8', BUTTER_INK = '#7A5410'
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Record<string, string>)[c]!)

function band(eyebrow: string, headline: string, sub: string) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-radius:18px;background:${INK};">
  <tr><td style="padding:30px 28px;font-family:Nunito,Helvetica,Arial,sans-serif;">
    <p style="margin:0 0 10px;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:${GOLD_LIGHT};">${esc(eyebrow)}</p>
    <h1 style="margin:0 0 10px;font-family:'Baloo 2',Helvetica,Arial,sans-serif;font-size:28px;line-height:1.15;font-weight:700;color:#ffffff;">${esc(headline)}</h1>
    <p style="margin:0;font-size:15px;line-height:1.55;color:#C9D6CC;">${esc(sub)}</p>
  </td></tr></table>`
}

const para = (t: string) => `<p style="margin:18px 0 0;font-family:Nunito,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:${INK};">${t}</p>`

const button = (label: string, href: string) => `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0 0;"><tr><td style="border-radius:999px;background:${GOLD};">
  <a href="${href}" style="display:inline-block;padding:14px 28px;font-family:Nunito,Helvetica,Arial,sans-serif;font-size:16px;font-weight:800;color:${INK};text-decoration:none;border-radius:999px;">${esc(label)}</a>
</td></tr></table>`

const chip = (t: string) => `<td style="background:${SAGE};border-radius:12px;padding:12px 14px;font-family:Nunito,Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;color:${INK};">${esc(t)}</td>`

function chips(labels: string[]) {
  const rows: string[] = []
  for (let i = 0; i < labels.length; i += 2) {
    rows.push(`<tr>${chip(labels[i])}<td style="width:10px;"></td>${labels[i + 1] ? chip(labels[i + 1]) : '<td></td>'}</tr><tr><td style="height:8px;"></td></tr>`)
  }
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:18px 0 0;">${rows.join('')}</table>`
}

const note = (t: string) => `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:22px 0 0;"><tr><td style="background:${BUTTER};border-radius:12px;padding:14px 16px;font-family:Nunito,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:${BUTTER_INK};">${t}</td></tr></table>`

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
