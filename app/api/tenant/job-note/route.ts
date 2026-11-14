// POST /api/tenant/job-note — a tenant adds a note and/or photos to a repair they can see (14 Nov 2026, Harry: "when
// Alice clicks on the job she has raised … there's nowhere for her to add notes or photographs on the job").
// multipart: ticketId, note, photos[] (up to 4). The note goes on the job's notes with the date and their first name;
// photos join the job's photos. The office is told, and the contractor if one is on it.
import { NextRequest, NextResponse } from 'next/server'
import { requireSignedIn } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'
import { activeTenantIds, insertNotifications } from '@/lib/serverNotify'
import { sendServerPush } from '@/lib/serverPush'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const MAX_BYTES = 3_500_000

function imageType(b: Buffer): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') return 'image/webp'
  if (b.subarray(4, 8).toString() === 'ftyp') return 'image/heic'
  return null
}

export async function POST(req: NextRequest) {
  const c = await requireSignedIn(req)
  if (!c || c.role !== 'tenant' || c.viewingAsBy) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'That didn’t send — try again.' }, { status: 400 })
  const ticketId = String(form.get('ticketId') ?? '')
  const note = String(form.get('note') ?? '').trim().slice(0, 1000)
  const files = form.getAll('photos').filter((f): f is File => f instanceof File).slice(0, 4)
  if (!note && !files.length) return NextResponse.json({ error: 'Write a note or add a photo first.' }, { status: 400 })
  const s = createServiceClient() as any
  const { data: t } = await s.from('maintenance_tickets').select('id, title, notes, property_id, reporter_id, contractor_id, status').eq('id', ticketId).maybeSingle()
  if (!t) return NextResponse.json({ error: 'That job wasn’t found.' }, { status: 404 })
  const living = await activeTenantIds(s, t.property_id).catch(() => [] as string[])
  if (t.reporter_id !== c.personId && !living.includes(c.personId)) return NextResponse.json({ error: 'This job isn’t at your property.' }, { status: 403 })
  if (['completed', 'cancelled'].includes(String(t.status))) return NextResponse.json({ error: 'This job is closed — report it again if it’s come back.' }, { status: 409 })

  let saved = 0, failed = 0
  for (const f of files) {
    try {
      if (f.size > MAX_BYTES) { failed++; continue }
      const bytes = Buffer.from(await f.arrayBuffer())
      const type = imageType(bytes)
      if (!type) { failed++; continue }
      const path = `${t.id}/${Date.now()}-tenant-${saved}.${type.split('/')[1].replace('jpeg', 'jpg')}`
      const { error: up } = await s.storage.from('maintenance-photos').upload(path, bytes, { contentType: type })
      if (up) { failed++; continue }
      const url = s.storage.from('maintenance-photos').getPublicUrl(path).data.publicUrl
      await s.from('attachments').insert({ ticket_id: t.id, attachment_type: 'photo', file_name: 'photo from tenant', file_path: path, file_size: bytes.length, storage_url: url, uploaded_by: c.userId })
      saved++
    } catch { failed++ }
  }
  const { data: me } = await s.from('people').select('first_name').eq('id', c.personId).maybeSingle()
  const when = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'Europe/London' })
  const line = `${when} — ${me?.first_name ?? 'Tenant'} added${note ? `: ${note}` : ''}${saved ? `${note ? ' ' : ' '}(${saved} photo${saved === 1 ? '' : 's'})` : ''}`
  await s.from('maintenance_tickets').update({ notes: [t.notes, line].filter(Boolean).join('\n') }).eq('id', t.id)

  const { data: office } = await s.from('people').select('id').eq('role', 'administrator')
  await insertNotifications(s, ((office ?? []) as any[]).map(o => o.id), { title: `Tenant added to “${String(t.title).split(' — ')[0].slice(0, 40)}”`, body: line, type: 'maintenance', link: `/admin/maintenance?ticket=${t.id}` } as any).catch(() => null)
  // the contractor in their app and on their phone — not a text for every note
  if (t.contractor_id) {
    await insertNotifications(s, [t.contractor_id], { title: 'The tenant added to your job', body: line.slice(0, 200), type: 'maintenance', link: `/contractor/job/${t.id}` } as any).catch(() => null)
    await sendServerPush({ personId: t.contractor_id, title: 'The tenant added to your job', body: line.slice(0, 160), url: `/contractor/job/${t.id}`, tag: `job-${t.id}` } as any).catch(() => 0)
  }
  return NextResponse.json({ ok: true, photosSaved: saved, photosFailed: failed })
}
