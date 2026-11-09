// The signed-in tenant's own "say hello" profile (9 Nov 2026): answers + bio, a photo or an avatar, and whether
// housemates can see it. Server side, so it works the same everywhere and the photo stays private (signed links).
import { NextRequest, NextResponse } from 'next/server'
import { requireSignedIn } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { profileFor, saveAnswers, savePhoto, removePhoto, saveAvatar, MAX_PHOTO } from '@/lib/housemates/profile'
import { parseAvatar, avatarValue } from '@/lib/housemates/avatar'

export const dynamic = 'force-dynamic'
const who = async (req: NextRequest) => { const c = await requireSignedIn(req); return c && c.role === 'tenant' ? c : null }
const no = () => NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })

export async function GET(req: NextRequest) {
  const c = await who(req); if (!c) return no()
  const p = await profileFor(createServiceClient() as any, c.personId, 1)
  const { data: me } = await (createServiceClient() as any).from('people').select('first_name').eq('id', c.personId).maybeSingle()
  return NextResponse.json({ ...p, firstName: me?.first_name ?? '' })
}

/** { answers?, visible?, avatar? ("🦊|sage" or null) } */
export async function POST(req: NextRequest) {
  const c = await who(req); if (!c) return no()
  const b = await req.json().catch(() => ({}))
  const s = createServiceClient() as any
  try {
    if (b.answers && typeof b.answers === 'object') await saveAnswers(s, c.personId, b.answers, b.visible !== false)
    else if (typeof b.visible === 'boolean') await s.from('tenant_icebreakers').upsert({ person_id: c.personId, visible_to_housemates: b.visible, updated_at: new Date().toISOString() }, { onConflict: 'person_id' })
    if ('avatar' in b) { const a = parseAvatar(b.avatar); await saveAvatar(s, c.personId, a ? avatarValue(a) : null) }
    return NextResponse.json({ ok: true })
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not save' }, { status: 400 }) }
}

/** a photo (the phone shrinks it first) */
export async function PUT(req: NextRequest) {
  const c = await who(req); if (!c) return no()
  const form = await req.formData().catch(() => null)
  const f = form?.get('photo')
  if (!(f instanceof Blob)) return NextResponse.json({ error: 'No photo' }, { status: 400 })
  if (f.size > MAX_PHOTO) return NextResponse.json({ error: 'That photo is too large.' }, { status: 413 })
  try {
    const s = createServiceClient() as any
    await savePhoto(s, c.personId, Buffer.from(await f.arrayBuffer()))
    return NextResponse.json({ ok: true, photoUrl: (await profileFor(s, c.personId, 1)).photoUrl })
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not save the photo' }, { status: 400 }) }
}

export async function DELETE(req: NextRequest) {
  const c = await who(req); if (!c) return no()
  await removePhoto(createServiceClient() as any, c.personId)
  return NextResponse.json({ ok: true })
}
