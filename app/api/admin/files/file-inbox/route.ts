// POST /api/admin/files/file-inbox { path, propertyId, fileName } → { url }
// Filing an emailed document copies it out of the private inbox into the property's documents.
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/adminAuth'
import { fileIntoProperty } from '@/lib/files/storage'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  if (!b.path || String(b.path).includes('..')) return NextResponse.json({ error: 'No document given' }, { status: 400 })
  try {
    return NextResponse.json({ url: await fileIntoProperty(createServiceClient(), String(b.path), b.propertyId || null, b.fileName || null) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not file the document' }, { status: 500 })
  }
}
