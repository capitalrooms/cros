// GET /api/landlord/expenses — the signed-in landlord's costs by type over the years (lib/landlord/expenseHistory);
// the office viewing as a landlord passes ?as=<personId>.
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { landlordFor } from '@/lib/landlord/documents'
import { expenseHistory } from '@/lib/landlord/expenseHistory'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const id = await landlordFor(req)
  if (!id) return NextResponse.json({ error: 'Please sign in again' }, { status: 401 })
  return NextResponse.json(await expenseHistory(createServiceClient() as any, id))
}
