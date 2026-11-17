// GET /api/planner/img?b&p&s — a planner photo (lib/planner/img): checks our signature, then sends you to a 1-hour link.
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { checkImg } from '@/lib/planner/img'

export const dynamic = 'force-dynamic'
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams, b = q.get('b') ?? '', p = q.get('p') ?? '', s = q.get('s') ?? ''
  if (!checkImg(b, p, s)) return new NextResponse('Not found', { status: 404 })
  const { data } = await createServiceClient().storage.from(b).createSignedUrl(p, 3600)
  if (!data?.signedUrl) return new NextResponse('That photo is no longer on file', { status: 404 })
  return NextResponse.redirect(data.signedUrl, { headers: { 'Cache-Control': 'private, max-age=3000' } })
}
