// /api/portal-docs/<token> — the landlord's Rightmove documents page (lib/portalDocs, migration 282). The token is the key.
//   GET                                                  → { address, landlord, done: { letter, ownership, id }, ownershipType, completed }
//   POST { action: 'start', doc, contentType, size }     → { path, uploadToken, bucket } — the file goes straight to storage
//   POST { action: 'confirm', doc, path, ownershipType? } → recorded (ID and ownership papers encrypted where they sit)
//   POST { action: 'sign', name, signature (PNG data URL), agree } → the letter, signed on screen, saved as a PDF
//   POST { action: 'submit' }                            → done: the office is told
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { requestByToken, BUCKET, DOC_TYPES, COLUMN, folderFor, OWNERSHIP_TYPES, letterPdf } from '@/lib/portalDocs'
import { sealStoredFile } from '@/lib/files/fileCrypt'
import { deliverEmail } from '@/lib/sendEmail'
import { buildEmail } from '@/lib/emailWrapper'
import { OFFICE_ALERT_EMAIL, officeButton } from '@/lib/email/office'
import { insertNotifications } from '@/lib/serverNotify'

export const dynamic = 'force-dynamic'
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }
const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const nope = () => NextResponse.json({ error: 'This link isn’t valid any more — please ask Capital Rooms for a new one.' }, { status: 404 })

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const s = createServiceClient()
  const r = await requestByToken(s as any, (await params).token)
  if (!r) return nope()
  return NextResponse.json({ address: r.address, landlord: r.landlord, ownershipType: r.row.ownership_type, completed: r.row.status === 'completed',
    done: { letter: !!r.row.letter_path, ownership: !!r.row.ownership_path, id: !!r.row.id_path } })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token
  const s = createServiceClient()
  const r = await requestByToken(s as any, token)
  if (!r) return nope()
  if (r.row.status === 'completed') return NextResponse.json({ error: 'These documents have already been sent — thank you.' }, { status: 409 })
  const b = await req.json().catch(() => ({}))
  const doc = String(b.doc ?? '') as 'letter' | 'ownership' | 'id'

  if (b.action === 'start') {
    if (!DOC_TYPES[doc]) return NextResponse.json({ error: 'Unknown document' }, { status: 400 })
    const ct = String(b.contentType ?? ''), size = Number(b.size ?? 0)
    if (!TYPES.includes(ct)) return NextResponse.json({ error: 'Please upload a photo (JPEG, PNG) or a PDF' }, { status: 400 })
    if (!size || size > 20 * 1024 * 1024) return NextResponse.json({ error: 'Files must be under 20 MB' }, { status: 400 })
    const path = `${folderFor(token)}/${DOC_TYPES[doc]}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${EXT[ct]}`
    await s.storage.createBucket(BUCKET, { public: false }).catch(() => {})
    const { data, error } = await s.storage.from(BUCKET).createSignedUploadUrl(path)
    if (error || !data) return NextResponse.json({ error: 'Could not start the upload — please try again' }, { status: 500 })
    return NextResponse.json({ path: data.path, uploadToken: data.token, bucket: BUCKET })
  }

  if (b.action === 'confirm') {
    if (!DOC_TYPES[doc]) return NextResponse.json({ error: 'Unknown document' }, { status: 400 })
    const path = String(b.path ?? '')
    if (!path.startsWith(`${folderFor(token)}/${DOC_TYPES[doc]}_`)) return NextResponse.json({ error: 'Invalid upload' }, { status: 400 })
    const name = path.slice(path.lastIndexOf('/') + 1)
    const { data: found } = await s.storage.from(BUCKET).list(folderFor(token), { search: name, limit: 1 })
    if (!found?.some(f => f.name === name)) return NextResponse.json({ error: 'The file didn’t finish uploading — please try again' }, { status: 400 })
    await sealStoredFile(BUCKET, path).catch(e => console.error('[portal-docs] could not encrypt', e?.message))
    const upd: Record<string, unknown> = { [COLUMN[doc]]: path }
    if (doc === 'ownership' && OWNERSHIP_TYPES.some(t => t.key === b.ownershipType)) upd.ownership_type = b.ownershipType
    const { error } = await s.from('portal_authority_requests').update(upd).eq('id', r.row.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (b.action === 'sign') {
    const name = String(b.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 120)
    const m = String(b.signature ?? '').match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/)
    if (name.length < 3 || !/\s/.test(name)) return NextResponse.json({ error: 'Please type your full name' }, { status: 400 })
    if (!m || m[1].length > 400_000) return NextResponse.json({ error: 'Please sign in the box' }, { status: 400 })
    if (b.agree !== true) return NextResponse.json({ error: 'Please tick to confirm' }, { status: 400 })
    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
    const ua = String(req.headers.get('user-agent') ?? '')
    const device = /iPhone/.test(ua) ? 'an iPhone' : /iPad/.test(ua) ? 'an iPad' : /Android/.test(ua) ? 'an Android phone' : /Mac OS/.test(ua) ? 'a Mac' : /Windows/.test(ua) ? 'a Windows computer' : ''
    const pdf = await letterPdf({ landlord: name, address: r.address, signed: { png: Buffer.from(m[1], 'base64'), name, at: new Date(), ip, device } })
    const path = `${folderFor(token)}/${DOC_TYPES.letter}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.pdf`
    await s.storage.createBucket(BUCKET, { public: false }).catch(() => {})
    const { error: upErr } = await s.storage.from(BUCKET).upload(path, pdf, { contentType: 'application/pdf', upsert: false })
    if (upErr) return NextResponse.json({ error: 'Couldn’t save the signed letter — please try again' }, { status: 500 })
    await sealStoredFile(BUCKET, path).catch(e => console.error('[portal-docs] could not encrypt', e?.message))
    const { error } = await s.from('portal_authority_requests').update({ letter_path: path }).eq('id', r.row.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (b.action === 'submit') {
    const { data: now } = await s.from('portal_authority_requests').select('letter_path, ownership_path, id_path').eq('id', r.row.id).single() as { data: any }
    if (!now?.letter_path || !now?.ownership_path || !now?.id_path) return NextResponse.json({ error: 'Please add all three — the signed letter, proof of ownership and photo ID.' }, { status: 400 })
    await s.from('portal_authority_requests').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', r.row.id)
    const subject = `Rightmove advertising info in: ${r.landlord || 'landlord'} — ${r.address.split(',')[0]}`
    await deliverEmail({ to: [OFFICE_ALERT_EMAIL], subject, html: await buildEmail(`<p><b>${esc(r.landlord || 'The landlord')}</b> has sent the signed letter of authority, proof of ownership and photo ID for <b>${esc(r.address)}</b>.</p><p>They’re on the property’s Lettings tab, ready to upload to OpenRent for Rightmove.</p>${officeButton(`/admin/properties/${r.row.property_id}?tab=lettings`, 'Open the property')}`, { kind: 'office-visit-booked', signature: false }) }).catch(() => null)
    const { data: admins } = await s.from('people').select('id').in('role', ['administrator', 'lettings'])
    if (admins?.length) await insertNotifications(s, (admins as any[]).map(a => a.id), { title: 'Rightmove advertising info in', body: `${r.landlord || 'The landlord'} — ${r.address}`, type: 'lettings', link: `/admin/properties/${r.row.property_id}?tab=lettings` }, { propertyId: r.row.property_id }).catch(() => null)
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
