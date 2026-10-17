// GET /api/lettings/listing?roomId= — a room's listing for the lettings / office view, with its share link
// (lib/listing). Office staff only.
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { loadListing, listingPath } from '@/lib/listing/listing'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const roomId = req.nextUrl.searchParams.get('roomId') ?? ''
  if (!/^[0-9a-f-]{36}$/i.test(roomId)) return NextResponse.json({ error: 'roomId required' }, { status: 400 })
  const listing = await loadListing(createServiceClient() as any, roomId)
  if (!listing) return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://cros-sigma.vercel.app'
  return NextResponse.json({ listing, shareUrl: `${base}${listingPath(roomId)}` })
}
