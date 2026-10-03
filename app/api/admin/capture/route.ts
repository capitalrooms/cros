/**
 * /api/admin/capture — the capture inbox (migration 204): photos and paperwork from the office's phones.
 *   GET                                   → { items (waiting), recent (filed), properties, company, keys }
 *   GET ?file=<itemId>                    → { url, name, mime } a short-lived link to the original (e.g. for the AI Doc Scanner)
 *   POST { action: 'upload_url', fileName, mime, size }          → { itemId, path, token }  upload straight to storage
 *   POST { action: 'look', id, thumb? (base64 jpeg) }            → { guess }   quick, cheap: what is it, which property
 *   POST { action: 'read', id, kind: 'safety_sheet'|'bill' }     → { rows | bill }   the full read, to check before filing
 *   POST { action: 'file', id, kind, propertyId?, roomId?, title, rows?, bill?, asExpense? }  → files it
 *   POST { action: 'discard', id } | { action: 'handed_to_scanner', id }
 *   POST { action: 'new_key', label? } → { key } (shown once)  |  { action: 'revoke_key', keyId }
 * Administrators only.
 */
import crypto from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import { createServiceClient } from '@/lib/supabase'
import { sortPropertiesNumerically } from '@/lib/sortProperties'
import { quickLook, readSheet, readBill, CAPTURE_KINDS, type CaptureKind, type SheetRow } from '@/lib/capture/ai'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const BUCKET = 'capture'
type S = ReturnType<typeof createServiceClient>
const missing = (e: { message?: string } | null) => !!e && /capture|company_documents|does not exist|schema cache|Bucket not found/i.test(e.message ?? '')
const firstLine = (v: unknown) => String(v ?? '').split('\n')[0].trim()
const isDate = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ''))
const safeName = (n: string) => n.replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '-').slice(-80) || 'file'

