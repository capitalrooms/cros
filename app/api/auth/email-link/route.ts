// POST /api/auth/email-link { email } — "email me a sign-in link" from the login page. CROS sends the one-time link
// itself (lib/auth/links) to that address only; same answer whether or not the email has an account; at most one per
// address per 2 minutes.
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { validateEmail } from '@/lib/validation'
import { getClientIp } from '@/lib/auditLog'
import { authLink } from '@/lib/auth/links'
import { sendEmail } from '@/lib/sendEmail'

const SAME = { success: true }

export async function POST(request: NextRequest) {
  const { email: raw } = await request.json().catch(() => ({}))
  const email = String(raw ?? '').trim().toLowerCase()
  if (!email || !validateEmail(email)) return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 })
  const s = createServiceClient()
  const since = new Date(Date.now() - 2 * 60_000).toISOString()
  const { data: recent } = await s.from('audit_logs').select('id').eq('action', 'signin_link_requested').eq('details', email).gte('created_at', since).limit(1)
  if (recent?.length) return NextResponse.json(SAME)
  await s.from('audit_logs').insert({ user_id: 'unknown', action: 'signin_link_requested', details: email, ip_address: getClientIp(request.headers) })
  const link = await authLink(s, email, 'magiclink', '/')
  if (link) {
    await sendEmail(email, 'Your Capital Rooms sign-in link', `
      <p style="margin:0 0 22px;"><a href="${link}" style="display:inline-block;background:#181614;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px;">Sign in to Capital Rooms</a></p>
      <p style="margin:0;font-size:13px;color:#57534e;">The link works once and expires within the hour. If you didn’t ask for it, ignore this email.</p>`, { signature: false })
  }
  return NextResponse.json(SAME)
}
