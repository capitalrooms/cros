// The landlord's private improvement proposal (migration 273 — lib/house/proposals). The token is the key.
//   GET  → the spaces and their designs (short-lived image links)
//   POST { spaces: { [id]: { choice, note } }, budget, comments } → saved; the office is emailed
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { proposalByToken, proposalView, answerProposal } from '@/lib/house/proposals'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const s = createServiceClient()
  const p = await proposalByToken(s as any, (await params).token)
  if (!p) return NextResponse.json({ error: 'This link has expired or isn’t valid — please ask us for a new one.' }, { status: 404 })
  return NextResponse.json(await proposalView(s as any, p))
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const s = createServiceClient()
  const p = await proposalByToken(s as any, (await params).token)
  if (!p) return NextResponse.json({ error: 'This link has expired or isn’t valid.' }, { status: 404 })
  const b = await req.json().catch(() => ({}))
  return NextResponse.json({ ok: true, answers: await answerProposal(s as any, p, b, req) })
}
