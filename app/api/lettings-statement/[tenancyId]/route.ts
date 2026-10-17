// GET /api/lettings-statement/[tenancyId]
// Generates a Capital Rooms Lettings Statement PDF for a let-only tenancy.
// Pulls tenancy, room, property (bank details + fee), tenant, landlord from DB.

import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { createClient } from '@supabase/supabase-js'
import { lettingsStatementFor } from '@/lib/lettingsStatement/forTenancy'
import { contentDisposition } from '@/lib/contentDisposition'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function GET(
  _req: NextRequest,
  { params: paramsPromise }: { params: Promise<{ tenancyId: string }> }
) {
  if (!(await requireStaff(_req as any))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const params = await paramsPromise
  const result = await lettingsStatementFor(serviceClient(), params.tenancyId)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 404 })
  return new NextResponse(new Uint8Array(result.buffer), {
    status: 200,
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': contentDisposition(result.filename, 'attachment'),
      'Cache-Control':       'no-store',
    },
  })
}
