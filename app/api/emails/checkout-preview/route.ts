// POST → the tenant checkout email as HTML, built on the server (the email footer needs the sender's
// details and the house font, which only exist server-side). Used by the Set On Notice modal's preview.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { buildCheckoutEmail, type CheckoutEmailData } from '@/lib/checkoutEmailTemplate'
import { senderFor } from '@/lib/email/sender'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const data = await req.json().catch(() => null) as CheckoutEmailData | null
  if (!data?.moveOutDate || !data.tenantName) return NextResponse.json({ error: 'Missing move-out details' }, { status: 400 })
  try {
    const html = await buildCheckoutEmail(data, await senderFor(req))
    return NextResponse.json({ html })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not build the email' }, { status: 500 })
  }
}
