// Retired 12 Oct 2026 (audit): nothing in CROS called it, and it ran the AI on any file for anyone, signed in or not.
// Document reading lives in the AI upload and Capture routes, which check who is asking.
import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json({ error: 'This has been retired — use AI upload in CROS.' }, { status: 410 })
}
