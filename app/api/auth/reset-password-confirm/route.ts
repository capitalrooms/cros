// Retired: reset links now come from Supabase by email and the new password is saved on /auth/reset-password.
// The old one-time codes lived in server memory (lost between requests) and could be handed to anyone.
import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json({ error: 'This reset link is out of date. Use “Forgot password” on the login page to get a new one by email.' }, { status: 410 })
}
