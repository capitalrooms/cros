// POST { action:'add', phone } texts a code; POST { action:'confirm', phone, code } makes it the preferred number.
import { NextRequest, NextResponse } from 'next/server'
import { requireSignedIn } from '@/lib/portalAuth'
import { addPhone, confirmPhone } from '@/lib/phones'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function POST(req: NextRequest) {
  const c = await requireSignedIn(req)
  if (!c || c.role !== 'tenant' || c.viewingAsBy) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const b = await req.json().catch(() => ({})) as any
  const out = b.action === 'confirm' ? await confirmPhone(c.personId, String(b.phone || ''), String(b.code || '')) : await addPhone(c.personId, String(b.phone || ''))
  if ('error' in out) return NextResponse.json({ error: out.error }, { status: out.status })
  return NextResponse.json({ ok: true, phone: (out as any).phone ?? null })
}
