// POST /api/admin/move-in/[tenancyId]/slot — put a file already on the house into a missing certificate slot in the
// move-in pack (Harry, 24 Nov 2026: "insert file into the predetermined name, e.g. put epc in if it is missing").
// The file is filed under that certificate's type, so the pack and compliance both pick it up, and its dates are read.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { svc } from '@/lib/movein/email'
import { loadPackContext } from '@/lib/movein/pack'
import { readCertDocument } from '@/lib/compliance/certFromDocument'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const SLOT_TYPE: Record<string, string> = { gas: 'gas_safety_certificate', eicr: 'electrical_eicr', epc: 'epc' }

export async function POST(req: NextRequest, { params }: { params: Promise<{ tenancyId: string }> }) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { tenancyId } = await params
  const b = await req.json().catch(() => ({}))
  const type = SLOT_TYPE[String(b.slotKey ?? '')]
  if (!type) return NextResponse.json({ error: 'That certificate can’t be filed this way.' }, { status: 400 })
  const url = String(b.storageUrl ?? '')
  if (!url) return NextResponse.json({ error: 'Choose a file.' }, { status: 400 })
  const s = svc()
  const ctx = await loadPackContext(s, tenancyId, { agreement: null })
  if (!ctx) return NextResponse.json({ error: 'Tenancy not found' }, { status: 404 })
  const propertyId = (ctx.property as any).propertyId ?? ctx.property.id
  const { data: row } = await s.from('property_documents').select('id').eq('property_id', propertyId).eq('storage_url', url).limit(1).maybeSingle()
  if (!row) return NextResponse.json({ error: 'That file isn’t on this house.' }, { status: 404 })
  const { error } = await s.from('property_documents').update({ document_type: type }).eq('id', row.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const { data: doc } = await s.from('property_documents').select('property_id, document_type, storage_url, file_name').eq('id', row.id).maybeSingle()
  const certificate = doc ? await readCertDocument(s, doc as any).catch((e: any) => ({ updated: false, why: e?.message })) : null
  return NextResponse.json({ ok: true, certificate })
}
