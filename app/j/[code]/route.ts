// /j/<code> — the short job link in contractors' texts (lib/jobs/bookingLink shortCode). Checks it and opens their
// job page (/book/<token>). No sign-in. An unknown code goes to the job page anyway, which says the link isn't active.
import { NextRequest, NextResponse } from 'next/server'
import { fromShortCode } from '@/lib/jobs/bookingLink'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const token = fromShortCode(code) ?? 'invalid'
  return NextResponse.redirect(new URL(`/book/${token}`, req.url), 307)
}
