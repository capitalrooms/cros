// The new tenant's "say hello to your housemates" profile, from their move-in pack (6 Nov 2026 — lib/housemates/profile).
// The pack's token is the key: it only ever reaches the tenant of that pack's tenancy.
//   GET                         → { answers, visible, photoUrl }
//   POST { answers, visible }   → saved
//   PUT  (the photo, raw bytes) → saved, replacing any earlier one;  DELETE → photo removed
import { NextRequest, NextResponse } from 'next/server'
import { svc } from '@/lib/movein/email'
import { packByToken } from '@/lib/movein/public'
import { profileFor, saveAnswers, savePhoto, removePhoto, MAX_PHOTO } from '@/lib/housemates/profile'

export const dynamic = 'force-dynamic'

async function personFor(token: string): Promise<string | null> {
  const { pack } = await packByToken(token)
  if (!pack || pack.status === 'withdrawn') return null
  const { data } = await svc().from('tenancies').select('person_id, let_cancelled_at').eq('id', pack.tenancy_id).maybeSingle() as { data: any }
  return data && !data.let_cancelled_at ? data.person_id : null
}
const nope = () => NextResponse.json({ error: 'This link isn’t valid.' }, { status: 404 })

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const personId = await personFor((await params).token)
  if (!personId) return nope()
  const p = await profileFor(svc() as any, personId, 1)
  const { photo: _p, ...answers } = p.answers
  return NextResponse.json({ answers, visible: p.visible, photoUrl: p.photoUrl })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const personId = await personFor((await params).token)
  if (!personId) return nope()
  const b = await req.json().catch(() => ({}))
  try { await saveAnswers(svc() as any, personId, b.answers && typeof b.answers === 'object' ? b.answers : {}, b.visible !== false) }
  catch (e: any) { return NextResponse.json({ error: e?.message ?? 'Couldn’t save' }, { status: 500 }) }
  return NextResponse.json({ ok: true })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const personId = await personFor((await params).token)
  if (!personId) return nope()
  if (Number(req.headers.get('content-length') ?? 0) > MAX_PHOTO) return NextResponse.json({ error: 'That photo is too large — please choose a smaller one' }, { status: 413 })
  const bytes = Buffer.from(await req.arrayBuffer())
  try { await savePhoto(svc() as any, personId, bytes) }
  catch (e: any) { return NextResponse.json({ error: e?.message ?? 'Couldn’t save the photo' }, { status: 400 }) }
  const p = await profileFor(svc() as any, personId, 1)
  return NextResponse.json({ ok: true, photoUrl: p.photoUrl })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const personId = await personFor((await params).token)
  if (!personId) return nope()
  await removePhoto(svc() as any, personId)
  return NextResponse.json({ ok: true })
}
