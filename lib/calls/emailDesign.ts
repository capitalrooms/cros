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
