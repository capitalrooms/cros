// GET the applicant's times; POST pick a time, or ask for new ones. Token is the only key.
import { applicantState, applicantPick, applicantCannot } from '@/lib/calls/server'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const st = await applicantState((await params).token)
  return st ? Response.json(st) : Response.json({ error: 'This link is not valid.' }, { status: 404 })
}
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const tok = (await params).token
  const b = await req.json().catch(() => ({})) as any
  const out = b.action === 'cannot' ? await applicantCannot(tok) : await applicantPick(tok, String(b.slot || ''))
  if ('error' in out) return Response.json({ error: out.error }, { status: out.status })
  return Response.json({ ok: true })
}