async function original(s: S, item: any): Promise<{ bytes: Buffer; mime: string }> {
  const { data, error } = await s.storage.from(BUCKET).download(item.file_path)
  if (error || !data) throw new Error(`Could not open the file: ${error?.message ?? 'missing'}`)
  return { bytes: Buffer.from(await data.arrayBuffer()), mime: item.mime || data.type || 'application/octet-stream' }
}
async function propertyList(s: S) {
  const { data } = await s.from('properties').select('id, name, address, property_code, letting_type')
  return sortPropertiesNumerically((data ?? []) as any[]).map((p: any) => ({ id: p.id, name: firstLine(p.name), address: String(p.address ?? '').replace(/\n/g, ', '), code: p.property_code, letOnly: p.letting_type === 'let_only' }))
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Administrators only' }, { status: 403 })
  const s = createServiceClient()
  const fileId = req.nextUrl.searchParams.get('file')
  if (fileId) {
    const { data: it } = await s.from('capture_items').select('*').eq('id', fileId).maybeSingle() as { data: any }
    const { data: doc } = it ? { data: null } : await s.from('company_documents').select('*').eq('id', fileId).maybeSingle() as { data: any }
    const row = it ?? doc
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const { data: signed } = await s.storage.from(BUCKET).createSignedUrl(row.file_path, 600)
    return NextResponse.json({ url: signed?.signedUrl ?? null, name: row.file_name, mime: row.mime })
  }
  const [{ data: items, error }, { data: recent }, { data: company }, { data: keys }, properties, { data: rooms }] = await Promise.all([
    s.from('capture_items').select('*').eq('status', 'new').order('created_at', { ascending: false }).limit(100),
    s.from('capture_items').select('id, file_name, kind, filed_to, filed_at, property_id, properties(name)').eq('status', 'filed').order('filed_at', { ascending: false }).limit(15),
    s.from('company_documents').select('*').is('deleted_at', null).order('received_on', { ascending: false }).limit(100),
    s.from('capture_keys').select('id, label, created_at, last_used_at').eq('person_id', admin.personId).is('revoked_at', null),
    propertyList(s),
    s.from('rooms').select('id, name, property_id').order('name'),
  ]) as any[]
  if (error) return NextResponse.json(missing(error) ? { setupNeeded: true, items: [], recent: [], company: [], keys: [], properties, rooms: rooms ?? [], kinds: CAPTURE_KINDS } : { error: error.message }, { status: missing(error) ? 200 : 500 })
  const paths = ((items ?? []) as any[]).map(i => i.file_path)
  const { data: signed } = paths.length ? await s.storage.from(BUCKET).createSignedUrls(paths, 3600) : { data: [] as any[] }
  const url = new Map(((signed ?? []) as any[]).map(x => [x.path, x.signedUrl]))
  const { data: csigned } = (company ?? []).length ? await s.storage.from(BUCKET).createSignedUrls((company as any[]).map(c => c.file_path), 3600) : { data: [] as any[] }
  const curl = new Map(((csigned ?? []) as any[]).map(x => [x.path, x.signedUrl]))
  return NextResponse.json({
    items: ((items ?? []) as any[]).map(i => ({ ...i, url: url.get(i.file_path) ?? null })),
    recent: ((recent ?? []) as any[]).map(r => ({ id: r.id, name: r.file_name, kind: CAPTURE_KINDS[r.kind as CaptureKind] ?? r.kind, at: r.filed_at, property: firstLine(r.properties?.name) || null, filedTo: r.filed_to })),
    company: ((company ?? []) as any[]).map(c => ({ ...c, url: curl.get(c.file_path) ?? null })),
    keys: keys ?? [],
    properties, rooms: rooms ?? [], kinds: CAPTURE_KINDS,
  })
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Administrators only' }, { status: 403 })
  const b = await req.json().catch(() => ({}))
  const s = createServiceClient()

  // ── upload ──
  if (b.action === 'upload_url') {
    const name = safeName(String(b.fileName ?? 'file'))
    const path = `${admin.personId}/${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${name}`
    const { data: up, error: uErr } = await s.storage.from(BUCKET).createSignedUploadUrl(path)
    if (uErr || !up) return NextResponse.json({ error: missing(uErr) ? 'Run migration 204 first' : uErr?.message ?? 'Could not start the upload' }, { status: 400 })
    const { data: it, error } = await s.from('capture_items').insert({ uploaded_by: admin.personId, source: b.source === 'desktop' ? 'desktop' : 'phone', file_path: path, file_name: String(b.fileName ?? name).slice(0, 200), mime: String(b.mime ?? '') || null, size_bytes: Number(b.size) || null }).select('id').single()
    if (error) return NextResponse.json({ error: missing(error) ? 'Run migration 204 first' : error.message }, { status: 400 })
    return NextResponse.json({ itemId: it.id, path, token: up.token })
  }

  // ── keys for the iPhone shortcut ──
  if (b.action === 'new_key') {
    const key = `cros_${crypto.randomBytes(24).toString('base64url')}`
    const { error } = await s.from('capture_keys').insert({ person_id: admin.personId, key_hash: crypto.createHash('sha256').update(key).digest('hex'), label: String(b.label ?? 'iPhone').slice(0, 60) })
    return error ? NextResponse.json({ error: missing(error) ? 'Run migration 204 first' : error.message }, { status: 400 }) : NextResponse.json({ key })
  }
  if (b.action === 'revoke_key') {
    await s.from('capture_keys').update({ revoked_at: new Date().toISOString() }).eq('id', String(b.keyId ?? '')).eq('person_id', admin.personId)
    return NextResponse.json({ ok: true })
  }

  const { data: item } = await s.from('capture_items').select('*').eq('id', String(b.id ?? '')).maybeSingle() as { data: any }
  if (!item) return NextResponse.json({ error: 'That item has gone' }, { status: 404 })
  const done = async (kind: string, filedTo: string, extra: Record<string, unknown> = {}) => {
    await s.from('capture_items').update({ status: 'filed', kind, filed_to: filedTo, filed_at: new Date().toISOString(), filed_by: admin.personId, ...extra }).eq('id', item.id)
  }

  if (b.action === 'discard') { await s.from('capture_items').update({ status: 'discarded' }).eq('id', item.id); return NextResponse.json({ ok: true }) }
  if (b.action === 'handed_to_scanner') { await done('certificate', 'ai-upload'); return NextResponse.json({ ok: true }) }

  // ── quick look (cheap): a small copy from the phone, or the file itself when small ──
  if (b.action === 'look') {
    try {
      let bytes: Buffer, mime: string
      if (typeof b.thumb === 'string' && b.thumb.length > 100) { bytes = Buffer.from(b.thumb.replace(/^data:[^,]+,/, ''), 'base64'); mime = 'image/jpeg' }
      else {
        const o = await original(s, item)
        if (o.bytes.length > 4_500_000) return NextResponse.json({ guess: null, note: 'Too big for a quick look — choose what it is' })
        bytes = o.bytes; mime = o.mime
      }
      const props = (await propertyList(s)).map(p => ({ id: p.id, label: [p.name, p.address].filter(Boolean).join(', ') }))
      const guess = await quickLook(bytes, mime, props)
      await s.from('capture_items').update({ guess }).eq('id', item.id)
      return NextResponse.json({ guess })
    } catch (e) { return NextResponse.json({ guess: null, note: e instanceof Error ? e.message : 'Quick look failed' }) }
  }

  // ── full read, to check before filing ──
  if (b.action === 'read') {
    try {
      const o = await original(s, item)
      if (b.kind === 'safety_sheet') return NextResponse.json(await readSheet(o.bytes, o.mime, new Date().getFullYear()))
      if (b.kind === 'bill') return NextResponse.json({ bill: await readBill(o.bytes, o.mime) })
      return NextResponse.json({ error: 'Nothing to read for that' }, { status: 400 })
    } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not read it' }, { status: 500 }) }
  }

  // ── file it ──
  if (b.action === 'file') {
    const kind = String(b.kind ?? '') as CaptureKind
    if (!(kind in CAPTURE_KINDS)) return NextResponse.json({ error: 'Choose what it is' }, { status: 400 })
    const title = String(b.title ?? '').trim().slice(0, 200) || item.file_name
    const propertyId = b.propertyId ? String(b.propertyId) : null
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })

    if (kind === 'company_post' || (!propertyId && ['letter', 'bill', 'receipt', 'other'].includes(kind))) {
      const category = kind === 'bill' ? 'bill' : kind === 'receipt' ? 'receipt' : 'post'
      const { data: doc, error } = await s.from('company_documents').insert({ title, category, file_path: item.file_path, file_name: item.file_name, mime: item.mime, received_on: isDate(b.receivedOn) ? b.receivedOn : today, notes: String(b.notes ?? '').slice(0, 2000) || null, created_by: admin.personId }).select('id').single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      await done(kind, `company_documents:${doc.id}`)
      return NextResponse.json({ ok: true, filedTo: 'Company post' })
    }
    if (!propertyId) return NextResponse.json({ error: 'Choose the property' }, { status: 400 })
    const { data: prop } = await s.from('properties').select('id, name').eq('id', propertyId).maybeSingle()
    if (!prop) return NextResponse.json({ error: 'Property not found' }, { status: 404 })
    const o = await original(s, item)
    const ext = (item.file_name.split('.').pop() || (o.mime.includes('pdf') ? 'pdf' : 'jpg')).toLowerCase().slice(0, 5)

    if (kind === 'room_photo' || kind === 'property_photo') {
      const path = `property-photos/${propertyId}/${Date.now()}.${ext}`
      const { error: upErr } = await s.storage.from('property-photos').upload(path, o.bytes, { contentType: o.mime || 'image/jpeg', upsert: false })
      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
      const { data: pub } = s.storage.from('property-photos').getPublicUrl(path)
      const { data: ph, error } = await s.from('property_photos').insert({
        property_id: propertyId, room_id: kind === 'room_photo' && b.roomId ? b.roomId : null, file_name: item.file_name, file_path: path,
        file_size: o.bytes.length, file_type: o.mime, file_url: pub.publicUrl, caption: title, is_marketing: false, created_by: admin.personId,
      }).select('id').single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      await done(kind, `property_photos:${ph.id}`, { property_id: propertyId, room_id: kind === 'room_photo' ? b.roomId || null : null })
      return NextResponse.json({ ok: true, filedTo: `${firstLine(prop.name)} › Photos` })
    }

    if (kind === 'certificate') return NextResponse.json({ error: 'Certificates go through the AI Doc Scanner so their dates update the property — use “Read it in the scanner”' }, { status: 400 })

    // a document on the property: letter, bill, receipt, sheet, other
    const docType = kind === 'letter' ? 'correspondence' : kind === 'bill' ? 'utility_bill' : kind === 'receipt' ? 'receipt' : kind === 'safety_sheet' ? 'safety_check_sheet' : 'other'
    const path = `capture/${propertyId}/${Date.now()}-${safeName(item.file_name)}`
    const { error: upErr } = await s.storage.from('property-documents').upload(path, o.bytes, { contentType: o.mime || 'application/octet-stream', upsert: false })
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
    const { data: pub } = s.storage.from('property-documents').getPublicUrl(path)
    const bill = b.bill && typeof b.bill === 'object' ? b.bill : null
    const description = [title, bill ? [bill.supplier, bill.amount ? `£${Number(bill.amount).toFixed(2)}` : '', bill.period_from && bill.period_to ? `${bill.period_from} to ${bill.period_to}` : '', bill.account_number ? `account ${bill.account_number}` : '', bill.direct_debit ? 'direct debit' : ''].filter(Boolean).join(' · ') : ''].filter(Boolean).join(' — ')
    const { data: doc, error } = await s.from('property_documents').insert({ property_id: propertyId, document_type: docType, file_name: item.file_name, storage_url: pub.publicUrl, file_size: o.bytes.length, description: description.slice(0, 1000), uploaded_by: admin.personId, visible_to_tenants: false }).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    let note = `${firstLine(prop.name)} › Documents`
    if (kind === 'safety_sheet') {
      const rows = (Array.isArray(b.rows) ? b.rows : []) as SheetRow[]
      const good = rows.filter(r => isDate(r.date) && (r.check === 'smoke_alarm' || r.check === 'fire_door'))
      // skip checks already on record for that day
      const { data: have } = await s.from('compliance_logs').select('check_type, checked_date').eq('property_id', propertyId)
      const seen = new Set(((have ?? []) as any[]).map(h => `${h.check_type}|${String(h.checked_date).slice(0, 10)}`))
      const fresh = good.filter(r => !seen.has(`${r.check}|${r.date}`))
      if (fresh.length) {
        const { error: lErr } = await s.from('compliance_logs').insert(fresh.map(r => ({
          property_id: propertyId, check_type: r.check, checked_by: admin.personId, checked_by_role: 'sheet', checked_date: r.date, source_document_id: doc.id,
          notes: [r.result === 'fault' ? '⚠ Fault noted' : r.result === 'unclear' ? 'Result unclear on the sheet' : 'OK', r.location, r.checked_by ? `checked by ${r.checked_by}` : '', r.notes, '(from a photographed sheet)'].filter(Boolean).join(' · '),
        })))
        if (lErr) return NextResponse.json({ error: `The photo is filed, but the checks didn’t save: ${lErr.message}` }, { status: 400 })
      }
      note = `${fresh.length} check${fresh.length === 1 ? '' : 's'} added to ${firstLine(prop.name)}${good.length - fresh.length ? ` (${good.length - fresh.length} already on record)` : ''}; the photo is kept in its documents`
    }
    await done(kind, `property_documents:${doc.id}`, { property_id: propertyId })
    return NextResponse.json({ ok: true, filedTo: note, documentId: doc.id })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
