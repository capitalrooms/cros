import { NextResponse } from 'next/server'
import { getCommsLive } from '@/lib/comms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Read-only: is tenant/applicant messaging live? Used by the admin banner. */
export async function GET() {
  return NextResponse.json({ live: await getCommsLive() })
}
