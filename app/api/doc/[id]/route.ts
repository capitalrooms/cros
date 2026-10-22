// GET /api/doc/<property document id>?s=<signature> — a house document from an email, by a link that never expires
// (lib/files/stableLink): checks the signature, then redirects to a fresh 5-minute private link.
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { validDocSignature } from '@/lib/files/stableLink'
import { signedLinkFor } from '@/lib/files/server'

export const dynamic = 'force-dynamic'

const gone = () => new NextResponse('<!doctype html><meta name=viewport content="width=device-width"><body style="font-family:sans-serif;padding:32px;max-width:520px"><h2>This document isn’t available</h2><p>It may have been replaced by a newer one. Please contact Capital Rooms and we’ll send you the current copy.</p></body>', { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } })

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id) || !validDocSignature(id, req.nextUrl.searchParams.get('s'))) return gone()
  const { data } = await createServiceClient().from('property_documents').select('storage_url').eq('id', id).maybeSingle()
  const url = await signedLinkFor((data as any)?.storage_url, 300)
  return url ? NextResponse.redirect(url, 302) : gone()
}
