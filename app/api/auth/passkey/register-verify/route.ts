// Retired 12 Oct 2026. The old "Use Face ID" sign-in was only ever set up for a test machine (localhost), never
// created a session, and listed every stored credential to anyone who asked. Browsers' saved passwords (with Face ID)
// and two-step sign-in (/account) replace it.
import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json({ error: 'Face ID sign-in has been retired — use your password (your phone can fill it in).' }, { status: 410 })
}
