// GET the landlord's times page state; POST save times, or the answer after the call. Token is the only key.
import { landlordState, landlordSaveTimes, landlordOutcome } from '@/lib/calls/server'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const st = await landlordState((await params).token)
  return st ? Response.json(st) : Response.json({ error: 'This link is not valid.' }, { status: 404 })
}
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const tok = (await params).token
  const b = await req.json().catch(() => ({})) as any
  const out = b.action === 'outcome'
    ? await landlordOutcome(tok, b.outcome, String(b.note || ''))
    : await landlordSaveTimes(tok, Array.isArray(b.slots) ? b.slots.map(String) : [])
  if ('error' in out) return Response.json({ error: out.error }, { status: out.status })
  return Response.json({ ok: true })
}
