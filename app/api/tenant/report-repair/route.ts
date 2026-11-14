// A tenant's repair report, saved in one go (9 Nov 2026, Harry: "wired really well in case we go live"). The job and its
// photos are saved on the server, so it either goes through whole or the tenant is told clearly and can try again
// (the form keeps a draft on the phone). The house and room come from the tenancy running today, never from the browser.
import { NextRequest, NextResponse } from 'next/server'
import { requireSignedIn } from '@/lib/portalAuth'
import { createServiceClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const PRIORITIES = ['emergency', 'high', 'medium', 'low']
const MAX_PHOTOS = 6, MAX_BYTES = 3_500_000

function imageType(b: Buffer): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') return 'image/webp'
  if (b.subarray(4, 8).toString() === 'ftyp') return 'image/heic'
  return null
}

export async function POST(req: NextRequest) {
  const c = await requireSignedIn(req)
  if (!c) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'That didn’t send. Please try again.' }, { status: 400 })
  const str = (k: string, max: number) => String(form.get(k) ?? '').trim().slice(0, max)
  const title = str('title', 200), description = str('description', 6000), category = str('category', 80), location = str('location', 80)
  const priority = PRIORITIES.includes(str('priority', 20)) ? str('priority', 20) : 'low'
  if (description.length < 6 || !title) return NextResponse.json({ error: 'Please describe the problem in a few words.' }, { status: 400 })

  const s = createServiceClient() as any
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  const { data: t } = await s.from('tenancies').select('property_id, room_id').or(`person_id.eq.${c.personId},co_tenant_id.eq.${c.personId}`)
    .is('let_cancelled_at', null).lte('start_date', today).or(`end_date.is.null,end_date.gte.${today}`).order('start_date', { ascending: false }).limit(1).maybeSingle()
  const { data: me } = t ? { data: null } : await s.from('people').select('property_id, room_id').eq('id', c.personId).maybeSingle()
  const propertyId = t?.property_id ?? me?.property_id
  if (!propertyId) return NextResponse.json({ error: 'We couldn’t find your home on our system. Please call us on 0207 112 9163.' }, { status: 400 })

  // a double tap (or a retry after a slow network) mustn't make two jobs
  const since = new Date(Date.now() - 10 * 60_000).toISOString()
  const { data: dup } = await s.from('maintenance_tickets').select('id').eq('reporter_id', c.personId).eq('description', description).gte('created_at', since).limit(1).maybeSingle()
  if (dup) return NextResponse.json({ ok: true, ticketId: dup.id, duplicate: true })

  const { data: ticket, error } = await s.from('maintenance_tickets').insert({
    reporter_id: c.personId, title, description, category, location, priority, status: 'reported',
    property_id: propertyId, room_id: t?.room_id ?? me?.room_id ?? null,
  }).select('id').single()
  if (error || !ticket) return NextResponse.json({ error: 'That didn’t save. Please try again in a moment.' }, { status: 500 })
  // "Come in any time — I don't need 24 hours' notice" (14 Nov 2026): lets the contractor go straight into the room
  // when booked at short notice (lib/access/arrival). Kept separate so the job saves before migration 289.
  if (form.get('anyTime') === 'yes') await s.from('maintenance_tickets').update({ tenant_access_any_time: true, tenant_access_any_time_at: new Date().toISOString() }).eq('id', ticket.id).then(() => null, () => null)

  // photos: checked to really be images, kept with the job
  let saved = 0, failed = 0
  const files = form.getAll('photos').filter((f): f is File => f instanceof File).slice(0, MAX_PHOTOS)
  for (const f of files) {
    try {
      if (f.size > MAX_BYTES) { failed++; continue }
      const bytes = Buffer.from(await f.arrayBuffer())
      const type = imageType(bytes)
      if (!type) { failed++; continue }
      const isLabel = f.name.startsWith('label-')
      const path = `${ticket.id}/${Date.now()}-${saved}.${type.split('/')[1].replace('jpeg', 'jpg')}`
      const { error: up } = await s.storage.from('maintenance-photos').upload(path, bytes, { contentType: type })
      if (up) { failed++; continue }
      const url = s.storage.from('maintenance-photos').getPublicUrl(path).data.publicUrl
      await s.from('attachments').insert({ ticket_id: ticket.id, attachment_type: 'photo', file_name: isLabel ? '[appliance label] photo' : 'photo', file_path: path, file_size: bytes.length, storage_url: url, uploaded_by: c.userId })
      saved++
    } catch { failed++ }
  }
  return NextResponse.json({ ok: true, ticketId: ticket.id, photosSaved: saved, photosFailed: failed })
}
