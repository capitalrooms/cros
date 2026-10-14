// POST /api/auth/forgot-password { email } — CROS emails the standard sign-in email (lib/auth/accounts) to that address only:
// a one-time reset link, or — for someone CROS knows who has no login yet — the set-up email.
// Never returns the link, never says whether the email has an account. At most one email per address per 2 minutes.
// (Older versions showed the link on screen to whoever asked, then relied on Supabase's own email — whose Site URL
// sent people to localhost.)
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { validateEmail } from '@/lib/validation'
import { getClientIp } from '@/lib/auditLog'
import { authUsersByEmail, sendAccountEmail } from '@/lib/auth/accounts'

const SIGN_IN_ROLES = ['tenant', 'landlord', 'contractor', 'cleaner', 'administrator', 'admin', 'lettings']
const SAME = { success: true, message: 'If that email has a CROS account, a reset link is on its way. Check your inbox (and spam).' }

export async function POST(request: NextRequest) {
  const { email: raw } = await request.json().catch(() => ({}))
  const email = String(raw ?? '').trim().toLowerCase()
  if (!email || !validateEmail(email)) return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 })
  const s = createServiceClient()
  const since = new Date(Date.now() - 2 * 60_000).toISOString()
  const { data: recent } = await s.from('audit_logs').select('id').eq('action', 'password_reset_requested').eq('details', email).gte('created_at', since).limit(1)
  if (recent?.length) return NextResponse.json(SAME)
  await s.from('audit_logs').insert({ user_id: 'unknown', action: 'password_reset_requested', details: email, ip_address: getClientIp(request.headers) })
  // the standard sign-in email (lib/auth/accounts), same for every kind of user: a reset link when they have a login;
  // the set-up email when CROS knows them but they've never had (or used) one; nothing for a turned-off login or a stranger
  const users = await authUsersByEmail(s)
  const { data: person } = await s.from('people').select('email, role, salutation, first_name, last_name')
    .ilike('email', email).in('role', SIGN_IN_ROLES).order('created_at').limit(1).maybeSingle()
  if (person || users.has(email)) {
    const r = await sendAccountEmail(s, { ...(person ?? {}), email }, request, users, 'self')
    if (!r.ok) console.error('forgot-password email:', r.error)
  }
  return NextResponse.json(SAME)
}
