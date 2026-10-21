// GET /api/landlord/documents — the signed-in landlord's documents (lib/landlord/documents); the office viewing as a
// landlord passes ?as=<personId>.
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { documentsFor, landlordFor } from '@/lib/landlord/documents'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const id = await landlordFor(req)
  if (!id) return NextResponse.json({ error: 'Please sign in again' }, { status: 401 })
  return NextResponse.json(await documentsFor(createServiceClient() as any, id))
}
