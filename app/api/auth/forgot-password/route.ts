// POST /api/auth/forgot-password { email } — Supabase emails a reset link to that address (and only there).
// Never returns the link, never says whether the email has an account, and needs no database lookup — so it
// works even when the data API is down. The link opens /auth/reset-password, which sets the new password.
// (Replaces an older version that showed the reset link on screen to whoever typed the email — anyone could
// have reset anyone's password — and kept its codes in server memory, which Vercel clears.)
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validateEmail } from '@/lib/validation'
import { logAudit, getClientIp } from '@/lib/auditLog'

const SAME = { success: true, message: 'If that email has a CROS account, a reset link is on its way. Check your inbox (and spam).' }

export async function POST(request: NextRequest) {
  const { email } = await request.json().catch(() => ({}))
  if (!email || !validateEmail(String(email))) return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 })
  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin
  const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
  const { error } = await auth.auth.resetPasswordForEmail(String(email).trim().toLowerCase(), { redirectTo: `${origin}/auth/reset-password` })
  if (error) console.error('forgot-password:', error.message)   // rate limits etc. — the same answer either way
  await logAudit({ userId: 'unknown', action: 'password_reset_requested', details: `Reset requested for ${String(email).trim().toLowerCase()}`, ipAddress: getClientIp(request.headers) }).catch(() => null)
  return NextResponse.json(SAME)
}
