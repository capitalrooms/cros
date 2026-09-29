// Who an email comes from. Rule (agreed 27 Sep 2026): an email is sent as the admin user who triggered it,
// so replies land in the inbox they're signed into. Automatic emails (cron jobs, webhooks, tenant-triggered)
// come from the main administrator. The sender's details also fill the house-style footer.
import { createClient } from '@supabase/supabase-js'
import type { SignaturePerson } from '@/lib/brand/signature'

export interface EmailSender extends SignaturePerson {
  from: string       // header value, e.g. "Harry at Capital Rooms <harry@capitalrooms.co.uk>"
  replyTo: string
}

const SENDABLE_DOMAIN = '@capitalrooms.co.uk'   // verified with Resend — we can only send as addresses here
const STAFF_ROLES = ['administrator', 'admin', 'lettings']
const OFFICE_PHONE = '0207 112 9163'
const FALLBACK: EmailSender = {
  name: 'Capital Rooms', title: 'Capital Rooms', phone: OFFICE_PHONE, email: 'management@capitalrooms.co.uk',
  from: 'Capital Rooms <management@capitalrooms.co.uk>', replyTo: 'management@capitalrooms.co.uk',
}

const svc = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
})

interface PersonRow { first_name: string | null; last_name: string | null; email: string | null; job_title: string | null; direct_phone: string | null }

function toSender(p: PersonRow): EmailSender {
  const email = (p.email ?? '').trim().toLowerCase()
  if (!email) return FALLBACK
  const name = [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || 'Capital Rooms'
  const first = (p.first_name ?? '').trim() || name
  const display = `${first.replace(/["<>]/g, '')} at Capital Rooms`
  const ours = email.endsWith(SENDABLE_DOMAIN)
  return {
    name,
    title: (p.job_title ?? '').trim() || 'Capital Rooms',
    phone: (p.direct_phone ?? '').trim() || OFFICE_PHONE,
    email,
    from: ours ? `${display} <${email}>` : `${display} <${FALLBACK.email}>`,
    replyTo: email,
  }
}

let cached: { at: number; sender: EmailSender } | null = null

/** The main administrator — sender for anything no signed-in person triggered. */
export async function defaultSender(): Promise<EmailSender> {
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.sender
  try {
    const { data } = await svc().from('people')
      .select('first_name, last_name, email, job_title, direct_phone')
      .in('role', ['administrator', 'admin']).order('created_at', { ascending: true }).limit(1).maybeSingle()
    const sender = data ? toSender(data) : FALLBACK
    cached = { at: Date.now(), sender }
    return sender
  } catch {
    return FALLBACK
  }
}

/** The signed-in staff member behind this request (Bearer token), or the main administrator. */
export async function senderFor(req?: Request | null): Promise<EmailSender> {
  const token = req?.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (token) {
    try {
      const client = svc()
      const { data: { user } } = await client.auth.getUser(token)
      if (user?.email) {
        const { data } = await client.from('people')
          .select('first_name, last_name, email, job_title, direct_phone, role')
          .ilike('email', user.email).maybeSingle()
        if (data && STAFF_ROLES.includes(data.role)) return toSender(data)
      }
    } catch { /* fall through to the default */ }
  }
  return defaultSender()
}

/** `from` + `reply_to` for a raw Resend payload. */
export async function senderFields(req?: Request | null): Promise<{ from: string; reply_to: string }> {
  const s = await senderFor(req)
  return { from: s.from, reply_to: s.replyTo }
}

/** `from` + `replyTo` for the Resend SDK (resend.emails.send). */
export async function senderFieldsSdk(req?: Request | null): Promise<{ from: string; replyTo: string }> {
  const s = await senderFor(req)
  return { from: s.from, replyTo: s.replyTo }
}
