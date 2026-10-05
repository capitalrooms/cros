// POST /api/auth/forgot-password { email } — CROS emails a one-time reset link (lib/auth/links) to that address only.
// Never returns the link, never says whether the email has an account. At most one email per address per 2 minutes.
// (Older versions showed the link on screen to whoever asked, then relied on Supabase's own email — whose Site URL
// sent people to localhost.)
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { validateEmail } from '@/lib/validation'
import { getClientIp } from '@/lib/auditLog'
import { authLink } from '@/lib/auth/links'
import { sendEmail } from '@/lib/sendEmail'

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
  const link = await authLink(s, email, 'recovery')
  if (link) {
    const r = await sendEmail(email, 'Reset your Capital Rooms password', `
      <p style="margin:0 0 14px;font-size:15px;color:#1c1917;">Someone asked to reset the password for this Capital Rooms account.</p>
      <p style="margin:0 0 22px;"><a href="${link}" style="display:inline-block;background:#181614;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px;">Choose a new password</a></p>
      <p style="margin:0 0 8px;font-size:13px;color:#57534e;">The link works once and expires within the hour.</p>
      <p style="margin:0;font-size:13px;color:#57534e;">If this wasn’t you, ignore this email — your password stays as it is.</p>`, { signature: false })
    if (!r.ok) console.error('forgot-password email:', r.error)
  }
  return NextResponse.json(SAME)
}
