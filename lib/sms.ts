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

export async function sendSms(to: string | null | undefined, body: string): Promise<{ ok: boolean; error?: string }> {
  const num = toE164(to)
  if (!num) return { ok: false, error: 'no valid mobile number' }
  const sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_PHONE_NUMBER
  if (!sid || !token || !from) return { ok: false, error: 'texting is not set up' }
  try {
    await twilio(sid, token).messages.create({ to: num, from, body })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'text failed' }
  }
}
