// The email a landlord gets for one update (lib/landlordUpdates/updates): the message as written, the details as a
// table, and — when there's a private page — the button to it with the date it stops working. Used by the send
// route and by previews, so what Harry sees is what the landlord gets.
import { buildEmail, tableRow, ctaButton } from '@/lib/emailWrapper'
import type { EmailSender } from '@/lib/email/sender'

const esc = (v: string) => v.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

type UpdateEmail = { stage: string; message: string; facts: { label: string; value: string }[]; link: string | null; until: string | null }

/** The full email, in the house wrapper (the sender's signature at the foot). */
export async function landlordUpdateHtml(o: UpdateEmail & { req?: Request | null; sender?: EmailSender }): Promise<string> {
  return buildEmail(landlordUpdateBody(o), { req: o.req ?? null, sender: o.sender })
}

/** Just the inside, for senders that wrap it themselves (lib/sendEmail sendEmail). */
export function landlordUpdateBody(o: UpdateEmail): string {
  // the details and the button sit between the letter and its closing lines ("Should you need anything…", "Kind regards,")
  const paras = esc(o.message).split(/\n{2,}/)
  const closing: string[] = []
  while (paras.length > 1 && /^(kind regards|best wishes|regards|many thanks|yours|should you|if you have any|please (do not|don’t|don't) hesitate)/i.test(paras[paras.length - 1])) closing.unshift(paras.pop()!)
  const signOff = closing.map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('')
  return `
    ${paras.map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('')}
    ${o.facts.length ? `<table style="width:100%;border-collapse:collapse;margin:14px 0 18px;">${o.facts.map(f => tableRow(esc(f.label), esc(f.value))).join('')}</table>` : ''}
    ${o.link ? ctaButton(o.stage === 'offer' ? 'Review the offer' : 'View the tenant’s documents', o.link) : ''}
    ${o.link && o.until ? `<p style="color:#78716c;font-size:12.5px;text-align:center;margin-top:-10px;">This private link works until ${o.until}.</p>` : ''}
    ${signOff}`
}
