// How CROS reaches a contractor — the one place that decides, for emergencies (lib/emergencies/engine) and ordinary
// jobs (/api/notify-job-raised). Each contractor's choice is kept on their person record (migration 219):
//   people.notify_by_sms   text messages   — on unless turned off
//   people.notify_by_push  app notification — on unless turned off
//   people.notify_by_email email           — on unless turned off (contractors), set on the Emergencies screen or
//                                            their profile, and changed whenever they ask
// If none of their chosen ways actually reached them (e.g. app only, but the app isn't on their phone), CROS texts
// anyway when it has a mobile, so a job or an emergency never goes unseen. Texts come from the name CAPITAL RMS, so
// never ask a contractor to reply to one — they answer from the link.
import { sendSms } from '@/lib/sms'
import { sendServerPush } from '@/lib/serverPush'
import { sendEmail } from '@/lib/sendEmail'

const esc = (v: string) => v.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Record<string, string>)[c])

/** What a contractor has chosen; text, app and email are all on unless turned off. */
export const contactChoice = (p: any) => ({ bySms: p?.notify_by_sms !== false, byPush: p?.notify_by_push !== false, byEmail: p?.notify_by_email !== false })

export interface ContractorMessage {
  text: string           // the text message (and the email, unless emailBodyHtml is given)
  title: string          // app notification title, and the email subject
  body: string           // app notification line
  url: string            // where the app notification opens (a path on CROS)
  link: string           // the full link for the email button
  tag: string
  emailSubject?: string
  emailBodyHtml?: string // inner HTML only — sendEmail adds the house style
}

export async function tellContractor(p: any, personId: string, msg: ContractorMessage): Promise<{ via: string[]; error?: string }> {
  const via: string[] = []; const errs: string[] = []
  const { bySms, byPush, byEmail } = contactChoice(p)
  if (bySms) {
    if (!p?.phone) errs.push('no mobile number')
    else { const r = await sendSms(p.phone, msg.text, { asName: true }); if (r.ok) via.push('text'); else errs.push(`text failed: ${r.error}`) }
  }
  if (byPush) { const n = await sendServerPush({ personId, title: msg.title, body: msg.body, url: msg.url, tag: msg.tag }).catch(() => 0); if (n) via.push('app') }
  if (byEmail) {
    if (!p?.email) errs.push('no email address')
    else {
      const html = msg.emailBodyHtml ?? `<p>${esc(msg.text).replace(/\n/g, '<br>')}</p><p><a href="${msg.link}">Open it</a></p>`
      const r = await sendEmail(p.email, msg.emailSubject ?? `${msg.title.replace(/^[^A-Za-z]+/, '')} — Capital Rooms`, html, { signature: false })
      if (r.ok) via.push('email'); else errs.push(`email failed: ${r.error}`)
    }
  }
  if (!via.length && !bySms && p?.phone) {
    const r = await sendSms(p.phone, msg.text, { asName: true })
    if (r.ok) via.push('text (nothing else reached them)'); else errs.push(`text failed: ${r.error}`)
  }
  return { via, error: errs.join('; ') || (via.length ? undefined : 'no way to reach them') }
}
