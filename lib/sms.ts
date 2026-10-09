// Text messages through Twilio. Server only. Returns whether it went — never throws, so a failed text
// never stops the thing that sent it (the caller records the outcome).
import twilio from 'twilio'

/** UK numbers to the +44 form Twilio needs; null if it doesn't look like a phone number. */
export function toE164(raw: string | null | undefined): string | null {
  const d = String(raw ?? '').replace(/[^\d+]/g, '')
  if (!d) return null
  let n = d
  if (n.startsWith('00')) n = '+' + n.slice(2)
  else if (n.startsWith('0')) n = '+44' + n.slice(1)
  else if (!n.startsWith('+')) n = '+44' + n
  return /^\+\d{10,15}$/.test(n) ? n : null
}

export const smsConfigured = () => !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && (process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_PHONE_NUMBER))

// The name texts can show instead of the number (Harry, 9 Oct: "CAPITAL RMS"; 11 characters is the most allowed).
// Nobody can reply to a text from a name, so only texts that never need a reply use it ({ asName: true }) — anything
// asking for Y/N (notify-job-raised) stays on the number, which the inbound webhook reads.
export const SENDER_NAME = (process.env.TWILIO_SENDER_NAME || 'CAPITAL RMS').slice(0, 11)

export async function sendSms(to: string | null | undefined, body: string, opts: { asName?: boolean } = {}): Promise<{ ok: boolean; error?: string }> {
  const num = toE164(to)
  if (!num) return { ok: false, error: 'no valid mobile number' }
  const sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_PHONE_NUMBER
  if (!sid || !token || !from) return { ok: false, error: 'texting is not set up' }
  const client = twilio(sid, token)
  if (opts.asName && num.startsWith('+44')) {
    // UK only; if Twilio won't send from the name (not switched on for the account), fall back to the number
    try { await client.messages.create({ to: num, from: SENDER_NAME, body }); return { ok: true } } catch { /* use the number */ }
  }
  try {
    await client.messages.create({ to: num, from, body })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'text failed' }
  }
}
