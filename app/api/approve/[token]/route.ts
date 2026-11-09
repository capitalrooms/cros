// The landlord's answer from /approve/<token> (public — the token is the key). Migration 275.
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { decideApproval } from '@/lib/repairs/approvals'
import { senderFor } from '@/lib/email/sender'

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const b = await req.json().catch(() => ({}))
  const decision = b.decision === 'approve' ? 'approve' : b.decision === 'decline' ? 'decline' : null
  if (!decision) return NextResponse.json({ error: 'Choose approve or hold off.' }, { status: 400 })
  try {
    await decideApproval(createServiceClient() as any, token, decision, typeof b.quoteId === 'string' ? b.quoteId : null, String(b.note ?? '').slice(0, 1000), await senderFor(req))
    return NextResponse.json({ ok: true })
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'That didn’t work — please call us.' }, { status: 400 }) }
}
