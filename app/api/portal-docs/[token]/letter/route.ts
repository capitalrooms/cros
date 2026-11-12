// GET /api/portal-docs/<token>/letter — the letter of authority, filled in, as a PDF to print and sign.
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requestByToken, letterPdf } from '@/lib/portalDocs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const r = await requestByToken(createServiceClient() as any, (await params).token)
  if (!r) return NextResponse.json({ error: 'This link isn’t valid' }, { status: 404 })
  const pdf = await letterPdf({ landlord: r.landlord, address: r.address })
  return new NextResponse(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="Letter of authority.pdf"' } })
}
