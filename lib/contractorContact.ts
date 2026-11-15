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
import { createServiceClient } from '@/lib/supabase'
import { insertNotifications } from '@/lib/serverNotify'
import { bookingLink } from '@/lib/jobs/bookingLink'

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

export async function tellContractor(p: any, personId: string, raw: ContractorMessage): Promise<{ via: string[]; error?: string }> {
  const via: string[] = []; const errs: string[] = []
  // texts and emails open their own job page — no sign-in needed (app/book/[token]: book, on my way, I'm here, running
  // late, done, ask the tenants). A link to the app's job page only works signed in, so it's swapped here, once, for
  // every sender (15 Nov 2026). App notifications (msg.url) still open the app.
  const msg = { ...raw }
  const appJob = /https?:\/\/[^\s"'<>]+\/contractor\/job\/([0-9a-f-]{36})(?:\?[^\s"'<>]*)?/gi
  const swap = (v?: string) => v?.replace(appJob, (_m, id: string) => bookingLink(id, personId))
  msg.text = swap(msg.text)!; msg.link = swap(msg.link)!; if (msg.emailBodyHtml) msg.emailBodyHtml = swap(msg.emailBodyHtml)
  const { bySms, byPush, byEmail } = contactChoice(p)
  // always in their app too (14 Nov 2026 — a new job left nothing in the app: no bell, no "new job" card). The inbox
  // entry is what the contractor home shows as "New job" and the bell counts, whatever else reaches them.
  await insertNotifications(createServiceClient() as any, [personId], { title: msg.title, body: msg.body, type: 'maintenance', link: msg.url } as any).then(() => via.push('app inbox'), () => null)
  if (bySms) {
    if (!p?.phone) errs.push('no mobile number')
    else { const r = await sendSms(p.phone, msg.text, { asName: true }); if (r.ok) via.push('text'); else errs.push(`text failed: ${r.error}`) }
  }
  if (byPush) { const n = await sendServerPush({ personId, title: msg.title, body: msg.body, url: msg.url, tag: msg.tag }).catch(() => 0); if (n) via.push('app') }
  if (byEmail) {
    if (!p?.email) errs.push('no email address')
    else {
      const html = msg.emailBodyHtml ?? `<p>${esc(msg.text).replace(/\n/g, '<br>')}</p><p><a href="${msg.link}">Open it</a></p>`
      const r = await sendEmail(p.email, msg.emailSubject ?? `${msg.title.replace(/^[^A-Za-z]+/, '')} — Capital Rooms`, html, { kind: 'contractor-message', signature: false })
      if (r.ok) via.push('email'); else errs.push(`email failed: ${r.error}`)
    }
  }
  if (!via.some(v => v !== 'app inbox') && !bySms && p?.phone) {
    const r = await sendSms(p.phone, msg.text, { asName: true })
    if (r.ok) via.push('text (nothing else reached them)'); else errs.push(`text failed: ${r.error}`)
  }
  return { via, error: errs.join('; ') || (via.length ? undefined : 'no way to reach them') }
}
