// POST /api/admin/signature-card { name, title, phone, email } → { url } — the sealed address of a reply signature
// drawn as a picture (lib/brand/signatureCard), for Settings › Email signatures. Office staff only.
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/portalAuth'
import { signatureCardUrl } from '@/lib/brand/signatureCard'
import { SIGNATURE_ASSET_BASE } from '@/lib/brand/signature'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  if (!(await requireStaff(req))) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const p = { name: String(b.name ?? ''), title: String(b.title ?? ''), phone: String(b.phone ?? ''), email: String(b.email ?? '') }
  if (!p.name.trim() || !p.phone.trim() || !p.email.trim()) return NextResponse.json({ error: 'Name, phone and email are needed.' }, { status: 400 })
  if (p.name.length > 48 || p.phone.length > 30 || p.email.length > 80) return NextResponse.json({ error: 'One of those is too long for a signature.' }, { status: 400 })
  return NextResponse.json({ url: signatureCardUrl(p, SIGNATURE_ASSET_BASE) })
}
