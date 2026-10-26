// GET /api/jobs/<id>/photos — the job's photos for the contractor doing it (26 Oct 2026): the tenant's and any the office
// added, as short-lived private links. Their own before/after photos show on the job already. The office, or the
// contractor the job is assigned to (lib/portalAuth canWorkOnTicket).
import { NextRequest, NextResponse } from 'next/server'
import { requireSignedIn, canWorkOnTicket } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { signedLinkFor } from '@/lib/files/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!(await canWorkOnTicket(await requireSignedIn(req), id))) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { data: files } = await createServiceClient().from('attachments').select('id, file_name, storage_url, attachment_type').eq('ticket_id', id).eq('attachment_type', 'photo').order('created_at')
  const photos = (await Promise.all(((files ?? []) as any[]).filter(f => f.storage_url).map(async f => ({
    id: f.id, url: await signedLinkFor(f.storage_url, 3600),
    from: /^\[office\]/.test(f.file_name ?? '') ? 'Office' : /^\[appliance label\]/.test(f.file_name ?? '') ? 'Appliance label' : 'Tenant',
  })))).filter(p => p.url)
  return NextResponse.json({ photos })
}
